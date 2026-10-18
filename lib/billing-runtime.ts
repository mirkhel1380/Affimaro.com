import {env} from 'cloudflare:workers';
import {publicOrigin} from './public-origin-runtime';
import {getRawDb} from '../db';
import {readPlatformBilling} from './platform-billing';
import {billing,type BillingConfig} from './billing';
import {paymentDataKey} from './payment-runtime';
import {activePlan,type Plan} from './plan-requests';
import type {Identity} from './service';
export async function billingConfig(plan:Plan='starter'):Promise<BillingConfig>{
  const values=env as unknown as Record<string,unknown>,get=(key:string)=>typeof values[key]==='string'?values[key] as string:undefined;
  const fallback:BillingConfig={plan,origin:publicOrigin(),secret:get('AFFIMARO_BILLING_STRIPE_KEY'),platformId:get('AFFIMARO_BILLING_ACCOUNT_ID'),priceId:get(({starter:'AFFIMARO_STARTER_PRICE_ID',growth:'AFFIMARO_GROWTH_PRICE_ID',business:'AFFIMARO_BUSINESS_PRICE_ID'})[plan]),mode:get('AFFIMARO_BILLING_MODE')==='live'?'live':'test',liveEnabled:get('AFFIMARO_BILLING_LIVE_ENABLED')==='true',required:get('AFFIMARO_BILLING_REQUIRED')!=='false'};
  return readPlatformBilling(getRawDb(),paymentDataKey(),plan,publicOrigin(),fallback);
}
export async function requireBusinessSubscription(identity:Identity){const db=getRawDb();return billing(db,identity,await billingConfig(await activePlan(db,identity.userId)),paymentDataKey()).ensureEntitlement();}
