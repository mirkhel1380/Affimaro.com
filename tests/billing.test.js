import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {billing,billingConfigured,billingRedirect,starterEntitled,BILLING_ORIGIN} from '../lib/billing.ts';
import {sealPayment} from '../lib/payment-crypto.ts';
const key='bc'.repeat(32),identity=userId=>({userId,email:userId+'@example.com'}),fails=status=>error=>error instanceof AppError&&error.status===status;
async function fixture(t,{mode='live',required=false}={}){
  const db=database(t);
  for(const id of ['owner','other']){const s=service(db,identity(id));await s.saveAccount({name:id+' business owner'});await s.createBusiness({name:id+' business',website:''});}
  const workspace=await service(db,identity('owner')).workspace();
  const config={secret:`rk_${mode}_FIXTUREBILLINGKEY1234567`,platformId:'acct_AFFIMAROBILLING123',priceId:'price_STARTERBILLING123',mode,liveEnabled:true,required};
  const state={calls:[],created:0,lose:false,mutate:null,fault:null,sessions:new Map(),byKey:new Map(),subs:new Map()};
  state.price={object:'price',id:config.priceId,active:true,livemode:mode==='live',currency:'usd',type:'recurring',billing_scheme:'per_unit',unit_amount:1900,custom_unit_amount:null,transform_quantity:null,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const fetcher=async(url,init)=>{
    const u=new URL(url),body=new URLSearchParams(init.body||''),call={url:u,path:u.pathname,body,headers:init.headers,method:init.method};state.calls.push(call);
    assert.equal(u.origin,'https://api.stripe.com');assert.equal(init.redirect,'manual');assert.equal(init.headers['Stripe-Version'],'2026-09-30.endive');assert.ok(!url.includes('FIXTUREBILLINGKEY'));
    if(state.fault){const response=await state.fault(call);if(response)return response;}
    let result;
    if(u.pathname==='/v1/account')result={object:'account',id:config.platformId};
    else if(u.pathname==='/v1/balance')result={object:'balance',livemode:mode==='live'};
    else if(u.pathname.startsWith('/v1/prices/'))result=state.price;
    else if(u.pathname==='/v1/checkout/sessions'&&init.method==='POST'){
      const idem=init.headers['Idempotency-Key'];assert.ok(idem);result=state.byKey.get(idem);
      if(!result){state.created++;result={object:'checkout.session',id:`cs_${mode}_FIXTURESESSION${state.created}`,livemode:mode==='live',mode:'subscription',client_reference_id:body.get('client_reference_id'),metadata:{affimaro_workspace:body.get('metadata[affimaro_workspace]'),affimaro_checkout:body.get('metadata[affimaro_checkout]')},status:'open',payment_status:'unpaid',customer:body.get('customer'),subscription:null,currency:'usd',amount_subtotal:1900,amount_total:1900,expires_at:Math.floor(Date.now()/1000)+86400,url:`https://checkout.stripe.com/c/pay/FIXTURESESSION${state.created}#PRIVATE_CHECKOUT_SECRET`};state.byKey.set(idem,result);state.sessions.set(result.id,result);}
      if(state.lose){state.lose=false;throw new Error('Fixture lost creation response');}
    }else if(u.pathname.startsWith('/v1/checkout/sessions/'))result=state.sessions.get(u.pathname.split('/').at(-1));
    else if(u.pathname.startsWith('/v1/subscriptions/')){assert.equal(u.searchParams.get('expand[]'),'latest_invoice');result=state.subs.get(u.pathname.split('/').at(-1));}
    else if(u.pathname==='/v1/billing_portal/sessions')result={object:'billing_portal.session',customer:body.get('customer'),livemode:mode==='live',url:'https://billing.stripe.com/p/session/PRIVATE_PORTAL_SECRET'};
    else throw new Error('Unsupported fixture request '+u.pathname);
    if(!result)return Response.json({error:'not found'},{status:404});
    return Response.json(state.mutate?state.mutate(structuredClone(result),call):result);
  };
  const api=billing(db,identity('owner'),config,key,fetcher);
  return {db,workspace,config,state,fetcher,api};
}
const start=async f=>{const q=await f.api.preview({});return f.api.checkout({reviewToken:q.reviewToken,confirmed:true});};
const account=f=>f.db.sqlite.prepare('SELECT * FROM billing_accounts WHERE workspace_id=?').get(f.workspace.id);
const checkout=f=>f.db.sqlite.prepare('SELECT * FROM billing_checkouts WHERE workspace_id=? ORDER BY rowid DESC LIMIT 1').get(f.workspace.id);
const posts=f=>f.state.calls.filter(call=>call.path==='/v1/checkout/sessions'&&call.method==='POST');
function complete(f){
  const session=f.state.sessions.get(checkout(f).session_id),at=Math.floor(Date.now()/1000);session.status='complete';session.payment_status='paid';session.customer='cus_FIXTURECUSTOMER123';session.subscription='sub_FIXTURESUBSCRIPTION123';session.url=null;
  const sub={id:session.subscription,object:'subscription',livemode:f.config.mode==='live',customer:session.customer,status:'active',metadata:{...session.metadata},cancel_at_period_end:false,items:{has_more:false,data:[{quantity:1,current_period_start:at-60,current_period_end:at+30*86400,price:structuredClone(f.state.price)}]},latest_invoice:{object:'invoice',customer:session.customer,status:'paid',currency:'usd'}};f.state.subs.set(sub.id,sub);return {session,sub};
}

test('missing billing configuration preserves pilot access and does not contact a provider',async t=>{
  const f=await fixture(t),api=billing(f.db,identity('owner'),{mode:'test',liveEnabled:false,required:false},key,f.fetcher);
  const d=await api.dashboard();assert.equal(d.configured,false);assert.equal(d.entitled,false);assert.equal(d.usage.programs,1);assert.equal(d.limits.stores,1);await api.ensureEntitlement();assert.equal(f.state.calls.length,0);await assert.rejects(api.preview({}),fails(503));assert.equal(f.state.calls.length,0);
  assert.equal(billingConfigured({...f.config,liveEnabled:false}),false);assert.equal(billingConfigured({...f.config,secret:'pk_live_NOTASECRET'}),false);
});

test('independent checkout freezes its return origin so retries keep the original idempotent payload',async t=>{
  const f=await fixture(t);f.config.origin='https://affimaro.example';f.state.lose=true;await assert.rejects(start(f),fails(502));assert.equal(checkout(f).return_origin,'https://affimaro.example');
  const first=posts(f)[0].body.toString();f.config.origin='https://new.affimaro.example';await start(f);assert.equal(posts(f)[1].body.toString(),first);assert.equal(posts(f)[1].body.get('success_url'),'https://affimaro.example/billing?checkout_return=1');
  complete(f);await f.api.refresh({});await f.api.portal({});assert.equal(f.state.calls.findLast(call=>call.path==='/v1/billing_portal/sessions').body.get('return_url'),'https://new.affimaro.example/billing');
});

test('subscription reviews derive owner/workspace and reject tenant or amount injection',async t=>{
  const f=await fixture(t),quote=await f.api.preview({});
  const other=billing(f.db,identity('other'),f.config,key,f.fetcher);await assert.rejects(other.checkout({reviewToken:quote.reviewToken,confirmed:true}),fails(400));
  await assert.rejects(f.api.preview({amount:1}),fails(400));await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,priceId:'price_OTHER123'}),fails(400));
  await assert.rejects(billing(f.db,identity('affiliate'),f.config,key,f.fetcher).preview({}),fails(404));assert.equal((await other.dashboard()).account,null);assert.equal(posts(f).length,0);
});

