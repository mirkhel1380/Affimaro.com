import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {connectPlatformBilling,saveBillingPublishableKey,readPlatformBilling,platformBillingSummary,platformWebhookCredentials} from '../lib/platform-billing.ts';
import {platformBillingCatalog,subscriptionEvents} from '../lib/platform-billing-catalog.ts';
import {openPayment} from '../lib/payment-crypto.ts';
import {STRIPE_VERSION} from '../lib/payment-connections.ts';
import {checkoutDestination} from '../lib/checkout-entry.ts';
const owner={userId:'billing-platform-owner',email:'owner@example.com'},key='ce'.repeat(32),secret='rk_live_FIXTUREONLYRESTRICTEDKEY12345',origin='https://affimaro.example';
async function fixture(t){
 const db=database(t);await service(db,owner).saveAccount({name:'Platform owner'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,new Date().toISOString());
 const state={calls:[],wrongPrice:false,wrongAccount:false,lose:false,endpoints:new Map(),portals:new Map()},fetcher=async(url,init)=>{
  assert.equal(new URL(url).origin,'https://api.stripe.com');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer '+secret);assert.equal(init.headers['Stripe-Version'],STRIPE_VERSION);assert.ok(init.signal);state.calls.push({url,init});
  const path=new URL(url).pathname;if(path==='/v1/account')return Response.json({object:'account',charges_enabled:true,id:state.wrongAccount?'acct_DIFFERENT123':platformBillingCatalog.accountId});if(path==='/v1/balance')return Response.json({object:'balance',livemode:true});
  const plan=Object.entries(platformBillingCatalog.prices).find(([,price])=>path==='/v1/prices/'+price)?.[0];if(plan)return Response.json({object:'price',id:platformBillingCatalog.prices[plan],active:true,livemode:true,currency:'usd',type:'recurring',billing_scheme:'per_unit',unit_amount:state.wrongPrice?1:{starter:1900,growth:4900,business:9900}[plan],custom_unit_amount:null,transform_quantity:null,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
  if(path==='/v1/billing_portal/configurations'){const body=new URLSearchParams(init.body),idem=init.headers['Idempotency-Key'];assert.equal(body.get('features[subscription_cancel][mode]'),'at_period_end');let result=state.portals.get(idem);if(!result){result={id:'bpc_FIXTUREPORTAL123',object:'billing_portal.configuration',active:true,livemode:true,features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false}},metadata:{affimaro_setup:body.get('metadata[affimaro_setup]')}};state.portals.set(idem,result);}return Response.json(result);}
  assert.equal(path,'/v1/webhook_endpoints');assert.equal(init.method,'POST');const body=new URLSearchParams(init.body),idem=init.headers['Idempotency-Key'];assert.ok(idem);assert.equal(body.get('connect'),'false');assert.equal(body.get('url'),origin+'/api/billing/webhook');
  let result=state.endpoints.get(idem);if(!result){result={id:'we_FIXTUREENDPOINT123',object:'webhook_endpoint',livemode:true,status:'enabled',api_version:STRIPE_VERSION,url:body.get('url'),enabled_events:[...body].filter(([k])=>k.startsWith('enabled_events[')).map(([,v])=>v),metadata:{affimaro_setup:body.get('metadata[affimaro_setup]')},secret:'whsec_FIXTUREONLYWEBHOOK123456789'};state.endpoints.set(idem,result);}
  if(state.lose){state.lose=false;throw new Error('PRIVATE_PROVIDER_RESPONSE_LOST');}return Response.json(result);
 };
 return {db,state,fetcher,connect:(input={key:secret,confirmed:true})=>connectPlatformBilling(db,owner,key,origin,input,fetcher)};
}
test('platform billing setup checks the stored owner grant before provider calls or credential persistence',async t=>{
 const f=await fixture(t);await assert.rejects(connectPlatformBilling(f.db,{userId:'not-owner',email:owner.email},key,origin,{key:secret,confirmed:true},f.fetcher),e=>e.status===403);assert.equal(f.state.calls.length,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM platform_billing_settings').get().n,0);
 for(const input of [{key:secret,confirmed:false},{key:'sk_live_UNRESTRICTED123456',confirmed:true},{key:secret,confirmed:true,accountId:'acct_OTHER123'}])await assert.rejects(f.connect(input),e=>e.status===400);assert.equal(f.state.calls.length,0);
});
test('the original payment key encrypts platform credentials and a verified subscription webhook is required before checkout is configured',async t=>{
 const f=await fixture(t);await assert.rejects(connectPlatformBilling(f.db,owner,undefined,origin,{key:secret,confirmed:true},f.fetcher),e=>e.status===503);assert.equal(f.state.calls.length,0);
 const summary=await f.connect(),row=f.db.sqlite.prepare('SELECT * FROM platform_billing_settings').get();assert.equal(summary.status,'ready');assert.equal(summary.accountId,platformBillingCatalog.accountId);assert.ok(!JSON.stringify(summary).includes(secret));assert.ok(!JSON.stringify(row).includes(secret));assert.ok(!JSON.stringify(row).includes('whsec_'));assert.equal(await openPayment(row.encrypted_credential,key,'platform-billing/key/'+row.setup_id),secret);
 const config=await readPlatformBilling(f.db,key,'growth',origin,{mode:'test',required:false,liveEnabled:false});assert.equal(config.secret,secret);assert.equal(config.priceId,platformBillingCatalog.prices.growth);assert.equal(config.liveEnabled,true);assert.equal(config.required,true);assert.equal(config.portalConfigurationId,'bpc_FIXTUREPORTAL123');assert.equal(f.state.portals.size,1);assert.equal((await platformWebhookCredentials(f.db,key,origin)).secret,'whsec_FIXTUREONLYWEBHOOK123456789');
 assert.deepEqual([...new URLSearchParams(row.webhook_payload)].filter(([k])=>k.startsWith('enabled_events[')).map(([,v])=>v),[...subscriptionEvents]);
 assert.ok(!JSON.stringify(await platformBillingSummary(f.db,owner,origin)).includes('whsec_'));
});
test('lost webhook-creation responses reuse the frozen payload and idempotency key without creating another endpoint',async t=>{
 const f=await fixture(t);f.state.lose=true;await assert.rejects(f.connect(),e=>e.status===502);let row=f.db.sqlite.prepare('SELECT * FROM platform_billing_settings').get();assert.equal(row.status,'pending');assert.equal(row.lease_id,null);const config=await readPlatformBilling(f.db,key,'starter',origin,{mode:'live',required:false,liveEnabled:true,secret});assert.equal(config.secret,undefined);assert.equal(config.liveEnabled,false);
 await f.connect();assert.equal(f.state.endpoints.size,1);const posts=f.state.calls.filter(c=>c.init.method==='POST'&&c.url.endsWith('/webhook_endpoints'));assert.equal(posts.length,2);assert.equal(posts[0].init.body,posts[1].init.body);assert.equal(posts[0].init.headers['Idempotency-Key'],posts[1].init.headers['Idempotency-Key']);assert.equal(f.db.sqlite.prepare('SELECT status FROM platform_billing_settings').get().status,'ready');
});
test('wrong Stripe identities or package amounts cannot persist a key, and pending setups never fall back to a different active key',async t=>{
 const f=await fixture(t);for(const property of ['wrongPrice','wrongAccount']){f.state[property]=true;await assert.rejects(f.connect(),e=>e instanceof AppError&&e.status===409);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM platform_billing_settings').get().n,0);f.state[property]=false;}
 f.state.lose=true;await assert.rejects(f.connect());f.db.sqlite.prepare('UPDATE platform_billing_settings SET created_at=?').run(new Date(Date.now()-24*3600000).toISOString());const posts=f.state.calls.filter(c=>c.init.method==='POST').length;await assert.rejects(f.connect(),e=>e.status===409);assert.equal(f.state.calls.filter(c=>c.init.method==='POST').length,posts);
});
test('approved business package clicks go to their own payment page while pending, free-role and owner accounts keep their correct destination',async t=>{
 const f=await fixture(t);assert.equal(await checkoutDestination(f.db,owner,'starter'),'/owner');
 for(const portal of ['brand','agency','creator','affiliate']){const u={userId:portal,email:portal+'@example.com'};await service(f.db,u).saveAccount({name:portal});const at=new Date().toISOString();f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run(portal,portal,at);f.db.sqlite.prepare("INSERT INTO platform_applications(user_id,portal,status,created_at,updated_at) VALUES (?,?,'pending',?,?)").run(portal,['brand','agency'].includes(portal)?'brand':'affiliate',at,at);assert.ok((await checkoutDestination(f.db,u,'growth')).startsWith('/application?return_to='));f.db.sqlite.prepare("UPDATE platform_applications SET status='approved' WHERE user_id=?").run(portal);assert.equal(await checkoutDestination(f.db,u,'growth'),{brand:'/billing?plan=growth',agency:'/agency/billing?plan=growth',creator:'/creator',affiliate:'/partner'}[portal]);}
});


test('only the owner can enable on-site payments and saving a publishable key preserves encrypted setup and provider resources',async t=>{
 const f=await fixture(t),input={action:'publishable',publishableKey:'pk_live_FIXTUREPUBLICKEY123456',confirmed:true};await f.connect();
 const before=f.db.sqlite.prepare('SELECT * FROM platform_billing_settings').get(),calls=f.state.calls.length;
 await assert.rejects(saveBillingPublishableKey(f.db,{userId:'customer',email:'customer@example.com'},input),e=>e.status===403);
 for(const publishableKey of ['sk_live_FIXTURESECRET123456','pk_test_FIXTUREPUBLICKEY123456','not-a-key'])await assert.rejects(saveBillingPublishableKey(f.db,owner,{...input,publishableKey}),e=>e.status===400);
 assert.deepEqual(await saveBillingPublishableKey(f.db,owner,input),{embeddedReady:true});const after=f.db.sqlite.prepare('SELECT * FROM platform_billing_settings').get();
 for(const field of ['setup_id','encrypted_credential','encrypted_webhook_secret','webhook_payload','portal_payload','webhook_id','portal_configuration_id','origin'])assert.equal(after[field],before[field]);
 assert.equal(f.state.calls.length,calls);assert.equal((await readPlatformBilling(f.db,key,'growth',origin,{mode:'live',liveEnabled:false,required:true})).publishableKey,input.publishableKey);assert.equal((await platformBillingSummary(f.db,owner,origin)).embeddedReady,true);
});
