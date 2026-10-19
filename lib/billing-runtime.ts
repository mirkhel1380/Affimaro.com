import {env} from 'cloudflare:workers';
import {billingOrigin} from './public-origin-runtime';
import {getRawDb} from '../db';
import {readPlatformBilling} from './platform-billing';
import {billing,type BillingConfig} from './billing';
import {paymentDataKey} from './payment-runtime';
import {selectedPlan,type Plan} from './plan-requests';
import {platformBillingCatalog} from './platform-billing-catalog';
import type {Identity} from './service';
export async function billingConfig(plan:Plan='starter'):Promise<BillingConfig>{
  const values=env as unknown as Record<string,unknown>,get=(key:string)=>typeof values[key]==='string'?values[key] as string:undefined;
  const fallback:BillingConfig={plan,origin:billingOrigin(),secret:get('AFFIMARO_BILLING_STRIPE_KEY'),platformId:get('AFFIMARO_BILLING_ACCOUNT_ID'),priceId:get(({starter:'AFFIMARO_STARTER_PRICE_ID',growth:'AFFIMARO_GROWTH_PRICE_ID',business:'AFFIMARO_BUSINESS_PRICE_ID'})[plan]),mode:get('AFFIMARO_BILLING_MODE')==='live'?'live':'test',liveEnabled:get('AFFIMARO_BILLING_LIVE_ENABLED')==='true',required:get('AFFIMARO_BILLING_REQUIRED')!=='false'};
  return readPlatformBilling(getRawDb(),paymentDataKey(),plan,billingOrigin(),fallback);
}
export async function requireBusinessSubscription(identity:Identity){const db=getRawDb();return billing(db,identity,await billingConfig(await currentBillingPlan(identity.userId)),paymentDataKey()).ensureEntitlement();}

export async function currentBillingPlan(userId:string):Promise<Plan>{
 const row=await getRawDb().prepare("SELECT COALESCE((SELECT c.price_id FROM billing_checkouts c WHERE c.account_id=b.id AND c.state IN ('creating','open','review') ORDER BY c.rowid DESC LIMIT 1),b.price_id) AS price_id FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id WHERE w.owner_id=? AND b.platform_id=? ORDER BY CASE b.mode WHEN 'live' THEN 0 ELSE 1 END,b.updated_at DESC LIMIT 1").bind(userId,platformBillingCatalog.accountId).first<{price_id:string|null}>();
 return (Object.entries(platformBillingCatalog.prices).find(([,id])=>id===row?.price_id)?.[0] as Plan|undefined)||await selectedPlan(getRawDb(),userId);
}