test('only an active fixed monthly USD licensed price in the correct account/mode is offered',async t=>{
  const f=await fixture(t),price=structuredClone(f.state.price);
  for(const change of [{currency:'eur'},{type:'one_time'},{active:false},{livemode:false},{unit_amount:0},{unit_amount:100000000},{billing_scheme:'tiered'},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}},{recurring:{interval:'month',interval_count:1,usage_type:'metered'}},{transform_quantity:{divide_by:2}},{custom_unit_amount:{enabled:true}}]){f.state.price={...price,...change};await assert.rejects(f.api.preview({}),fails(409));}
  f.state.price=price;f.state.mutate=(raw,call)=>call.path==='/v1/account'?{...raw,id:'acct_OTHERACCOUNT123'}:raw;await assert.rejects(f.api.preview({}),fails(409));assert.equal(posts(f).length,0);
});

test('checkout requires fresh bound review and explicit confirmation',async t=>{
  const f=await fixture(t),quote=await f.api.preview({});await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:false}),fails(400));
  const expired=await sealPayment({workspace:f.workspace.id,owner:'owner',platform:f.config.platformId,price:f.config.priceId,amount:1900,mode:'live',at:new Date(Date.now()-360000).toISOString()},key,`billing-review/${f.workspace.id}/owner`);
  await assert.rejects(f.api.checkout({reviewToken:expired,confirmed:true}),fails(409));
  const changed=billing(f.db,identity('owner'),{...f.config,priceId:'price_CHANGED12345'},key,f.fetcher);await assert.rejects(changed.checkout({reviewToken:quote.reviewToken,confirmed:true}),fails(409));assert.equal(posts(f).length,0);
});

