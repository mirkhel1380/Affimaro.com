import {env} from 'cloudflare:workers';
import {getRawDb} from '../db';
import {billing,type BillingConfig} from './billing';
import {paymentDataKey} from './payment-runtime';
import type {Identity} from './service';
export function billingConfig():BillingConfig{
  const values=env as unknown as Record<string,unknown>,get=(key:string)=>typeof values[key]==='string'?values[key] as string:undefined;
  return {secret:get('AFFIMARO_BILLING_STRIPE_KEY'),platformId:get('AFFIMARO_BILLING_ACCOUNT_ID'),priceId:get('AFFIMARO_STARTER_PRICE_ID'),mode:get('AFFIMARO_BILLING_MODE')==='live'?'live':'test',liveEnabled:get('AFFIMARO_BILLING_LIVE_ENABLED')==='true',required:get('AFFIMARO_BILLING_REQUIRED')==='true'};
}
export function requireBusinessSubscription(identity:Identity){return billing(getRawDb(),identity,billingConfig(),paymentDataKey()).ensureEntitlement();}
