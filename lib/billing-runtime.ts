import {env} from 'cloudflare:workers';
import {billingOrigin} from './public-origin-runtime';
import {getRawDb} from '../db';
import {readPlatformBilling} from './platform-billing';
import {billing,type BillingConfig} from './billing';
import {paymentDataKey} from './payment-runtime';
import type {Plan} from './plan-requests';
import {billingSelection,type BillingSelection} from './billing-selection';
import type {Identity} from './service';
type BillingContext={userId?:string;existing?:boolean;priceId?:string|null;portal?:'brand'|'agency'};
export async function billingConfig(plan:Plan='starter',context:BillingContext={}):Promise<BillingConfig>{
  const db=getRawDb(),selected:BillingSelection=context.userId?await billingSelection(db,context.userId,plan,!!context.existing,context.priceId):{plan,portal:context.portal||'brand'},values=env as unknown as Record<string,unknown>,get=(key:string)=>typeof values[key]==='string'?values[key] as string:undefined;
  const fallback:BillingConfig={...selected,origin:billingOrigin(),secret:get('AFFIMARO_BILLING_STRIPE_KEY'),platformId:get('AFFIMARO_BILLING_ACCOUNT_ID'),priceId:selected.priceId||(selected.portal==='brand'?get(({starter:'AFFIMARO_STARTER_PRICE_ID',growth:'AFFIMARO_GROWTH_PRICE_ID',business:'AFFIMARO_BUSINESS_PRICE_ID'})[selected.plan]):undefined),mode:get('AFFIMARO_BILLING_MODE')==='live'?'live':'test',liveEnabled:get('AFFIMARO_BILLING_LIVE_ENABLED')==='true',required:get('AFFIMARO_BILLING_REQUIRED')!=='false'};
  return readPlatformBilling(db,paymentDataKey(),selected.plan,billingOrigin(),fallback);
}
export async function requireBusinessSubscription(identity:Identity){const db=getRawDb(),selection=await billingSelection(db,identity.userId,undefined,true);return billing(db,identity,await billingConfig(selection.plan,{userId:identity.userId,existing:true}),paymentDataKey()).ensureEntitlement();}
export async function currentBillingPlan(userId:string):Promise<Plan>{return (await billingSelection(getRawDb(),userId,undefined,true)).plan;}