test('opening checkout freezes the payload, encrypts the URL, and never activates paid access',async t=>{
  const f=await fixture(t),result=await start(f);assert.equal(result.outcome,'checkout');assert.equal(checkout(f).state,'open');assert.ok(!checkout(f).encrypted_url.includes('PRIVATE_CHECKOUT_SECRET'));assert.equal(account(f).status,'none');assert.equal((await f.api.dashboard()).entitled,false);
  const body=posts(f)[0].body;assert.equal(body.get('line_items[0][price]'),f.config.priceId);assert.equal(body.get('line_items[0][quantity]'),'1');assert.equal(body.get('client_reference_id'),f.workspace.id);assert.equal(body.get('success_url'),BILLING_ORIGIN+'/billing?checkout_return=1');assert.equal(body.get('automatic_tax[enabled]'),'false');assert.equal(body.get('adaptive_pricing[enabled]'),'false');assert.equal(body.get('customer_email'),null);assert.equal(body.get('amount'),null);
  await start(f);assert.equal(f.state.created,1);assert.equal(posts(f).length,1);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM billing_checkouts').get().n,1);
});

test('lost checkout responses retry the same attempt and exact idempotency payload',async t=>{
  const f=await fixture(t);f.state.lose=true;await assert.rejects(start(f),fails(502));assert.equal(checkout(f).state,'review');assert.equal(checkout(f).session_id,null);const first=checkout(f).id;
  await start(f);assert.equal(checkout(f).id,first);assert.equal(f.state.created,1);assert.equal(posts(f).length,2);assert.equal(posts(f)[0].headers['Idempotency-Key'],posts(f)[1].headers['Idempotency-Key']);assert.equal(posts(f)[0].body.toString(),posts(f)[1].body.toString());assert.equal(account(f).lease_id,null);
});

test('unknown checkouts older than 23 hours remain held and cannot create a second subscription',async t=>{
  const f=await fixture(t);f.state.lose=true;await assert.rejects(start(f),fails(502));f.db.sqlite.prepare('UPDATE billing_checkouts SET first_submitted_at=?').run(new Date(Date.now()-24*3600000).toISOString());
  await assert.rejects(start(f),fails(409));assert.equal(posts(f).length,1);assert.equal(checkout(f).state,'review');assert.equal(f.state.created,1);await assert.rejects(f.api.refresh({}),fails(409));assert.equal(posts(f).length,1);
});

test('paid live checkout is independently verified against its invoice, customer and subscription',async t=>{
  const f=await fixture(t,{required:true});await start(f);const {sub}=complete(f);await f.api.refresh({});
  const a=account(f);assert.equal(a.subscription_id,sub.id);assert.equal(a.status,'active');assert.equal(a.invoice_paid,1);assert.equal(checkout(f).state,'completed');assert.equal(starterEntitled(a),true);assert.equal((await f.api.dashboard()).entitled,true);
  await f.api.ensureEntitlement();assert.equal(f.state.created,1);await assert.rejects(f.api.preview({}),fails(409));assert.equal(posts(f).length,1);
});

