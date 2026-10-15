import {z} from 'zod';
import {AppError} from './service.ts';
export const SHOPIFY_VERSION='2026-10';
export const shopDomainSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/,'Use your exact shop-name.myshopify.com domain, without a path.');
const money=z.object({shopMoney:z.object({amount:z.string().regex(/^\d+(?:\.\d+)?$/),currencyCode:z.string().regex(/^[A-Z]{3}$/)})});
const pageInfo=z.object({hasNextPage:z.boolean(),endCursor:z.string().nullable()});
const visit=z.object({id:z.string().min(1).max(200),occurredAt:z.string().datetime({offset:true}),referralCode:z.string().nullable(),utmParameters:z.object({source:z.string().nullable(),medium:z.string().nullable(),campaign:z.string().nullable(),content:z.string().nullable()}).nullable()});
export const shopifyOrderSchema=z.object({
  id:z.string().regex(/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,19}$/),createdAt:z.string().datetime({offset:true}),updatedAt:z.string().datetime({offset:true}),test:z.boolean(),cancelledAt:z.string().nullable(),displayFinancialStatus:z.string(),currencyCode:z.string().regex(/^[A-Z]{3}$/),taxesIncluded:z.boolean(),subtotalPriceSet:money.nullable(),currentSubtotalPriceSet:money,
  lineItems:z.object({nodes:z.array(z.object({taxLines:z.array(z.object({priceSet:money}))})),pageInfo}),
  refunds:z.array(z.object({totalRefundedSet:money,refundLineItems:z.object({nodes:z.array(z.object({subtotalSet:money,totalTaxSet:money})),pageInfo}),refundShippingLines:z.object({nodes:z.array(z.object({subtotalAmountSet:money,taxAmountSet:money})),pageInfo})})),
  customerJourneySummary:z.object({ready:z.boolean(),moments:z.object({nodes:z.array(z.object({__typename:z.string()}).passthrough()),pageInfo})}).nullable(),
});
export type ShopifyOrder=z.output<typeof shopifyOrderSchema>;
export class ShopifyReview extends AppError{constructor(message:string){super(409,message);}}
// ISO 4217 minor-unit exceptions; all other Shopify fiat currency codes use two.
const zero=new Set('BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF'.split(' '));
const three=new Set('BHD IQD JOD KWD LYD OMR TND'.split(' '));
export function currencyDecimals(code:string){return zero.has(code)?0:three.has(code)?3:['CLF','UYW'].includes(code)?4:2;}
export function minorUnits(value:string,decimals:number){
  const match=/^(\d+)(?:\.(\d+))?$/.exec(value);if(!match)throw new ShopifyReview('Unsupported monetary value.');
  const fraction=match[2]||'';if(/[1-9]/.test(fraction.slice(decimals)))throw new ShopifyReview('Currency precision requires review.');
  const result=BigInt(match[1]+fraction.slice(0,decimals).padEnd(decimals,'0'));if(result>BigInt(1_000_000_000_000))throw new ShopifyReview('Order amount exceeds the pilot limit.');return Number(result);
}
export function sourceRevision(value:string){
  const ms=Date.parse(value),extra=Number((/\.(\d+)/.exec(value)?.[1]||'').padEnd(6,'0').slice(3,6));
  const revision=ms*1000+extra;if(!Number.isFinite(ms)||ms<0||!Number.isSafeInteger(revision))throw new ShopifyReview('Invalid order revision.');return revision;
}
export function normalizeShopifyOrder(input:unknown){
  const parsed=shopifyOrderSchema.safeParse(input);if(!parsed.success)throw new ShopifyReview('Shopify returned an incomplete order.');const o=parsed.data;
  if(o.test)return {test:true as const,order:o};
  if(o.lineItems.pageInfo.hasNextPage||o.refunds.some(r=>r.refundLineItems.pageInfo.hasNextPage||r.refundShippingLines.pageInfo.hasNextPage))throw new ShopifyReview('Order needs a larger-item adapter. No commission was imported.');
  const decimals=currencyDecimals(o.currencyCode),amount=(bag:z.output<typeof money>)=>{if(bag.shopMoney.currencyCode!==o.currencyCode)throw new ShopifyReview('Mixed shop currencies require review.');return minorUnits(bag.shopMoney.amount,decimals);};
  if(!o.subtotalPriceSet)throw new ShopifyReview('Merchandise subtotal is unavailable.');
  const subtotal=amount(o.subtotalPriceSet),tax=o.lineItems.nodes.reduce((n,l)=>n+l.taxLines.reduce((v,t)=>v+amount(t.priceSet),0),0),basis=subtotal-(o.taxesIncluded?tax:0);if(basis<0)throw new ShopifyReview('Merchandise tax allocation requires review.');
  let refunded=0,refundedTax=0,review=false;
  for(const r of o.refunds){let allocated=0;for(const item of r.refundLineItems.nodes){const net=amount(item.subtotalSet),taxAmount=amount(item.totalTaxSet);refunded+=net;refundedTax+=taxAmount;allocated+=net+taxAmount;}for(const shipping of r.refundShippingLines.nodes)allocated+=amount(shipping.subtotalAmountSet)+amount(shipping.taxAmountSet);if(allocated!==amount(r.totalRefundedSet))review=true;}
  if(refunded>basis)review=true;
  if(amount(o.currentSubtotalPriceSet)!==subtotal-refunded-(o.taxesIncluded?refundedTax:0))review=true;
  const statuses:Record<string,string>={PAID:'processing',PARTIALLY_REFUNDED:'processing',PARTIALLY_PAID:'on-hold',AUTHORIZED:'pending',PENDING:'pending',REFUNDED:'refunded',VOIDED:'cancelled',EXPIRED:'failed'};
  const status=o.cancelledAt?'cancelled':statuses[o.displayFinancialStatus];if(!status)throw new ShopifyReview('Unknown financial status requires review.');
  return {test:false as const,order:o,snapshot:{kind:'order' as const,orderId:o.id.split('/').at(-1)!,revision:sourceRevision(o.updatedAt),createdAt:new Date(o.createdAt).toISOString(),currency:o.currencyCode,decimals,basis,refundedBasis:status==='refunded'?basis:Math.min(basis,refunded),status,refundUnallocated:status==='refunded'?false:review}};
}
export function referralCandidate(order:ShopifyOrder,programId:string,windowDays:number){
  const journey=order.customerJourneySummary;if(!journey?.ready)throw new ShopifyReview('Referral sessions are not ready yet.');if(journey.moments.pageInfo.hasNextPage)throw new ShopifyReview('Referral history needs a larger-session adapter.');
  const created=Date.parse(order.createdAt),candidates=[];
  for(const raw of journey.moments.nodes){if(raw.__typename!=='CustomerVisit')continue;const r=visit.safeParse(raw);if(!r.success)throw new ShopifyReview('Referral session data is incomplete.');const v=r.data,when=Date.parse(v.occurredAt);if(when>created||created-when>Math.min(30,windowDays)*86400000)continue;
    const ref=/^af_([a-f0-9-]{36})$/i.exec(v.referralCode||'');const utm=v.utmParameters;const appId=ref?.[1]||(utm?.source==='affimaro'&&utm.medium==='affiliate'&&utm.campaign===programId?utm.content:null);if(!appId||!z.string().uuid().safeParse(appId).success)continue;candidates.push({applicationId:appId.toLowerCase(),visitId:v.id,occurredAt:new Date(v.occurredAt).toISOString()});
  }
  return candidates.sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt))[0]||null;
}
const bag='shopMoney { amount currencyCode }';
export const ORDER_FIELDS=`id createdAt updatedAt test cancelledAt displayFinancialStatus currencyCode taxesIncluded subtotalPriceSet { ${bag} } currentSubtotalPriceSet { ${bag} } lineItems(first:50) { nodes { taxLines { priceSet { ${bag} } } } pageInfo { hasNextPage endCursor } } refunds { totalRefundedSet { ${bag} } refundLineItems(first:50) { nodes { subtotalSet { ${bag} } totalTaxSet { ${bag} } } pageInfo { hasNextPage endCursor } } refundShippingLines(first:20) { nodes { subtotalAmountSet { ${bag} } taxAmountSet { ${bag} } } pageInfo { hasNextPage endCursor } } } customerJourneySummary { ready moments(first:50) { nodes { __typename ... on CustomerVisit { id occurredAt referralCode utmParameters { source medium campaign content } } } pageInfo { hasNextPage endCursor } } }`;
