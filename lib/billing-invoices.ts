import {z} from 'zod';
import {AppError} from './service.ts';

export type BillingInvoice={id:string;number:string|null;created:number;status:'draft'|'open'|'paid'|'uncollectible'|'void';total:number;amountPaid:number;balance:number;paidAt:number|null;pdfUrl:string|null};
export type BillingInvoiceHistory={mode:'live'|'test';invoices:BillingInvoice[];hasMore:boolean};
const epoch=z.number().int().positive().max(253402300799),minor=z.number().int().safe();
const invoice=z.object({
 id:z.string().regex(/^in_[A-Za-z0-9]{6,160}$/),object:z.literal('invoice'),livemode:z.boolean(),customer:z.string(),currency:z.literal('usd'),
 parent:z.object({type:z.literal('subscription_details'),subscription_details:z.object({subscription:z.string()})}),
 number:z.string().max(256).nullable(),created:epoch,status:z.enum(['draft','open','paid','uncollectible','void']),total:minor,amount_paid:minor.nonnegative(),amount_remaining:minor,
 status_transitions:z.object({paid_at:epoch.nullable()}),invoice_pdf:z.string().max(4096).nullable(),
});

// Invoice links are bearer links. Only the provider's PDF endpoint is exposed;
// invoice payment pages, customer contact details and raw objects stay private.
export function invoicePdfUrl(value:string|null):string|null{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='pay.stripe.com'&&!url.port&&!url.username&&!url.password&&!url.hash&&/^\/invoice\/[A-Za-z0-9_/-]+\/pdf$/.test(url.pathname)?url.href:null;}catch{return null;}
}
export function subscriptionInvoices(value:unknown,scope:{customerId:string;subscriptionId:string;mode:'live'|'test'}):BillingInvoiceHistory{
 const list=z.object({object:z.literal('list'),data:z.array(invoice).max(10),has_more:z.boolean()}).safeParse(value);
 if(!list.success)throw new AppError(502,'Your invoice history could not be verified. Try again later.');
 const rows=list.data.data;
 if(new Set(rows.map(row=>row.id)).size!==rows.length||rows.some(row=>row.customer!==scope.customerId||row.parent.subscription_details.subscription!==scope.subscriptionId||row.livemode!==(scope.mode==='live')))throw new AppError(409,'The invoices do not match your saved subscription.');
 return {mode:scope.mode,hasMore:list.data.has_more,invoices:rows.map(row=>({id:row.id,number:row.number,created:row.created,status:row.status,total:row.total,amountPaid:row.amount_paid,balance:row.amount_remaining,paidAt:row.status_transitions.paid_at,pdfUrl:row.status==='draft'?null:invoicePdfUrl(row.invoice_pdf)})).sort((a,b)=>b.created-a.created)};
}