test('test subscriptions cannot grant live paid features',async t=>{
  const f=await fixture(t,{mode:'test',required:true});await start(f);complete(f);await f.api.refresh({});assert.equal(account(f).status,'active');assert.equal((await f.api.dashboard()).entitled,false);assert.equal(starterEntitled(account(f)),false);await assert.rejects(f.api.ensureEntitlement(),fails(503));
});

test('checkout and subscription proof mismatches cannot activate a saved account',async t=>{
  const f=await fixture(t);await start(f);complete(f);
  const mutations=[
    (raw,call)=>call.path.includes('/checkout/sessions/')?{...raw,client_reference_id:crypto.randomUUID()}:raw,
    (raw,call)=>call.path.includes('/checkout/sessions/')?{...raw,amount_total:1}:raw,
    (raw,call)=>call.path.includes('/checkout/sessions/')?{...raw,livemode:false}:raw,
    (raw,call)=>call.path.includes('/checkout/sessions/')?{...raw,payment_status:'unpaid'}:raw,
    (raw,call)=>call.path.includes('/subscriptions/')?{...raw,id:'sub_ANOTHERSUBSCRIPTION123'}:raw,
    (raw,call)=>call.path.includes('/subscriptions/')?{...raw,customer:'cus_OTHER_CUSTOMER123'}:raw,
    (raw,call)=>call.path.includes('/subscriptions/')?{...raw,metadata:{...raw.metadata,affimaro_workspace:crypto.randomUUID()}}:raw,
    (raw,call)=>{if(call.path.includes('/subscriptions/'))raw.items.data[0].price.id='price_WRONGPRICE123';return raw;},
    (raw,call)=>{if(call.path.includes('/subscriptions/'))raw.items.data[0].quantity=2;return raw;},
    (raw,call)=>{if(call.path.includes('/subscriptions/'))raw.latest_invoice.customer='cus_OTHER_CUSTOMER123';return raw;},
  ];
  for(const mutate of mutations){f.state.mutate=mutate;await assert.rejects(f.api.refresh({}),error=>error instanceof AppError&&[409,502].includes(error.status));assert.equal(account(f).status,'none');assert.equal(starterEntitled(account(f)),false);}
  f.state.mutate=null;await f.api.refresh({});assert.equal(starterEntitled(account(f)),true);assert.equal(posts(f).length,1);
});

test('unpaid invoices, expired periods, future periods and checked cancellation revoke paid entitlement',async t=>{
  const f=await fixture(t,{required:true});await start(f);const {sub}=complete(f);await f.api.refresh({});
  sub.latest_invoice.status='open';await f.api.refresh({});assert.equal(account(f).invoice_paid,0);await assert.rejects(f.api.ensureEntitlement(),fails(402));
  sub.latest_invoice.status='paid';sub.items.data[0].current_period_end=Math.floor(Date.now()/1000)-1;await f.api.refresh({});assert.equal(starterEntitled(account(f)),false);
  sub.items.data[0].current_period_start=Math.floor(Date.now()/1000)+3600;sub.items.data[0].current_period_end=Math.floor(Date.now()/1000)+86400;await f.api.refresh({});assert.equal(starterEntitled(account(f)),false);
  sub.items.data[0].current_period_start=Math.floor(Date.now()/1000)-60;sub.status='canceled';await f.api.refresh({});assert.equal(account(f).status,'canceled');assert.equal(starterEntitled(account(f)),false);
});

test('an expired unpaid session can be replaced only after its remote state is verified',async t=>{
  const f=await fixture(t);await start(f);const original=checkout(f),session=f.state.sessions.get(original.session_id);session.status='expired';session.url=null;
  session.payment_status='paid';await assert.rejects(start(f),fails(409));assert.equal(f.state.created,1);
  session.payment_status='unpaid';await start(f);assert.equal(f.state.created,2);assert.notEqual(checkout(f).id,original.id);assert.equal(f.db.sqlite.prepare('SELECT state FROM billing_checkouts WHERE id=?').get(original.id).state,'expired');
});

