import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {paymentConnections,STRIPE_VERSION} from '../lib/payment-connections.ts';
import {stripeConnect,STRIPE_RETURN_ORIGIN} from '../lib/stripe-connect.ts';
const key='df'.repeat(32),secret='rk_test_FIXTURECONNECT123456',identity=id=>({userId:id,email:`${id}@example.com`});
const fails=n=>e=>e instanceof AppError&&e.status===n;
async function fixture(t){
  const db=database(t),owner=service(db,identity('owner')),partner=service(db,identity('partner'));
  await owner.saveAccount({name:'Business Owner'});await owner.createBusiness({name:'Example Business',website:''});
  await partner.saveAccount({name:'Example Partner'});await partner.saveAffiliate({name:'Example Partner',channel:'Blog',website:'',bio:''});
  const program=(await owner.businessDashboard()).program,application=await partner.apply({programId:program.id});await owner.review({applicationId:application.id,status:'approved'});
  const state={calls:[],fault:null,hook:null,lostCreation:false,creations:0,platform:{object:'account',id:'acct_PLATFORM12345',country:'US',default_currency:'usd',payouts_enabled:true,business_profile:{name:'Example Business'}},live:false,accounts:new Map(),idempotent:new Map(),link:'https://connect.stripe.com/setup/s/FIXTURE/ONETIME',lastMetadata:null};
  const fetcher=async(url,init)=>{
    const path=new URL(url).pathname;assert.equal(new URL(url).origin,'https://api.stripe.com');assert.equal(init.redirect,'error');assert.equal(init.headers['Stripe-Version'],STRIPE_VERSION);assert.ok(init.signal instanceof AbortSignal);assert.ok(!url.includes(secret));
    const params=new URLSearchParams(init.body||''),call={path,method:init.method,headers:init.headers,params};state.calls.push(call);
    if(state.hook)await state.hook(call);
    if(state.fault){const response=await state.fault(call);if(response)return response;}
    if(path==='/v1/account'&&init.method==='GET')return Response.json(state.platform);
    if(path==='/v1/balance'&&init.method==='GET')return Response.json({object:'balance',livemode:state.live});
    if(path==='/v1/accounts'&&init.method==='POST'){
      const idem=init.headers['Idempotency-Key'];assert.ok(idem);let account=state.idempotent.get(idem);
      if(!account){state.creations++;const metadata={affimaro_recipient:params.get('metadata[affimaro_recipient]'),affimaro_application:params.get('metadata[affimaro_application]'),affimaro_workspace:params.get('metadata[affimaro_workspace]')};account={object:'account',id:`acct_RECIPIENT${String(state.creations).padStart(8,'0')}`,country:params.get('country'),details_submitted:false,payouts_enabled:false,capabilities:{transfers:'pending'},controller:{stripe_dashboard:{type:'express'},requirement_collection:'stripe'},metadata,requirements:{currently_due:['external_account'],pending_verification:[],disabled_reason:'requirements.past_due'},email:'private-stripe-user@example.com',external_accounts:{data:[{account_number:'SENSITIVE123456'}]}};state.accounts.set(account.id,account);state.idempotent.set(idem,account);state.lastMetadata=metadata;}
      if(state.lostCreation){state.lostCreation=false;throw new Error('Fixture network interruption '+secret);}return Response.json(account);
    }
    if(path.startsWith('/v1/accounts/')&&init.method==='GET'){const a=state.accounts.get(path.split('/').at(-1));return a?Response.json(a):new Response('not found',{status:404});}
    if(path==='/v1/account_links'&&init.method==='POST')return Response.json({object:'account_link',url:state.link,expires_at:Math.floor(Date.now()/1000)+300});
    throw new Error('Unexpected Stripe operation '+path);
  };
  const connectionApi=paymentConnections(db,identity('owner'),key,fetcher),connection=await connectionApi.connect({provider:'stripe',mode:'test',secret});
  const merchant=stripeConnect(db,identity('owner'),key,fetcher),affiliate=stripeConnect(db,identity('partner'),key,fetcher);
  const f={db,owner,partner,program,application,state,fetcher,connectionApi,connection,merchant,affiliate};
  f.enable=()=>merchant.configure({enabled:true,confirmed:true,connectionId:f.connection.id});f.start=()=>affiliate.start({applicationId:application.id,country:'US',consent:true});return f;
}
const row=f=>f.db.sqlite.prepare('SELECT * FROM stripe_recipients ORDER BY rowid DESC LIMIT 1').get();
const posts=f=>f.state.calls.filter(c=>c.method==='POST');
test('independent receiving-account links return only to the server-configured origin',async t=>{
  const f=await fixture(t);await f.enable();const api=stripeConnect(f.db,identity('partner'),key,f.fetcher,'https://affimaro.example');await api.start({applicationId:f.application.id,country:'US',consent:true});const link=posts(f).find(call=>call.path==='/v1/account_links');assert.equal(link.params.get('return_url'),'https://affimaro.example/payments?view=affiliate&stripe=return');assert.equal(link.params.get('refresh_url'),'https://affimaro.example/payments?view=affiliate&stripe=refresh');
});
test('Stripe recipient setup defaults off and requires the owner to confirm its displayed connection',async t=>{
  const f=await fixture(t);assert.equal((await f.merchant.merchant()).enabled,false);await assert.rejects(f.start(),fails(409));
  await assert.rejects(f.merchant.configure({enabled:true,confirmed:false,connectionId:f.connection.id}),fails(400));await assert.rejects(f.merchant.configure({enabled:true,confirmed:true,connectionId:crypto.randomUUID()}),fails(409));
  await f.enable();assert.equal((await f.merchant.merchant()).enabled,true);assert.equal((await f.affiliate.affiliate())[0].setup_enabled,1);assert.equal(posts(f).length,0);
});
test('only the approved affiliate can start, with explicit consent, its real supported country and no injected account/callback',async t=>{
  const f=await fixture(t);await f.enable();const input={applicationId:f.application.id,country:'US',consent:true};
  for(const change of [{consent:false},{country:'GB'},{accountId:'acct_FOREIGN123'},{returnUrl:'https://attacker.example'},{affiliateUserId:'other'}])await assert.rejects(f.affiliate.start({...input,...change}),fails(400));
  await assert.rejects(f.merchant.start(input),fails(404));await assert.rejects(f.affiliate.configure({enabled:true,confirmed:true,connectionId:f.connection.id}),fails(404));
  f.db.sqlite.prepare("UPDATE applications SET status='suspended' WHERE id=?").run(f.application.id);await assert.rejects(f.start(),fails(404));assert.equal(posts(f).length,0);
});
test('fresh platform identity and test/live environment are checked before account creation',async t=>{
  const f=await fixture(t);await f.enable();f.state.live=true;await assert.rejects(f.start(),fails(409));f.state.live=false;f.state.platform.id='acct_ANOTHER12345';await assert.rejects(f.start(),fails(409));assert.equal(f.state.creations,0);
});
test('setup creates an Express receiving account with no bank/KYC prefills and returns only a private Stripe link',async t=>{
  const f=await fixture(t);await f.enable();const result=await f.start(),r=row(f);assert.equal(result.url,f.state.link);assert.equal(r.state,'needs_information');assert.equal(r.country,'US');
  const create=posts(f).find(c=>c.path==='/v1/accounts');assert.equal(create.params.get('controller[stripe_dashboard][type]'),'express');assert.equal(create.params.get('controller[losses][payments]'),'application');assert.equal(create.params.get('capabilities[transfers][requested]'),'true');assert.ok(!create.params.has('tos_acceptance[ip]'));assert.ok(!create.params.has('email'));assert.ok(!create.params.has('external_account'));
  const link=posts(f).find(c=>c.path==='/v1/account_links');assert.equal(link.params.get('return_url'),STRIPE_RETURN_ORIGIN+'/payments?view=affiliate&stripe=return');assert.equal(link.params.get('refresh_url'),STRIPE_RETURN_ORIGIN+'/payments?view=affiliate&stripe=refresh');assert.equal(link.params.get('account'),r.account_id);
  const cards=JSON.stringify(await f.affiliate.affiliate());for(const privateValue of [secret,'encrypted_credential','SENSITIVE123456','private-stripe-user@example.com','lease_id','create_started_at',f.state.link])assert.ok(!cards.includes(privateValue));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);
});
test('repeated onboarding reuses the same recipient account while issuing a fresh account link',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const id=row(f).account_id;await f.start();assert.equal(f.state.creations,1);assert.equal(row(f).account_id,id);assert.equal(posts(f).filter(c=>c.path==='/v1/accounts').length,1);assert.equal(posts(f).filter(c=>c.path==='/v1/account_links').length,2);
});
test('readiness comes from verified Stripe capability, submitted details and payouts, with no accounting side effects',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const r=row(f),a=f.state.accounts.get(r.account_id);a.details_submitted=true;a.capabilities.transfers='active';a.requirements={currently_due:[],pending_verification:[],disabled_reason:null};
  await f.affiliate.check({recipientId:r.id});assert.equal(row(f).state,'pending');a.payouts_enabled=true;await f.merchant.check({recipientId:r.id});assert.equal(row(f).state,'ready');
  a.requirements.pending_verification=['individual.verification.document'];await f.affiliate.check({recipientId:r.id});assert.equal(row(f).state,'pending');assert.equal(row(f).requirements_count,1);
  a.requirements.disabled_reason='rejected.other';await f.affiliate.check({recipientId:r.id});assert.equal(row(f).state,'attention');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM commission_approvals').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);
});
test('other businesses and affiliates cannot list or refresh another recipient or open its onboarding link',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const r=row(f),stranger=service(f.db,identity('stranger'));await stranger.saveAccount({name:'Another Owner'});await stranger.createBusiness({name:'Another Business',website:''});const api=stripeConnect(f.db,identity('stranger'),key,f.fetcher);assert.deepEqual(await api.affiliate(),[]);assert.equal((await api.merchant()).recipients.length,0);await assert.rejects(api.check({recipientId:r.id}),fails(404));await assert.rejects(api.start({applicationId:f.application.id,country:'US',consent:true}),fails(404));
});
test('credential replacement pauses new setup and must be re-enabled, while same-platform recipients survive rotation',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const old=f.connection;f.connection=await f.connectionApi.connect({provider:'stripe',mode:'test',secret:'rk_test_REPLACEMENTFIXTURE12345'});assert.equal((await f.merchant.merchant()).enabled,false);await assert.rejects(f.start(),fails(409));await assert.rejects(f.merchant.configure({enabled:true,confirmed:true,connectionId:old.id}),fails(409));await f.enable();await f.start();assert.equal(f.state.creations,1);
});
test('test and live recipients remain distinct and old-mode status cannot be refreshed with another environment',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const testRow=row(f);f.state.live=true;f.connection=await f.connectionApi.connect({provider:'stripe',mode:'live',secret:'rk_live_LIVEFIXTUREONLY12345'});await f.enable();await f.start();assert.equal(f.state.creations,2);assert.notEqual(row(f).id,testRow.id);assert.equal(row(f).mode,'live');await assert.rejects(f.affiliate.check({recipientId:testRow.id}),fails(409));
});
test('an interrupted creation retries the identical Stripe idempotency key and does not create a second account',async t=>{
  const f=await fixture(t);await f.enable();f.state.lostCreation=true;await assert.rejects(f.start(),fails(502));assert.equal(row(f).account_id,null);assert.ok(row(f).create_started_at);await f.start();assert.equal(f.state.creations,1);const attempts=posts(f).filter(c=>c.path==='/v1/accounts');assert.equal(attempts.length,2);assert.equal(attempts[0].headers['Idempotency-Key'],attempts[1].headers['Idempotency-Key']);assert.equal(attempts[0].params.toString(),attempts[1].params.toString());
});
test('an unknown creation older than the safe retry window is held for review instead of creating another account',async t=>{
  const f=await fixture(t);await f.enable();f.state.lostCreation=true;await assert.rejects(f.start(),fails(502));f.db.sqlite.prepare('UPDATE stripe_recipients SET create_started_at=?').run(new Date(Date.now()-24*3600000).toISOString());const count=posts(f).length;await assert.rejects(f.start(),fails(409));assert.equal(posts(f).length,count);assert.equal(f.state.creations,1);
});
test('onboarding links reject alternate hosts, user-info URLs, invalid paths and expired links',async t=>{
  const f=await fixture(t);await f.enable();
  for(const link of ['https://attacker.example/setup/abc','https://connect.stripe.com@attacker.example/setup/abc','https://connect.stripe.com/elsewhere']){f.state.link=link;await assert.rejects(f.start(),fails(502));}
  assert.equal(f.state.creations,1);f.state.link='https://connect.stripe.com/setup/s/VALID';f.state.fault=c=>c.path==='/v1/account_links'?Response.json({object:'account_link',url:f.state.link,expires_at:1}):null;await assert.rejects(f.start(),fails(502));
});
test('recipient metadata, country and account ID must match the saved membership on every source refresh',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const r=row(f),a=f.state.accounts.get(r.account_id),original=structuredClone(a);
  for(const change of [{country:'GB'},{id:'acct_UNRELATED12345'},{metadata:{...a.metadata,affimaro_application:crypto.randomUUID()}}]){Object.assign(a,original,change);await assert.rejects(f.affiliate.check({recipientId:r.id}),fails(409));assert.equal(row(f).account_id,r.account_id);}
});
test('provider failures and malformed or oversized responses do not expose credentials or turn an account ready',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const r=row(f),verifiedAt=r.last_checked_at;
  for(const [response,code] of [[()=>new Response(secret,{status:403}),409],[()=>new Response(secret,{status:429}),429],[()=>new Response('x'.repeat(262145)),502],[()=>new Response('bad JSON'),502]]){f.state.fault=c=>c.path.startsWith('/v1/accounts/')?response():null;await assert.rejects(f.affiliate.check({recipientId:r.id}),e=>fails(code)(e)&&!e.message.includes(secret));assert.equal(row(f).state,'attention');assert.equal(row(f).last_checked_at,verifiedAt);}
});
test('recipient leases prevent overlapping creation and checks, then permit retry after expiry',async t=>{
  const f=await fixture(t);await f.enable();await f.start();const r=row(f);f.db.sqlite.prepare('UPDATE stripe_recipients SET lease_id=?,lease_until=?').run('another-lease',new Date(Date.now()+60000).toISOString());await assert.rejects(f.start(),fails(409));await assert.rejects(f.affiliate.check({recipientId:r.id}),fails(409));assert.equal(f.state.creations,1);f.db.sqlite.prepare('UPDATE stripe_recipients SET lease_until=?').run(new Date(Date.now()-1000).toISOString());await f.affiliate.check({recipientId:r.id});assert.equal(row(f).lease_id,null);
});
test('audit failures roll back setup settings and verified account writes; a saved remote creation can be retried',async t=>{
  const f=await fixture(t);f.db.sqlite.exec("CREATE TRIGGER fail_setup_audit BEFORE INSERT ON audit_events WHEN NEW.action='stripe_setup_enabled' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");await assert.rejects(f.enable());assert.equal((await f.merchant.merchant()).enabled,false);f.db.sqlite.exec('DROP TRIGGER fail_setup_audit');await f.enable();
  f.db.sqlite.exec("CREATE TRIGGER fail_recipient_audit BEFORE INSERT ON audit_events WHEN NEW.action='stripe_recipient_checked' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");await assert.rejects(f.start());assert.equal(row(f).account_id,null);f.db.sqlite.exec('DROP TRIGGER fail_recipient_audit');await f.start();assert.equal(f.state.creations,1);assert.ok(row(f).account_id);
});
test('disabling setup while a request runs prevents returning an onboarding link',async t=>{
  const f=await fixture(t);await f.enable();f.state.hook=async c=>{if(c.path==='/v1/accounts'&&c.method==='POST'){f.state.hook=null;await f.merchant.configure({enabled:false,confirmed:false,connectionId:f.connection.id});}};await assert.rejects(f.start(),fails(409));assert.equal(posts(f).filter(c=>c.path==='/v1/account_links').length,0);assert.equal((await f.merchant.merchant()).enabled,false);
});
