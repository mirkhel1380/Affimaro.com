import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requirePlatformAdmin} from './admissions.ts';
import {openPayment,sealPayment} from './payment-crypto.ts';
import {inspectBillingConfiguration,resolveAgencyPrice,type BillingConfig} from './billing.ts';
import {STRIPE_VERSION} from './payment-connections.ts';
import {platformBillingCatalog,subscriptionEvents} from './platform-billing-catalog.ts';
import {trustedPublicOrigin} from './public-origin.ts';
import type {Plan} from './plan-requests.ts';
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Settings={publishable_key:string|null;id:string;setup_id:string;account_id:string;mode:'test'|'live';origin:string;encrypted_credential:string;webhook_payload:string;portal_payload:string;portal_configuration_id:string|null;encrypted_webhook_secret:string|null;webhook_id:string|null;status:'pending'|'ready';configured_by:string;lease_id:string|null;lease_until:string|null;created_at:string;updated_at:string};
const now=()=>new Date().toISOString();
const settings=(db:D1Database)=>db.prepare("SELECT * FROM platform_billing_settings WHERE id='stripe'").first<Settings>();
const portalConfiguration=z.object({id:z.string().regex(/^bpc_[A-Za-z0-9]{6,160}$/),object:z.literal('billing_portal.configuration'),livemode:z.literal(true),active:z.literal(true),features:z.object({invoice_history:z.object({enabled:z.literal(true)}),payment_method_update:z.object({enabled:z.literal(true)}),subscription_cancel:z.object({enabled:z.literal(true),mode:z.literal('at_period_end')}),subscription_update:z.object({enabled:z.literal(false)})}),metadata:z.record(z.string(),z.string())});
const endpoint=z.object({id:z.string().regex(/^we_[A-Za-z0-9]{6,160}$/),object:z.literal('webhook_endpoint'),livemode:z.boolean(),url:z.string(),status:z.literal('enabled'),api_version:z.literal(STRIPE_VERSION),enabled_events:z.array(z.string()),metadata:z.record(z.string(),z.string()),secret:z.string().regex(/^whsec_[A-Za-z0-9]{12,240}$/).optional()});
export type PlatformBillingSummary={status:'missing'|'pending'|'ready';accountId:string;mode:'test'|'live';webhookUrl:string;portalConfigured:boolean;checkedAt:string|null;embeddedReady?:boolean};
async function webhookApi(fetcher:Fetcher,secret:string,path:string,body?:URLSearchParams,idem?:string){
 if(!/^\/v1\/(?:account|webhook_endpoints(?:\/we_[A-Za-z0-9]{6,160})?|billing_portal\/configurations)$/.test(path))throw new AppError(500,'Unsupported billing setup operation.');
 let response:Response;try{response=await fetcher('https://api.stripe.com'+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+secret,'Stripe-Version':STRIPE_VERSION,Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idem!}:{})},...(body?{body:body.toString()}:{})});}catch{throw new AppError(502,'Stripe did not confirm webhook setup. Retry this saved setup; no customer payment was started.');}
 if(!response.ok){await response.body?.cancel();throw new AppError(response.status===429?429:502,'Stripe could not register '+(path.includes('billing_portal')?'subscription management. Check the restricted key’s Customer Portal permission, then retry.':'subscription updates. Check the restricted key’s Webhook Endpoints permission, then retry.'));}
 const reader=response.body?.getReader();if(!reader)throw new AppError(502,'Stripe returned an empty setup response.');let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536)throw new Error();text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();return JSON.parse(text) as unknown;}catch{await reader.cancel().catch(()=>{});throw new AppError(502,'The Stripe setup response could not be verified. Retry the saved setup.');}
}
export async function platformBillingSummary(db:D1Database,user:Identity,origin:string):Promise<PlatformBillingSummary>{
 await requirePlatformAdmin(db,user);const row=await settings(db),url=trustedPublicOrigin(origin)+'/api/billing/webhook';
 return {status:row?.status==='ready'&&!!row.portal_configuration_id&&row.origin===origin?'ready':row?'pending':'missing',accountId:row?.account_id||platformBillingCatalog.accountId,mode:row?.mode||'live',webhookUrl:url,portalConfigured:!!row?.portal_configuration_id,checkedAt:row?.updated_at||null,embeddedReady:!!row?.publishable_key};
}
export async function readPlatformBilling(db:D1Database,key:string|undefined,plan:Plan,origin:string,fallback:BillingConfig,fetcher:Fetcher=fetch):Promise<BillingConfig>{
 const row=await settings(db);if(!row)return resolveAgencyPrice(fallback,fetcher);
 const base:BillingConfig={plan,portal:fallback.portal||'brand',savedPrice:fallback.savedPrice,legacyPrice:fallback.legacyPrice,reconcileOnly:fallback.reconcileOnly,origin,publishableKey:row.publishable_key||undefined,platformId:row.account_id,priceId:fallback.savedPrice?fallback.priceId:fallback.portal==='agency'?undefined:platformBillingCatalog.prices[plan],mode:row.mode,required:true,liveEnabled:false};
 if(row.status!=='ready'||row.origin!==origin||!row.encrypted_webhook_secret||!row.portal_configuration_id)return base;
 return resolveAgencyPrice({...base,portalConfigurationId:row.portal_configuration_id,secret:await openPayment<string>(row.encrypted_credential,key,'platform-billing/key/'+row.setup_id),liveEnabled:row.mode==='live'},fetcher);
}
export async function platformWebhookCredentials(db:D1Database,key:string|undefined,origin:string){
 const row=await settings(db);if(!row||row.status!=='ready'||!row.encrypted_webhook_secret||row.origin!==origin)throw new AppError(503,'Subscription updates are not configured.');
 return {accountId:row.account_id,mode:row.mode,secret:await openPayment<string>(row.encrypted_webhook_secret,key,'platform-billing/webhook/'+row.setup_id)};
}
export async function connectPlatformBilling(db:D1Database,user:Identity,key:string|undefined,origin:string,input:unknown,fetcher:Fetcher=fetch){
 await requirePlatformAdmin(db,user);
 const parsed=z.object({key:z.string().regex(/^rk_live_[A-Za-z0-9]{12,240}$/),confirmed:z.literal(true)}).strict().safeParse(input);
 if(!parsed.success)throw new AppError(400,'Enter a live restricted Stripe key and confirm the selected subscription account.');
 const secret=parsed.data.key,selectedOrigin=trustedPublicOrigin(origin);if(selectedOrigin.endsWith('.chatgpt.site'))throw new AppError(400,'Configure billing on the independent Affimaro website.');
 // Confirm encryption is available before any provider setup or database write.
 await sealPayment('check',key,'platform-billing/check');
 const checks=await Promise.all((['brand','agency'] as const).flatMap(portal=>(['starter','growth','business'] as const).map(async plan=>inspectBillingConfiguration(await resolveAgencyPrice({plan,portal,origin:selectedOrigin,secret,platformId:platformBillingCatalog.accountId,priceId:portal==='brand'?platformBillingCatalog.prices[plan]:undefined,mode:'live',required:true,liveEnabled:true},fetcher),fetcher))));for(const result of checks)if(result.status!=='live_ready')throw new AppError(409,result.message);
 const account=z.object({id:z.literal(platformBillingCatalog.accountId),object:z.literal('account'),charges_enabled:z.literal(true)}).safeParse(await webhookApi(fetcher,secret,'/v1/account'));if(!account.success)throw new AppError(409,'Stripe must enable live charges on the selected account before customer payments can open.');
 const setupId=crypto.randomUUID(),at=now(),encrypted=await sealPayment(secret,key,'platform-billing/key/'+setupId);
 const payload=new URLSearchParams({url:selectedOrigin+'/api/billing/webhook',api_version:STRIPE_VERSION,connect:'false',description:'Affimaro subscription updates','metadata[affimaro_setup]':setupId});subscriptionEvents.forEach((event,i)=>payload.set('enabled_events['+i+']',event));
 const portalPayload=new URLSearchParams({'business_profile[headline]':'Manage your Affimaro subscription','business_profile[terms_of_service_url]':selectedOrigin+'/terms-and-conditions','business_profile[privacy_policy_url]':selectedOrigin+'/privacy-policy',default_return_url:selectedOrigin+'/billing','features[invoice_history][enabled]':'true','features[payment_method_update][enabled]':'true','features[subscription_cancel][enabled]':'true','features[subscription_cancel][mode]':'at_period_end','features[subscription_update][enabled]':'false','metadata[affimaro_setup]':setupId});
 await db.prepare("INSERT INTO platform_billing_settings (id,setup_id,account_id,mode,origin,encrypted_credential,webhook_payload,portal_payload,status,configured_by,created_at,updated_at) VALUES ('stripe',?,?,'live',?,?,?,?,'pending',?,?,?) ON CONFLICT(id) DO NOTHING").bind(setupId,platformBillingCatalog.accountId,selectedOrigin,encrypted,payload.toString(),portalPayload.toString(),user.userId,at,at).run();
 let row=(await settings(db))!;
 if(await openPayment<string>(row.encrypted_credential,key,'platform-billing/key/'+row.setup_id)!==secret)throw new AppError(409,'A different billing key is already saved. Finish that setup before replacing credentials.');
 if(row.account_id!==platformBillingCatalog.accountId||row.mode!=='live'||row.origin!==selectedOrigin)throw new AppError(409,'The saved account or website changed. Have the owner reconcile the existing webhook before reconnecting.');
 if(row.status==='ready')return platformBillingSummary(db,user,selectedOrigin);
 if(Date.now()-Date.parse(row.created_at)>23*3600000)throw new AppError(409,'This unconfirmed webhook setup is outside the safe retry window. Reconcile its endpoint in Stripe before another registration.');
 const lease=crypto.randomUUID();await db.prepare("UPDATE platform_billing_settings SET lease_id=?,lease_until=? WHERE id='stripe' AND (lease_until IS NULL OR lease_until<=?)").bind(lease,new Date(Date.now()+120000).toISOString(),now()).run();
 row=(await settings(db))!;if(row.lease_id!==lease)throw new AppError(409,'Billing setup is already being checked. Retry in a moment.');
 try{
  if(!row.portal_configuration_id){
   const portalBody=new URLSearchParams(row.portal_payload);if(portalBody.get('metadata[affimaro_setup]')!==row.setup_id||portalBody.get('default_return_url')!==selectedOrigin+'/billing')throw new AppError(409,'The saved subscription management setup needs reconciliation.');
   const portal=portalConfiguration.safeParse(await webhookApi(fetcher,secret,'/v1/billing_portal/configurations',portalBody,'affimaro-platform-portal-'+row.setup_id));
   if(!portal.success||portal.data.metadata.affimaro_setup!==row.setup_id)throw new AppError(502,'Stripe subscription management could not be verified. Retry the saved setup.');
   await db.prepare("UPDATE platform_billing_settings SET portal_configuration_id=?,updated_at=? WHERE id='stripe' AND lease_id=?").bind(portal.data.id,now(),lease).run();
  }
  const body=new URLSearchParams(row.webhook_payload);if(body.get('url')!==selectedOrigin+'/api/billing/webhook'||body.get('metadata[affimaro_setup]')!==row.setup_id)throw new AppError(409,'The saved webhook setup needs reconciliation.');
  const checked=endpoint.safeParse(await webhookApi(fetcher,secret,'/v1/webhook_endpoints',body,'affimaro-platform-webhook-'+row.setup_id));
  if(!checked.success||!checked.data.livemode||checked.data.url!==body.get('url')||checked.data.metadata.affimaro_setup!==row.setup_id||!checked.data.secret||checked.data.enabled_events.length!==subscriptionEvents.length||subscriptionEvents.some(e=>!checked.data.enabled_events.includes(e)))throw new AppError(502,'The registered Stripe webhook could not be verified. Retry the same setup.');
  const encryptedWebhook=await sealPayment(checked.data.secret,key,'platform-billing/webhook/'+row.setup_id);
  await db.prepare("UPDATE platform_billing_settings SET encrypted_webhook_secret=?,webhook_id=?,status='ready',updated_at=? WHERE id='stripe' AND setup_id=? AND lease_id=?").bind(encryptedWebhook,checked.data.id,now(),row.setup_id,lease).run();
  if((await settings(db))?.status!=='ready')throw new AppError(409,'Billing setup changed. Check its current status.');
  return platformBillingSummary(db,user,selectedOrigin);
 }finally{await db.prepare("UPDATE platform_billing_settings SET lease_id=NULL,lease_until=NULL WHERE id='stripe' AND lease_id=?").bind(lease).run();}
}