test('customer portal uses only a verified saved customer and rejects unexpected URL destinations',async t=>{
  const f=await fixture(t);await start(f);complete(f);await f.api.refresh({});
  const portal=await f.api.portal({});assert.match(portal.url,/^https:\/\/billing\.stripe\.com\/p\//);const call=f.state.calls.find(call=>call.path==='/v1/billing_portal/sessions');assert.equal(call.body.get('customer'),account(f).customer_id);assert.equal(call.body.get('return_url'),BILLING_ORIGIN+'/billing');
  await assert.rejects(f.api.portal({customer:'cus_ANOTHER123'}),fails(400));assert.ok(!JSON.stringify(await f.api.dashboard()).includes('PRIVATE_PORTAL_SECRET'));
  for(const value of ['http://billing.stripe.com/p/a','https://billing.stripe.com.evil.example/p/a','https://user:pass@billing.stripe.com/p/a','https://billing.stripe.com:444/p/a','https://billing.stripe.com/other'])assert.throws(()=>billingRedirect(value,'portal'),fails(502));
});

test('agency billing management returns to the agency portal while checkout retries retain their original payload',async t=>{
 const f=await fixture(t);f.db.sqlite.prepare('INSERT INTO account_portals (user_id,portal,created_at) VALUES (?,?,?)').run('owner','agency',new Date().toISOString());f.config.origin='https://affimaro.example';
 f.state.lose=true;await assert.rejects(start(f),fails(502));const first=posts(f)[0].body.toString();await start(f);assert.equal(posts(f)[1].body.toString(),first);
 complete(f);await f.api.refresh({});await f.api.portal({});assert.equal(f.state.calls.findLast(call=>call.path==='/v1/billing_portal/sessions').body.get('return_url'),'https://affimaro.example/agency/billing');
});

test('a billing lease prevents concurrent checkouts from creating duplicate sessions',async t=>{
  const f=await fixture(t),quote=await f.api.preview({});let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  f.state.fault=async call=>{if(call.path==='/v1/checkout/sessions'&&call.method==='POST'){entered();await gate;}return null;};
  const first=f.api.checkout({reviewToken:quote.reviewToken,confirmed:true});await started;
  await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:true}),fails(409));release();await first;assert.equal(f.state.created,1);assert.equal(posts(f).length,1);assert.equal(account(f).lease_id,null);
});

test('subscription audit failures roll back local activation and recover without another checkout POST',async t=>{
  const f=await fixture(t);await start(f);complete(f);
  f.db.sqlite.exec("CREATE TRIGGER billing_audit_failure BEFORE INSERT ON audit_events WHEN NEW.action='subscription_checked' BEGIN SELECT RAISE(ABORT,'Fixture audit failure'); END");
  await assert.rejects(f.api.refresh({}));assert.equal(account(f).status,'none');assert.equal(checkout(f).state,'open');f.db.sqlite.exec('DROP TRIGGER billing_audit_failure');
  await f.api.refresh({});assert.equal(account(f).status,'active');assert.equal(f.state.created,1);assert.equal(posts(f).length,1);
});

test('provider errors are sanitized and freshness checks fail closed after their cache expires',async t=>{
  const f=await fixture(t,{required:true});await start(f);complete(f);await f.api.refresh({});
  f.db.sqlite.prepare('UPDATE billing_accounts SET last_verified_at=?').run(new Date(Date.now()-20*60000).toISOString());
  f.state.fault=async()=>Response.json({error:{message:'PRIVATE_PROVIDER_EMAIL_OR_KEY'}},{status:403});
  await assert.rejects(f.api.ensureEntitlement(),error=>error instanceof AppError&&error.status===502&&!error.message.includes('PRIVATE_PROVIDER'));
  const d=await f.api.dashboard();assert.equal(d.entitled,false);assert.ok(!JSON.stringify(d).includes('PRIVATE_PROVIDER'));assert.ok(!JSON.stringify(d).includes('FIXTUREBILLINGKEY'));assert.ok(!JSON.stringify(d).includes('encrypted_url'));
});

test('changing the configured Stripe account never inherits the earlier paid entitlement',async t=>{
  const f=await fixture(t,{required:true});await start(f);complete(f);await f.api.refresh({});
  const other=billing(f.db,identity('owner'),{...f.config,platformId:'acct_ANOTHERPLATFORM123'},key,f.fetcher);
  assert.equal((await other.dashboard()).entitled,false);await assert.rejects(other.ensureEntitlement(),fails(402));
  assert.deepEqual(f.db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('each package reviews only its approved USD monthly amount and cannot use a lower-priced package',async t=>{for(const [plan,dollars] of [['starter',19],['growth',49],['business',99]]){const f=await fixture(t);f.config.plan=plan;f.state.price.unit_amount=dollars*100;const quote=await f.api.preview({});assert.equal(quote.amount,dollars*100);f.state.price.unit_amount=1900+(plan==='starter'?1:0);await assert.rejects(f.api.preview({}),fails(409));assert.equal(f.state.created,0);}});

// Production webhook handling uses the same authoritative provider checks as billing.
async function webhookFixture(f){
 const {billingWebhook}=await import('../lib/billing-webhook.ts'),setup=crypto.randomUUID(),secret='whsec_FIXTUREONLYSIGNINGSECRET123456',at=new Date().toISOString();
 const credential=await sealPayment(f.config.secret,key,'platform-billing/key/'+setup),signing=await sealPayment(secret,key,'platform-billing/webhook/'+setup);
 f.db.sqlite.prepare("INSERT INTO platform_billing_settings (id,setup_id,account_id,mode,origin,encrypted_credential,webhook_payload,portal_payload,encrypted_webhook_secret,webhook_id,status,configured_by,created_at,updated_at) VALUES ('stripe',?,?,?,?,?,'fixture','fixture',?,'we_FIXTURE123','ready','owner',?,?)").run(setup,f.config.platformId,f.config.mode,'https://affimaro.example',credential,signing,at,at);
 let sequence=0;
 async function signed(event,{timestamp=Math.floor(Date.now()/1000),signingKey=secret,suffix=''}={}){const body=JSON.stringify(event),hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(signingKey),{name:'HMAC',hash:'SHA-256'},false,['sign']),digest=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(timestamp+'.'+body)),signature=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');return new Request('https://affimaro.example/api/billing/webhook',{method:'POST',headers:{'Stripe-Signature':'t='+timestamp+',v1='+signature,'Content-Type':'application/json'},body:body+suffix});}
 const event=(type,object)=>({id:'evt_FIXTURE'+(++sequence),object:'event',type,livemode:f.config.mode==='live',data:{object:structuredClone(object)}});
 const handle=request=>billingWebhook(request,{db:f.db,key,origin:'https://affimaro.example',config:async()=>f.config,fetcher:f.fetcher});
 return {event,signed,handle};
}
test('new Checkout payloads use dynamic methods and a stable integration identifier, while legacy unknown requests are held',async t=>{
 const f=await fixture(t);f.state.lose=true;await assert.rejects(start(f));const attempt=checkout(f);assert.equal(attempt.payload_version,2);assert.match(attempt.integration_suffix,/^[a-z]{8}$/);const first=posts(f)[0].body;assert.equal(first.get('payment_method_types[0]'),null);assert.match(first.get('integration_identifier'),/^affimaro_checkout_[a-z]{8}$/);await start(f);assert.equal(posts(f)[1].body.toString(),first.toString());
 const before=posts(f).length;f.db.sqlite.prepare("UPDATE billing_checkouts SET payload_version=1,integration_suffix=NULL,session_id=NULL,state='review'").run();await assert.rejects(start(f),e=>e.status===409);assert.equal(posts(f).length,before);
});
test('signed subscription notifications fulfill only after paid provider evidence and replay without another write or payment',async t=>{
 const f=await fixture(t);await start(f);const h=await webhookFixture(f),{session,sub}=complete(f),event=h.event('checkout.session.completed',session),before=f.state.created;
 assert.equal((await h.handle(await h.signed(event))).status,200);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,before);const calls=f.state.calls.length;assert.equal((await h.handle(await h.signed(event))).status,200);assert.equal(f.state.calls.length,calls);assert.equal(f.db.sqlite.prepare('SELECT status FROM billing_webhook_events').get().status,'processed');
 // An older event cannot overwrite a currently cancelled provider subscription.
 sub.status='canceled';assert.equal((await h.handle(await h.signed(h.event('customer.subscription.deleted',sub)))).status,200);assert.equal((await f.api.dashboard()).entitled,false);assert.equal(f.state.created,before);
});
test('raw-body signatures reject tampering, stale requests, wrong keys, missing signatures and mode mismatches before fulfillment',async t=>{
 const f=await fixture(t);await start(f);const h=await webhookFixture(f),{session}=complete(f),event=h.event('checkout.session.completed',session);
 for(const request of [await h.signed(event,{suffix:' '}),await h.signed(event,{timestamp:Math.floor(Date.now()/1000)-301}),await h.signed(event,{signingKey:'wrong-secret'}),new Request('https://affimaro.example/api/billing/webhook',{method:'POST',body:JSON.stringify(event)})])assert.equal((await h.handle(request)).status,400);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_webhook_events').get().n,0);assert.equal((await f.api.dashboard()).entitled,false);
 const mismatch={...event,livemode:false};assert.equal((await h.handle(await h.signed(mismatch))).status,400);
});
test('unpaid asynchronous completion stays unfulfilled until a later success and does not create another subscription',async t=>{
 const f=await fixture(t);await start(f);const h=await webhookFixture(f),session=f.state.sessions.get(checkout(f).session_id);session.status='complete';session.payment_status='unpaid';
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',session)))).status,200);assert.equal((await f.api.dashboard()).entitled,false);
 complete(f);assert.equal((await h.handle(await h.signed(h.event('checkout.session.async_payment_succeeded',session)))).status,200);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,1);
});
test('a webhook recovers a lost Checkout response by matching the frozen attempt instead of trusting browser returns',async t=>{
 const f=await fixture(t);f.state.lose=true;await assert.rejects(start(f));assert.equal(checkout(f).session_id,null);const h=await webhookFixture(f),session=[...f.state.sessions.values()][0],at=Math.floor(Date.now()/1000);session.status='complete';session.payment_status='paid';session.customer='cus_FIXTURECUSTOMER123';session.subscription='sub_FIXTURESUBSCRIPTION123';session.url=null;f.state.subs.set(session.subscription,{id:session.subscription,object:'subscription',livemode:true,customer:session.customer,status:'active',metadata:session.metadata,cancel_at_period_end:false,items:{has_more:false,data:[{quantity:1,current_period_start:at-60,current_period_end:at+86400,price:f.state.price}]},latest_invoice:{object:'invoice',customer:session.customer,status:'paid',currency:'usd'}});
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',session)))).status,200);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,1);
});
test('webhook database failures remain retryable and cannot leave a partially fulfilled invoice',async t=>{
 const f=await fixture(t);await start(f);const h=await webhookFixture(f),{session}=complete(f),event=h.event('checkout.session.completed',session);
 f.db.sqlite.exec("CREATE TRIGGER fail_subscription_audit BEFORE INSERT ON audit_events WHEN NEW.action='subscription_checked' BEGIN SELECT RAISE(ABORT,'fixture fail'); END;");assert.equal((await h.handle(await h.signed(event))).status,503);assert.equal(account(f).subscription_id,null);assert.equal(f.db.sqlite.prepare('SELECT status FROM billing_webhook_events').get().status,'processing');f.db.sqlite.exec('DROP TRIGGER fail_subscription_audit');assert.equal((await h.handle(await h.signed(event))).status,200);assert.equal((await f.api.dashboard()).entitled,true);
});

test('signed notifications cannot correlate a checkout from one workspace to another, even when their metadata is forged',async t=>{
 const f=await fixture(t);await start(f);const other=billing(f.db,identity('other'),f.config,key,f.fetcher),q=await other.preview({});await other.checkout({reviewToken:q.reviewToken,confirmed:true});const h=await webhookFixture(f),{session}=complete(f),otherAttempt=f.db.sqlite.prepare('SELECT c.id FROM billing_checkouts c WHERE c.workspace_id<>?').get(f.workspace.id);
 const forged={...session,metadata:{...session.metadata,affimaro_checkout:otherAttempt.id}};assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',forged)))).status,200);assert.equal((await f.api.dashboard()).entitled,false);assert.equal((await other.dashboard()).entitled,false);assert.equal(f.state.created,2);
});