// The publishable key is safe for the payment iframe. Secret and webhook keys stay encrypted.
export async function saveBillingPublishableKey(db:D1Database,user:Identity,input:unknown){
 await requirePlatformAdmin(db,user);
 const parsed=z.object({action:z.literal('publishable'),publishableKey:z.string().regex(/^pk_live_[A-Za-z0-9]{12,240}$/),confirmed:z.literal(true)}).strict().safeParse(input);
 if(!parsed.success)throw new AppError(400,'Enter the live publishable key from the displayed Stripe account and confirm it.');
 const row=await settings(db);if(row?.status!=='ready'||row.mode!=='live')throw new AppError(409,'Complete the existing Stripe connection before enabling the payment form.');
 const pending=await db.prepare("SELECT id FROM billing_checkouts WHERE state IN ('creating','open','review') AND payload_version IN (3,4) LIMIT 1").first();
 if(pending&&row.publishable_key!==parsed.data.publishableKey)throw new AppError(409,'Reconcile the current payment forms before replacing their publishable key.');
 await db.prepare("UPDATE platform_billing_settings SET publishable_key=?,updated_at=? WHERE id='stripe' AND status='ready' AND setup_id=?").bind(parsed.data.publishableKey,now(),row.setup_id).run();
 return {embeddedReady:true};
}
