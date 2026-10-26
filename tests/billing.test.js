import {legalVersion} from '../lib/legal-catalog.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {billing,billingConfigured,billingRedirect,starterEntitled,BILLING_ORIGIN} from '../lib/billing.ts';
import {getPlanRequest,planRequests} from '../lib/plan-requests.ts';
import {platformBillingCatalog} from '../lib/platform-billing-catalog.ts';
import {billingSelection} from '../lib/billing-selection.ts';
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
      if(!result){state.created++;result={object:'checkout.session',id:`cs_${mode}_FIXTURESESSION${state.created}`,livemode:mode==='live',mode:'subscription',client_reference_id:body.get('client_reference_id'),metadata:{affimaro_workspace:body.get('metadata[affimaro_workspace]'),affimaro_checkout:body.get('metadata[affimaro_checkout]')},status:'open',payment_status:'unpaid',customer:body.get('customer'),subscription:null,currency:'usd',amount_subtotal:state.price.unit_amount,amount_total:state.price.unit_amount,expires_at:Math.floor(Date.now()/1000)+86400,url:`https://checkout.stripe.com/c/pay/FIXTURESESSION${state.created}#PRIVATE_CHECKOUT_SECRET`};if(body.get('ui_mode')==='embedded_page'){result.ui_mode='embedded_page';result.client_secret=result.id+'_secret_FIXTURECLIENT123456';result.url=null;}state.byKey.set(idem,result);state.sessions.set(result.id,result);}
      if(state.lose){state.lose=false;throw new Error('Fixture lost creation response');}
    }else if(u.pathname.endsWith('/expire')&&init.method==='POST'){result=state.sessions.get(u.pathname.split('/').at(-2));if(result)result.status='expired';}
    else if(u.pathname.startsWith('/v1/checkout/sessions/'))result=state.sessions.get(u.pathname.split('/').at(-1));
    else if(u.pathname.startsWith('/v1/subscriptions/')){assert.equal(u.searchParams.get('expand[]'),'latest_invoice');result=state.subs.get(u.pathname.split('/').at(-1));}
    else if(/^\/v1\/invoices\/in_/.test(u.pathname)){const sub=[...state.subs.values()].at(-1),at=Math.floor(Date.now()/1000);result={id:u.pathname.split('/').at(-1),object:'invoice',livemode:mode==='live',customer:sub.customer,currency:'usd',parent:{type:'subscription_details',subscription_details:{subscription:sub.id}},number:'AFF-FIXTURE-001',created:at,status:'paid',total:state.price.unit_amount,amount_paid:state.price.unit_amount,amount_remaining:0,status_transitions:{paid_at:at},invoice_pdf:'https://pay.stripe.com/invoice/acct_FIXTURE123/PRIVATE_PDF/pdf?s=ap'};}
    else if(u.pathname==='/v1/billing_portal/sessions')result={object:'billing_portal.session',customer:body.get('customer'),livemode:mode==='live',url:'https://billing.stripe.com/p/session/PRIVATE_PORTAL_SECRET'};
    else throw new Error('Unsupported fixture request '+u.pathname);
    if(!result)return Response.json({error:'not found'},{status:404});
    return Response.json(state.mutate?state.mutate(structuredClone(result),call):result);
  };
  const api=billing(db,identity('owner'),config,key,fetcher);
  return {db,workspace,config,state,fetcher,api};
}
const start=async f=>{const q=await f.api.preview({});return f.api.checkout({reviewToken:q.reviewToken,confirmed:true,policyVersion:legalVersion});};
const account=f=>f.db.sqlite.prepare('SELECT * FROM billing_accounts WHERE workspace_id=?').get(f.workspace.id);
const checkout=f=>f.db.sqlite.prepare('SELECT * FROM billing_checkouts WHERE workspace_id=? ORDER BY rowid DESC LIMIT 1').get(f.workspace.id);
const posts=f=>f.state.calls.filter(call=>call.path==='/v1/checkout/sessions'&&call.method==='POST');
function complete(f,{subscriptionId='sub_FIXTURESUBSCRIPTION123'}={}){
  const attempt=checkout(f),session=attempt.session_id?f.state.sessions.get(attempt.session_id):[...f.state.sessions.values()].find(s=>s.metadata.affimaro_checkout===attempt.id),at=Math.floor(Date.now()/1000);session.status='complete';session.payment_status='paid';session.customer='cus_FIXTURECUSTOMER123';session.subscription=subscriptionId;session.url=null;
  const sub={id:session.subscription,object:'subscription',livemode:f.config.mode==='live',customer:session.customer,status:'active',metadata:{...session.metadata},cancel_at_period_end:false,items:{has_more:false,data:[{quantity:1,current_period_start:at-60,current_period_end:at+30*86400,price:structuredClone(f.state.price)}]},latest_invoice:{object:'invoice',customer:session.customer,status:'paid',currency:'usd'}};f.state.subs.set(sub.id,sub);return {session,sub};
}
function setAgencyPrice(f,plan='starter'){
 f.config.portal='agency';f.config.plan=plan;f.config.priceId='price_AGENCY'+plan.toUpperCase()+'123';
 f.state.price={...f.state.price,id:f.config.priceId,unit_amount:{starter:3900,growth:7900,business:14900}[plan],lookup_key:platformBillingCatalog.agencyLookupKeys[plan],metadata:{affimaro_role:'agency',affimaro_plan:plan}};
}

test('agency checkout uses its own exact amounts through paid confirmation and cannot borrow a brand config',async t=>{
 for(const [plan,expected] of [['starter',3900],['growth',7900],['business',14900]]){
  const f=await fixture(t,{required:true});f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());
  await assert.rejects(f.api.preview({}),fails(409));assert.equal(f.state.calls.length,0);setAgencyPrice(f,plan);
  const quote=await f.api.preview({});assert.equal(quote.amount,expected);await f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion});
  assert.equal(checkout(f).amount,expected);assert.equal(posts(f)[0].body.get('line_items[0][price]'),f.config.priceId);assert.equal(posts(f)[0].body.get('amount'),null);
  complete(f);assert.equal((await f.api.confirm({})).status,'active');await f.api.ensureEntitlement();assert.equal(account(f).amount,expected);assert.equal((await getPlanRequest(f.db,'owner')).active_plan,plan);assert.equal(f.state.created,1);
 }
});

test('agency reviews reject old brand amounts, wrong lookup keys and forged catalog metadata before payment',async t=>{
 const f=await fixture(t);f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());setAgencyPrice(f);
 const price=structuredClone(f.state.price);
 for(const mutation of [{unit_amount:1900},{unit_amount:4900},{lookup_key:platformBillingCatalog.agencyLookupKeys.growth},{metadata:{affimaro_role:'brand',affimaro_plan:'starter'}},{metadata:{affimaro_role:'agency',affimaro_plan:'business'}}]){f.state.price={...price,...mutation};await assert.rejects(f.api.preview({}),fails(409));}
 assert.equal(f.state.created,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_checkouts').get().n,0);
});

test('an agency paid response with the wrong catalog metadata cannot persist active access',async t=>{
 const f=await fixture(t,{required:true});f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());setAgencyPrice(f);await start(f);const {sub}=complete(f);sub.items.data[0].price.metadata.affimaro_role='brand';
 await assert.rejects(f.api.refresh({}),fails(409));assert.equal((await f.api.dashboard()).entitled,false);assert.equal(account(f).invoice_paid,0);assert.equal(checkout(f).state,'review');
});

test('legacy agency checkouts retry the same frozen payload and price, then keep their paid subscription',async t=>{
 const f=await fixture(t,{required:true});f.config.platformId=platformBillingCatalog.accountId;f.config.priceId=platformBillingCatalog.prices.starter;f.state.price.id=f.config.priceId;
 f.state.lose=true;await assert.rejects(start(f),fails(502));const first=posts(f)[0].body.toString(),attempt=checkout(f).id;
 f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());Object.assign(f.config,await billingSelection(f.db,'owner','starter'));
 assert.equal(f.config.legacyPrice,true);await start(f);assert.equal(checkout(f).id,attempt);assert.equal(posts(f)[1].body.toString(),first);
 complete(f);await f.api.refresh({});await f.api.ensureEntitlement();assert.equal((await f.api.dashboard()).entitled,true);assert.equal(account(f).amount,1900);
 assert.equal((await billingSelection(f.db,'owner','starter',true)).legacyPrice,true);
 await assert.rejects(f.api.preview({}),fails(409));assert.equal(f.state.created,1);
});

test('canceling a saved old agency checkout cannot make its previous price available to a new purchase',async t=>{
 const f=await fixture(t);await start(f);f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());f.config.portal='agency';f.config.legacyPrice=true;
 await f.api.cancelCheckout({confirmed:true});assert.equal(checkout(f).state,'expired');await assert.rejects(f.api.preview({}),fails(409));assert.equal(f.state.created,1);
});

test('signed agency notifications resolve the owner’s saved agency plan and keep live paid access',async t=>{
 const f=await fixture(t,{required:true});f.config.platformId=platformBillingCatalog.accountId;f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());setAgencyPrice(f,'growth');await start(f);
 const h=await webhookFixture(f),{session,sub}=complete(f);assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',session)))).status,200);
 assert.deepEqual(f.state.webhookContext,{plan:'growth',userId:'owner',existing:true,priceId:f.config.priceId,reconcile:true});assert.equal((await f.api.dashboard()).entitled,true);assert.equal(account(f).amount,7900);
 assert.equal((await h.handle(await h.signed(h.event('invoice.paid',{object:'invoice',customer:sub.customer})))).status,200);assert.equal(f.state.created,1);
});

test('missing billing configuration preserves pilot access and does not contact a provider',async t=>{
  const f=await fixture(t),api=billing(f.db,identity('owner'),{mode:'test',liveEnabled:false,required:false},key,f.fetcher);
  const d=await api.dashboard();assert.equal(d.configured,false);assert.equal(d.entitled,false);assert.equal(d.usage.programs,1);assert.equal(d.limits.stores,1);await api.ensureEntitlement();assert.equal(f.state.calls.length,0);await assert.rejects(api.preview({}),fails(503));assert.equal(f.state.calls.length,0);
  assert.equal(billingConfigured({...f.config,liveEnabled:false}),false);assert.equal(billingConfigured({...f.config,secret:'pk_live_NOTASECRET'}),false);
});

test('subscription invoice reads use saved owner identifiers, never write or activate access, and include canceled subscriptions',async t=>{
 const f=await fixture(t);await start(f);const {sub}=complete(f);await f.api.refresh({});
 const before=JSON.stringify({account:account(f),checkout:checkout(f),plan:await getPlanRequest(f.db,'owner'),audit:f.db.sqlite.prepare('SELECT * FROM audit_events ORDER BY rowid').all()});
 const invoice={id:'in_INVOICEFIXTURE123',object:'invoice',livemode:true,customer:sub.customer,currency:'usd',parent:{type:'subscription_details',subscription_details:{subscription:sub.id}},number:'AFF-0001',created:Math.floor(Date.now()/1000),status:'paid',total:1900,amount_paid:1900,amount_remaining:0,status_transitions:{paid_at:Math.floor(Date.now()/1000)},invoice_pdf:'https://pay.stripe.com/invoice/acct_FIXTURE123/PRIVATE_LINK/pdf?s=ap'};
 f.state.fault=call=>{if(call.path!=='/v1/invoices')return;assert.equal(call.method,'GET');assert.equal(call.url.searchParams.get('customer'),sub.customer);assert.equal(call.url.searchParams.get('subscription'),sub.id);assert.equal(call.url.searchParams.get('limit'),'10');assert.equal([...call.url.searchParams].length,3);return Response.json({object:'list',data:[invoice],has_more:false});};
 assert.equal((await f.api.invoices({})).invoices[0].number,'AFF-0001');
 assert.equal(JSON.stringify({account:account(f),checkout:checkout(f),plan:await getPlanRequest(f.db,'owner'),audit:f.db.sqlite.prepare('SELECT * FROM audit_events ORDER BY rowid').all()}),before);
 f.db.sqlite.prepare("UPDATE billing_accounts SET status='canceled',invoice_paid=0,last_verified_at=NULL").run();assert.equal((await f.api.invoices({})).invoices[0].status,'paid');assert.equal((await f.api.dashboard()).entitled,false);assert.equal(account(f).status,'canceled');
 const calls=f.state.calls.length;assert.deepEqual(await billing(f.db,identity('other'),f.config,key,f.fetcher).invoices({}),{mode:'live',invoices:[],hasMore:false});assert.equal(f.state.calls.length,calls);
 for(const data of [{customer:sub.customer},{subscription:sub.id},{invoiceId:invoice.id},{starting_after:invoice.id},{amount:1}])await assert.rejects(f.api.invoices(data),fails(400));assert.equal(f.state.calls.length,calls);
});

test('subscription invoice verification rejects provider scope mismatches and permission failures without modifying billing',async t=>{
 const f=await fixture(t);await start(f);const {sub}=complete(f);await f.api.refresh({});const before=account(f),invoice={id:'in_INVOICEFIXTURE123',object:'invoice',livemode:true,customer:sub.customer,currency:'usd',parent:{type:'subscription_details',subscription_details:{subscription:sub.id}},number:'AFF-0001',created:Math.floor(Date.now()/1000),status:'paid',total:1900,amount_paid:1900,amount_remaining:0,status_transitions:{paid_at:null},invoice_pdf:null};
 for(const change of [{customer:'cus_OTHERINVOICE123'},{parent:{type:'subscription_details',subscription_details:{subscription:'sub_OTHERINVOICE123'}}},{livemode:false}]){f.state.fault=call=>call.path==='/v1/invoices'?Response.json({object:'list',data:[{...invoice,...change}],has_more:false}):undefined;await assert.rejects(f.api.invoices({}),fails(409));}
 f.state.fault=call=>call.path==='/v1/invoices'?Response.json({error:{message:'PRIVATE_PROVIDER_DETAILS'}},{status:403}):undefined;await assert.rejects(f.api.invoices({}),e=>e instanceof AppError&&e.status===502&&!e.message.includes('PRIVATE_PROVIDER_DETAILS'));assert.deepEqual(account(f),before);assert.equal(f.state.created,1);
 f.state.fault=call=>call.path==='/v1/account'?Response.json({object:'account',id:'acct_OTHERPLATFORM123'}):undefined;const reads=f.state.calls.filter(c=>c.path==='/v1/invoices').length;await assert.rejects(f.api.invoices({}),fails(409));assert.equal(f.state.calls.filter(c=>c.path==='/v1/invoices').length,reads);
});

test('affiliate and creator accounts cannot enter subscription billing even when an old business workspace exists',async t=>{
 for(const role of ['affiliate','creator']){
  const f=await fixture(t,{required:true}),quote=await f.api.preview({});
  f.db.sqlite.prepare('INSERT INTO account_portals (user_id,portal,created_at) VALUES (?,?,?)').run('owner',role,new Date().toISOString());
  const calls=f.state.calls.length;
  for(const operation of [()=>f.api.dashboard(),()=>f.api.invoices({}),()=>f.api.preview({}),()=>f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion}),()=>f.api.refresh({}),()=>f.api.confirm({}),()=>f.api.portal({})])await assert.rejects(operation(),fails(403));
  assert.equal(f.state.calls.length,calls);assert.equal(f.state.created,0);
  for(const table of ['billing_accounts','billing_checkouts'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
 }
});

test('independent checkout freezes its return origin so retries keep the original idempotent payload',async t=>{
  const f=await fixture(t);f.config.origin='https://affimaro.example';f.state.lose=true;await assert.rejects(start(f),fails(502));assert.equal(checkout(f).return_origin,'https://affimaro.example');
  const first=posts(f)[0].body.toString();f.config.origin='https://new.affimaro.example';await start(f);assert.equal(posts(f)[1].body.toString(),first);assert.equal(posts(f)[1].body.get('success_url'),'https://affimaro.example/billing?checkout_return=1');
  complete(f);await f.api.refresh({});await f.api.portal({});assert.equal(f.state.calls.findLast(call=>call.path==='/v1/billing_portal/sessions').body.get('return_url'),'https://new.affimaro.example/billing');
});

test('subscription reviews derive owner/workspace and reject tenant or amount injection',async t=>{
  const f=await fixture(t),quote=await f.api.preview({});
  const other=billing(f.db,identity('other'),f.config,key,f.fetcher);await assert.rejects(other.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion}),fails(400));
  await assert.rejects(f.api.preview({amount:1}),fails(400));await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion,priceId:'price_OTHER123'}),fails(400));
  await assert.rejects(billing(f.db,identity('affiliate'),f.config,key,f.fetcher).preview({}),fails(404));assert.equal((await other.dashboard()).account,null);assert.equal(posts(f).length,0);
});

test('only an active fixed monthly USD licensed price in the correct account/mode is offered',async t=>{
  const f=await fixture(t),price=structuredClone(f.state.price);
  for(const change of [{currency:'eur'},{type:'one_time'},{active:false},{livemode:false},{unit_amount:0},{unit_amount:100000000},{billing_scheme:'tiered'},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}},{recurring:{interval:'month',interval_count:1,usage_type:'metered'}},{transform_quantity:{divide_by:2}},{custom_unit_amount:{enabled:true}}]){f.state.price={...price,...change};await assert.rejects(f.api.preview({}),fails(409));}
  f.state.price=price;f.state.mutate=(raw,call)=>call.path==='/v1/account'?{...raw,id:'acct_OTHERACCOUNT123'}:raw;await assert.rejects(f.api.preview({}),fails(409));assert.equal(posts(f).length,0);
});

test('checkout requires fresh bound review and explicit confirmation',async t=>{
  const f=await fixture(t),quote=await f.api.preview({});await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:false}),fails(400));
  const expired=await sealPayment({workspace:f.workspace.id,owner:'owner',platform:f.config.platformId,price:f.config.priceId,amount:1900,mode:'live',policyVersion:legalVersion,at:new Date(Date.now()-360000).toISOString()},key,`billing-review/${f.workspace.id}/owner`);
  await assert.rejects(f.api.checkout({reviewToken:expired,confirmed:true,policyVersion:legalVersion}),fails(409));
  const changed=billing(f.db,identity('owner'),{...f.config,priceId:'price_CHANGED12345'},key,f.fetcher);await assert.rejects(changed.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion}),fails(409));assert.equal(posts(f).length,0);
});

test('opening checkout freezes the payload, encrypts the URL, and never activates paid access',async t=>{
  const f=await fixture(t),result=await start(f);assert.equal(result.outcome,'checkout');assert.equal(checkout(f).state,'open');assert.ok(!checkout(f).encrypted_url.includes('PRIVATE_CHECKOUT_SECRET'));assert.equal(account(f).status,'none');assert.equal((await f.api.dashboard()).entitled,false);
  const body=posts(f)[0].body;assert.equal(body.get('line_items[0][price]'),f.config.priceId);assert.equal(body.get('line_items[0][quantity]'),'1');assert.equal(body.get('client_reference_id'),f.workspace.id);assert.equal(body.get('success_url'),BILLING_ORIGIN+'/billing?checkout_return=1');assert.equal(body.get('automatic_tax[enabled]'),'false');assert.equal(body.get('adaptive_pricing[enabled]'),'false');assert.equal(body.get('customer_email'),'owner@example.com');assert.equal(body.get('amount'),null);
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

test('billing links accept both Stripe-hosted Checkout routes and preserve the complete provider URL',()=>{
  for(const path of ['/c/pay/cs_live_FIXTURESESSION123','/g/pay/cs_live_FIXTURESESSION123']){
    const url='https://checkout.stripe.com'+path+'?locale=en#FIXTURE_CHECKOUT_FRAGMENT';
    assert.equal(billingRedirect(url,'checkout'),url);
  }
  for(const value of ['http://checkout.stripe.com/g/pay/session','https://checkout.stripe.com.evil.example/g/pay/session','https://user:pass@checkout.stripe.com/g/pay/session','https://checkout.stripe.com:444/g/pay/session','https://checkout.stripe.com/g/other/session','https://checkout.stripe.com/g/pay','https://checkout.stripe.com/g/pay/../other','https://billing.stripe.com/g/pay/session'])assert.throws(()=>billingRedirect(value,'checkout'),fails(502));
});

test('a saved uncertain checkout resumes through Stripe g/pay using the original attempt and idempotency payload',async t=>{
  const f=await fixture(t);
  f.state.mutate=raw=>raw.object==='checkout.session'?{...raw,url:raw.url?.replace('/c/pay/','/g/pay/')}:raw;
  f.state.lose=true;await assert.rejects(start(f),fails(502));
  const first=checkout(f),payload=posts(f)[0].body.toString(),idempotency=posts(f)[0].headers['Idempotency-Key'];
  assert.equal(first.state,'review');assert.equal(first.session_id,null);
  const resumed=await start(f);
  assert.equal(resumed.outcome,'checkout');assert.match(resumed.url,/^https:\/\/checkout\.stripe\.com\/g\/pay\//);
  assert.equal(checkout(f).id,first.id);assert.equal(checkout(f).state,'open');assert.equal(f.state.created,1);
  assert.equal(posts(f).length,2);assert.equal(posts(f)[1].headers['Idempotency-Key'],idempotency);assert.equal(posts(f)[1].body.toString(),payload);
  assert.ok(!JSON.stringify(await f.api.dashboard()).includes('PRIVATE_CHECKOUT_SECRET'));
  assert.equal(account(f).subscription_id,null);assert.equal((await f.api.dashboard()).entitled,false);
  assert.equal((await start(f)).url,resumed.url);assert.equal(posts(f).length,2);assert.equal(f.state.created,1);
});

test('agency billing management returns to the agency portal while checkout retries retain their original payload',async t=>{
 const f=await fixture(t);f.db.sqlite.prepare('INSERT INTO account_portals (user_id,portal,created_at) VALUES (?,?,?)').run('owner','agency',new Date().toISOString());f.config.origin='https://affimaro.example';setAgencyPrice(f);
 f.state.lose=true;await assert.rejects(start(f),fails(502));const first=posts(f)[0].body.toString();await start(f);assert.equal(posts(f)[1].body.toString(),first);
 complete(f);await f.api.refresh({});await f.api.portal({});assert.equal(f.state.calls.findLast(call=>call.path==='/v1/billing_portal/sessions').body.get('return_url'),'https://affimaro.example/agency/billing');
});

test('a billing lease prevents concurrent checkouts from creating duplicate sessions',async t=>{
  const f=await fixture(t),quote=await f.api.preview({});let release,entered;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  f.state.fault=async call=>{if(call.path==='/v1/checkout/sessions'&&call.method==='POST'){entered();await gate;}return null;};
  const first=f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion});await started;
  await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion}),fails(409));release();await first;assert.equal(f.state.created,1);assert.equal(posts(f).length,1);assert.equal(account(f).lease_id,null);
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
 const handle=request=>billingWebhook(request,{db:f.db,key,origin:'https://affimaro.example',config:async(plan,context)=>{f.state.webhookContext={plan,...context};if(f.state.resolveWebhookConfig){const selected=await billingSelection(f.db,context.userId,plan,context.existing,context.priceId,context.reconcile);return {...f.config,...selected,priceId:selected.priceId||f.config.priceId};}return f.config;},fetcher:f.fetcher});
 return {event,signed,handle};
}
test('new Checkout payloads use dynamic methods and a stable integration identifier, while legacy unknown requests are held',async t=>{
 const f=await fixture(t);f.state.lose=true;await assert.rejects(start(f));const attempt=checkout(f);assert.equal(attempt.payload_version,5);assert.match(attempt.integration_suffix,/^[a-z]{8}$/);const first=posts(f)[0].body;assert.equal(first.get('payment_method_types[0]'),null);assert.match(first.get('integration_identifier'),/^affimaro_checkout_[a-z]{8}$/);await start(f);assert.equal(posts(f)[1].body.toString(),first.toString());
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
 const f=await fixture(t);await start(f);const other=billing(f.db,identity('other'),f.config,key,f.fetcher),q=await other.preview({});await other.checkout({reviewToken:q.reviewToken,confirmed:true,policyVersion:legalVersion});const h=await webhookFixture(f),{session}=complete(f),otherAttempt=f.db.sqlite.prepare('SELECT c.id FROM billing_checkouts c WHERE c.workspace_id<>?').get(f.workspace.id);
 const forged={...session,metadata:{...session.metadata,affimaro_checkout:otherAttempt.id}};assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',forged)))).status,200);assert.equal((await f.api.dashboard()).entitled,false);assert.equal((await other.dashboard()).entitled,false);assert.equal(f.state.created,2);
});


test('embedded checkout stays on site, freezes retries, resumes the same session and activates paid capacity automatically',async t=>{
 const f=await fixture(t,{required:true}),at=new Date().toISOString();f.config.plan='growth';f.config.priceId='price_GROWTHBILLING123';f.config.publishableKey='pk_live_FIXTUREPUBLICKEY123456';f.config.origin='https://affimaro.example';f.state.price={...f.state.price,id:f.config.priceId,unit_amount:4900};
 f.db.sqlite.prepare("INSERT INTO account_portals VALUES ('owner','brand',?)").run(at);
 f.db.sqlite.prepare("INSERT INTO platform_applications(user_id,portal,status,created_at,updated_at) VALUES ('owner','brand','approved',?,?)").run(at,at);
 f.db.sqlite.prepare("INSERT INTO plan_requests(user_id,requested_plan,active_plan,status,updated_at) VALUES ('owner','starter','starter','pending',?)").run(at);
 const selected=await planRequests(f.db,identity('owner')).choose({plan:'growth',revision:1});assert.equal(selected.status,'approved');assert.equal(selected.active_plan,'starter');
 f.state.lose=true;await assert.rejects(start(f),fails(502));const first=posts(f)[0].body.toString();assert.equal(checkout(f).payload_version,4);
 f.config.origin='https://different.example';const result=await start(f);assert.equal(result.outcome,'embedded');assert.equal(result.publishableKey,f.config.publishableKey);assert.ok(result.clientSecret.startsWith(checkout(f).session_id+'_secret_'));assert.equal(result.url,undefined);assert.equal(posts(f)[1].body.toString(),first);
 const body=posts(f)[0].body;assert.equal(body.get('ui_mode'),'embedded_page');assert.equal(body.get('redirect_on_completion'),'if_required');assert.equal(body.get('return_url'),'https://affimaro.example/billing?checkout_return=1');assert.equal(body.has('success_url'),false);assert.equal(body.has('cancel_url'),false);
 assert.equal(checkout(f).encrypted_url,null);assert.ok(!JSON.stringify(checkout(f)).includes('FIXTURECLIENT'));assert.equal((await getPlanRequest(f.db,'owner')).active_plan,'starter');
 const calls=posts(f).length;const resumed=await start(f);assert.equal(resumed.clientSecret,result.clientSecret);assert.equal(posts(f).length,calls);
 complete(f);await f.api.refresh({});assert.equal((await getPlanRequest(f.db,'owner')).active_plan,'growth');assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM platform_review_events').get().n,0);
 await assert.rejects(start(f),fails(409));
});

test('embedded session secrets are validated and a pending checkout cannot be reused for another quoted package',async t=>{
 const f=await fixture(t);f.config.publishableKey='pk_live_FIXTUREPUBLICKEY123456';f.state.mutate=(raw,call)=>call.path==='/v1/checkout/sessions'?{...raw,client_secret:'cs_live_OTHERSESSION_secret_FIXTURESECRET123'}:raw;
 await assert.rejects(start(f),fails(502));assert.equal(checkout(f).state,'review');
 f.state.mutate=null;await start(f);f.config.plan='growth';f.config.priceId='price_GROWTHBILLING123';f.state.price={...f.state.price,id:f.config.priceId,unit_amount:4900};const before=posts(f).length;
 await assert.rejects(start(f),fails(409));assert.equal(posts(f).length,before);
});

test('an unpaid owned checkout can be expired, while another workspace or a completed payment cannot be canceled',async t=>{const f=await fixture(t);await start(f);await assert.rejects(f.api.cancelCheckout({confirmed:false}),fails(400));const other=billing(f.db,identity('other'),f.config,key,f.fetcher);await assert.rejects(other.cancelCheckout({confirmed:true}),fails(404));const result=await f.api.cancelCheckout({confirmed:true});assert.equal(result.outcome,'expired');assert.equal(checkout(f).state,'expired');assert.equal(f.state.calls.filter(c=>c.path.endsWith('/expire')).length,1);assert.equal(account(f).subscription_id,null);});

test('canceling a completed checkout verifies its subscription and never sends an expire request',async t=>{const f=await fixture(t);await start(f);complete(f);await assert.rejects(f.api.cancelCheckout({confirmed:true}),fails(409));assert.equal(checkout(f).state,'completed');assert.equal(account(f).status,'active');assert.equal(f.state.calls.filter(c=>c.path.endsWith('/expire')).length,0);});

test('a stale authenticated checkout request cannot create a provider payment after account closure',async t=>{const f=await fixture(t),quote=await f.api.preview({});const {closeAccount}=await import('../lib/account-closure.ts');await closeAccount(f.db,identity('owner'),'Leaving the fixture platform.');await assert.rejects(f.api.checkout({reviewToken:quote.reviewToken,confirmed:true,policyVersion:legalVersion}),/Account is closed/);assert.equal(posts(f).length,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_checkouts').get().n,0);});


test('saved-payment confirmation reports open, processing and verified access without creating another checkout',async t=>{
 const f=await fixture(t,{required:true});f.config.publishableKey='pk_live_FIXTUREPUBLICKEY123456';await start(f);const created=posts(f).length;
 assert.deepEqual(await f.api.confirm({}),{status:'open',mode:'live'});
 const {session,sub}=complete(f);session.payment_status='unpaid';
 for(let i=0;i<3;i++){assert.deepEqual(await f.api.confirm({}),{status:'processing',mode:'live'});assert.equal(checkout(f).state,'open');assert.equal(checkout(f).last_error,null);assert.equal(account(f).subscription_id,null);assert.equal(starterEntitled(account(f)),false);}
 assert.equal((await f.api.cancelCheckout({confirmed:true})).outcome,'awaiting_payment');assert.equal(f.state.calls.filter(c=>c.path.endsWith('/expire')).length,0);assert.equal((await start(f)).outcome,'awaiting_payment');assert.equal(posts(f).length,created);
 session.payment_status='paid';sub.latest_invoice.status='open';assert.deepEqual(await f.api.confirm({}),{status:'processing',mode:'live'});assert.equal(starterEntitled(account(f)),false);
 sub.latest_invoice.status='paid';assert.deepEqual(await f.api.confirm({}),{status:'active',mode:'live'});assert.equal((await f.api.dashboard()).entitled,true);assert.equal(posts(f).length,created);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_checkouts').get().n,1);
 assert.ok(!/clientSecret|publishableKey|customer_id|subscription_id|FIXTURECLIENT/.test(JSON.stringify(await f.api.confirm({}))));
});

test('confirmation does not equate a return, test payment, expiration, failed invoice or wrong customer with live access',async t=>{
 const empty=await fixture(t);await assert.rejects(empty.api.confirm({}),fails(404));assert.equal(posts(empty).length,0);
 const testing=await fixture(t,{mode:'test',required:true});await start(testing);complete(testing);assert.deepEqual(await testing.api.confirm({}),{status:'test_complete',mode:'test'});assert.equal(starterEntitled(account(testing)),false);
 const expired=await fixture(t);await start(expired);expired.state.sessions.get(checkout(expired).session_id).status='expired';assert.deepEqual(await expired.api.confirm({}),{status:'expired',mode:'live'});assert.equal(posts(expired).length,1);
 const failed=await fixture(t);await start(failed);const {sub}=complete(failed);sub.status='past_due';sub.latest_invoice.status='open';assert.deepEqual(await failed.api.confirm({}),{status:'attention',mode:'live'});assert.equal(starterEntitled(account(failed)),false);
 const forged=await fixture(t);await start(forged);const saved=complete(forged);saved.session.client_reference_id=crypto.randomUUID();await assert.rejects(forged.api.confirm({}),fails(409));assert.equal(starterEntitled(account(forged)),false);assert.equal(posts(forged).length,1);
 await assert.rejects(failed.api.confirm({workspaceId:expired.workspace.id}),fails(400));
});


test('a delayed payment failure is linked without granting access and can recover through a later paid invoice',async t=>{
 const f=await fixture(t,{required:true});await start(f);const {session,sub}=complete(f);session.payment_status='unpaid';sub.status='past_due';sub.latest_invoice.status='open';
 const webhook=await webhookFixture(f);assert.equal((await webhook.handle(await webhook.signed(webhook.event('checkout.session.async_payment_failed',session)))).status,200);
 assert.equal(account(f).subscription_id,sub.id);assert.equal(account(f).invoice_paid,0);assert.equal((await f.api.confirm({})).status,'attention');assert.equal(starterEntitled(account(f)),false);await assert.rejects(start(f),fails(409));assert.equal(posts(f).length,1);
 sub.status='active';sub.latest_invoice.status='paid';const event=webhook.event('invoice.paid',{object:'invoice',id:'in_FIXTUREINVOICE123',customer:sub.customer});assert.equal((await webhook.handle(await webhook.signed(event))).status,200);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(posts(f).length,1);
});

async function closedSubscriptionFixture(t,{role='agency',legacy=false}={}){
 const f=await fixture(t,{required:true});f.config.platformId=platformBillingCatalog.accountId;
 if(legacy||role==='brand'){f.config.priceId=platformBillingCatalog.prices.starter;f.state.price.id=f.config.priceId;}else setAgencyPrice(f);
 if(!legacy)f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner',role,new Date().toISOString());
 await start(f);const old=complete(f);await f.api.refresh({});old.sub.status='canceled';await f.api.refresh({});
 if(legacy)f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());
 const h=await webhookFixture(f);f.state.resolveWebhookConfig=true;
 return {f,h,old};
}

test('a later signed event can recheck a canceled legacy agency record without reopening its old price',async t=>{
 const {f,h,old}=await closedSubscriptionFixture(t,{legacy:true});setAgencyPrice(f);const before=f.state.created;
 assert.equal((await h.handle(await h.signed(h.event('customer.subscription.deleted',old.sub)))).status,200);
 assert.equal(account(f).status,'canceled');assert.equal(account(f).amount,1900);assert.equal(f.state.created,before);
 const selected=await billingSelection(f.db,'owner','starter',true);assert.equal(selected.legacyPrice,undefined);assert.equal(selected.priceId,undefined);
 const record=await billingSelection(f.db,'owner',undefined,true,old.sub.items.data[0].price.id,true),api=billing(f.db,identity('owner'),{...f.config,...record},key,f.fetcher);
 assert.deepEqual(await api.confirm({}),{status:'attention',mode:'live'});await assert.rejects(api.preview({}),fails(409));
});

test('signed completion activates a new agency purchase after an old canceled subscription without a browser return',async t=>{
 const {f,h,old}=await closedSubscriptionFixture(t,{legacy:true});setAgencyPrice(f,'growth');await start(f);const current=complete(f,{subscriptionId:'sub_FIXTURESECOND123'}),before=posts(f).length;
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',current.session)))).status,200);
 assert.equal(account(f).subscription_id,current.sub.id);assert.equal(account(f).amount,7900);assert.equal(checkout(f).state,'completed');assert.equal((await f.api.dashboard()).entitled,true);assert.equal((await getPlanRequest(f.db,'owner')).active_plan,'growth');assert.equal(posts(f).length,before);assert.equal(old.sub.status,'canceled');
});

test('late old checkout events cannot disturb a newer unresolved purchase or overwrite its saved result',async t=>{
 const {f,h,old}=await closedSubscriptionFixture(t,{legacy:true});setAgencyPrice(f,'growth');await start(f);const current=checkout(f),before=f.state.calls.length;
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',old.session)))).status,200);
 assert.equal(checkout(f).id,current.id);assert.equal(checkout(f).state,'open');assert.equal(account(f).status,'canceled');assert.equal(f.state.calls.length,before);
 const fresh=complete(f,{subscriptionId:'sub_FIXTURESECOND123'});assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',fresh.session)))).status,200);
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',old.session)))).status,200);assert.equal(account(f).subscription_id,fresh.sub.id);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,2);
});

test('an old invoice notification reconciles only the currently saved paid purchase with fresh provider proof',async t=>{
 const {f,h}=await closedSubscriptionFixture(t,{legacy:true});setAgencyPrice(f,'business');await start(f);const current=complete(f,{subscriptionId:'sub_FIXTURESECOND123'});
 assert.equal((await h.handle(await h.signed(h.event('invoice.paid',{object:'invoice',customer:current.sub.customer})))).status,200);
 assert.equal(account(f).subscription_id,current.sub.id);assert.equal(account(f).amount,14900);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,2);
});

test('a replacement brand purchase also fulfills through its own signed checkout notification',async t=>{
 const {f,h}=await closedSubscriptionFixture(t,{role:'brand'});f.config.plan='growth';f.config.priceId=platformBillingCatalog.prices.growth;f.state.price={...f.state.price,id:f.config.priceId,unit_amount:4900};await start(f);const current=complete(f,{subscriptionId:'sub_FIXTURESECOND123'});
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',current.session)))).status,200);assert.equal(account(f).subscription_id,current.sub.id);assert.equal(account(f).amount,4900);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,2);
});

test('reconciliation-only billing cannot create a review or payment using a purchase review token',async t=>{
 const f=await fixture(t),q=await f.api.preview({}),api=billing(f.db,identity('owner'),{...f.config,reconcileOnly:true},key,f.fetcher),before=f.state.calls.length;
 await assert.rejects(api.preview({}),fails(409));await assert.rejects(api.checkout({reviewToken:q.reviewToken,confirmed:true,policyVersion:legalVersion}),fails(409));assert.equal(f.state.calls.length,before);assert.equal(f.state.created,0);
});

test('a replacement after an incomplete-expired agency subscription recovers a lost creation response through its signed event',async t=>{
 const f=await fixture(t,{required:true});f.config.platformId=platformBillingCatalog.accountId;f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run('owner','agency',new Date().toISOString());setAgencyPrice(f);await start(f);
 const first=complete(f);first.session.payment_status='unpaid';first.sub.status='incomplete_expired';first.sub.latest_invoice.status='open';await f.api.refresh({});assert.equal(account(f).status,'incomplete_expired');assert.equal((await f.api.dashboard()).entitled,false);
 const h=await webhookFixture(f);f.state.resolveWebhookConfig=true;setAgencyPrice(f,'growth');f.state.lose=true;await assert.rejects(start(f),fails(502));assert.equal(checkout(f).session_id,null);const current=complete(f,{subscriptionId:'sub_FIXTURESECOND123'}),before=posts(f).length;
 assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',current.session)))).status,200);assert.equal(account(f).subscription_id,current.sub.id);assert.equal(account(f).amount,7900);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(posts(f).length,before);assert.equal(f.state.created,2);
});

test('an old paid invoice event cannot activate an unpaid replacement checkout',async t=>{
 const {f,h,old}=await closedSubscriptionFixture(t,{legacy:true});setAgencyPrice(f,'growth');await start(f);const current=complete(f,{subscriptionId:'sub_FIXTURESECOND123'});current.session.payment_status='unpaid';current.sub.latest_invoice.status='open';
 assert.equal((await h.handle(await h.signed(h.event('invoice.paid',{object:'invoice',customer:old.sub.customer})))).status,200);assert.equal(account(f).status,'canceled');assert.equal(checkout(f).state,'open');assert.equal((await f.api.dashboard()).entitled,false);assert.equal(f.state.created,2);
 current.session.payment_status='paid';current.sub.latest_invoice.status='paid';assert.equal((await h.handle(await h.signed(h.event('checkout.session.async_payment_succeeded',current.session)))).status,200);assert.equal(account(f).subscription_id,current.sub.id);assert.equal((await f.api.dashboard()).entitled,true);assert.equal(f.state.created,2);
});

test('new checkouts require current policy acceptance and retain the accepted actor, package, email and amount',async t=>{
 const f=await fixture(t),q=await f.api.preview({});assert.equal(q.policyVersion,legalVersion);const before=f.state.calls.length;
 for(const input of [{reviewToken:q.reviewToken,confirmed:true},{reviewToken:q.reviewToken,confirmed:true,policyVersion:'2000-01-01'},{reviewToken:q.reviewToken,confirmed:false,policyVersion:legalVersion}])await assert.rejects(f.api.checkout(input),fails(400));
 assert.equal(f.state.calls.length,before);assert.equal(f.state.created,0);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM billing_checkout_acceptances').get().n,0);
 await f.api.checkout({reviewToken:q.reviewToken,confirmed:true,policyVersion:legalVersion});const row=f.db.sqlite.prepare('SELECT * FROM billing_checkout_acceptances').get();assert.equal(row.actor_id,'owner');assert.equal(row.portal,'brand');assert.equal(row.plan,'starter');assert.equal(row.amount,1900);assert.equal(row.email,'owner@example.com');assert.equal(row.policy_version,legalVersion);assert.equal(row.checkout_id,checkout(f).id);
 const body=posts(f)[0].body;assert.equal(body.get('customer_email'),'owner@example.com');assert.equal(body.get('metadata[affimaro_policy]'),legalVersion);assert.equal(body.get('subscription_data[metadata][affimaro_policy]'),legalVersion);assert.equal(body.get('payment_method_types[0]'),null);
 await start(f);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM billing_checkout_acceptances').get().n,1);assert.equal(f.state.created,1);
});

test('emailing an invoice requires its saved live customer and subscription and never trusts a form destination',async t=>{
 const f=await fixture(t);await start(f);complete(f);await f.api.refresh({});const before=f.state.calls.length;
 await assert.rejects(f.api.emailInvoice({invoiceId:'in_FIXTUREPAID123',email:'attacker@example.com'}),fails(400));assert.equal(f.state.calls.length,before);
 f.state.mutate=(raw,call)=>call.path.startsWith('/v1/invoices/')?{...raw,customer:'cus_OTHERPRIVATE123'}:raw;
 await assert.rejects(f.api.emailInvoice({invoiceId:'in_FIXTUREPAID123'}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM billing_invoice_emails').get().n,0);
 f.state.mutate=null;const status=await f.api.emailInvoice({invoiceId:'in_FIXTUREPAID123'});assert.equal(status.status,'pending');assert.equal(status.canSend,false);
 const row=f.db.sqlite.prepare('SELECT * FROM billing_invoice_emails').get();assert.equal(row.user_id,'owner');assert.ok(!row.encrypted_payload.includes('PRIVATE_PDF'));assert.ok(!row.encrypted_payload.includes('owner@example.com'));assert.equal(row.attempts,0);
});

test('paid invoice email delivery freezes its payload, deduplicates retries and refuses to retry through a rotated key',async t=>{
 const {saveBillingEmailSetup,deliverInvoiceEmail}=await import('../lib/billing-email.ts');
 const f=await fixture(t);await service(f.db,identity('mail-admin')).saveAccount({name:'Mail admin'});f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run('mail-admin',new Date().toISOString());
 await saveBillingEmailSetup(f.db,identity('mail-admin'),key,{revision:0,enabled:true,apiKey:'re_FIXTURESENDINGONLY123456789'});
 await start(f);complete(f);await f.api.refresh({});let calls=0,payload,idem;
 const fetcher=async(url,init)=>{if(url==='https://api.resend.com/emails'){calls++;payload=JSON.parse(init.body);idem=init.headers['Idempotency-Key'];return Response.json({id:'11111111-1111-4111-8111-111111111111'});}return f.fetcher(url,init);};
 const api=billing(f.db,identity('owner'),f.config,key,fetcher);await api.emailInvoice({invoiceId:'in_FIXTUREEMAIL123'});await api.emailInvoice({invoiceId:'in_FIXTUREEMAIL123'});assert.equal(calls,1);assert.deepEqual(payload.to,['owner@example.com']);assert.match(payload.html,/Download invoice PDF/);assert.match(payload.text,/1900|19\.00/);assert.equal(idem,'affimaro-paid-invoice-in_FIXTUREEMAIL123');assert.equal(f.db.sqlite.prepare('SELECT status FROM billing_invoice_emails').get().status,'accepted');
 const failing=billing(f.db,identity('owner'),f.config,key,async(url,init)=>url==='https://api.resend.com/emails'?Response.json({error:'unavailable'},{status:503}):f.fetcher(url,init));await failing.emailInvoice({invoiceId:'in_FIXTUREFAILED123'});
 const failed=f.db.sqlite.prepare("SELECT * FROM billing_invoice_emails WHERE status='failed'").get();assert.equal(failed.attempts,1);assert.equal(failed.sending_revision,1);
 await saveBillingEmailSetup(f.db,identity('mail-admin'),key,{revision:1,enabled:true,apiKey:'re_FIXTUREROTATEDONLY123456789'});await deliverInvoiceEmail(f.db,failed.invoice_id,key,fetcher,Date.now()+61000);assert.equal(calls,1);assert.equal(f.db.sqlite.prepare('SELECT status FROM billing_invoice_emails WHERE invoice_id=?').get(failed.invoice_id).status,'review');
});

test('a signed paid invoice queues its verified invoice once and retains payment access independently of email setup',async t=>{
 const f=await fixture(t);await start(f);const h=await webhookFixture(f),{session,sub}=complete(f);assert.equal((await h.handle(await h.signed(h.event('checkout.session.completed',session)))).status,200);
 const event=h.event('invoice.paid',{object:'invoice',id:'in_WEBHOOKPAID123',customer:sub.customer});assert.equal((await h.handle(await h.signed(event))).status,200);assert.equal((await h.handle(await h.signed(event))).status,200);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM billing_invoice_emails').get().n,1);assert.equal(account(f).invoice_paid,1);assert.equal((await f.api.dashboard()).entitled,true);
});

test('invoice emails stop safely when the verified recipient changes or the customer account closes',async t=>{
 const {saveBillingEmailSetup,deliverInvoiceEmail}=await import('../lib/billing-email.ts');const f=await fixture(t);await start(f);complete(f);await f.api.refresh({});await f.api.emailInvoice({invoiceId:'in_CHANGEDDEST123'});
 await service(f.db,identity('mail-admin')).saveAccount({name:'Mail admin'});f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run('mail-admin',new Date().toISOString());await saveBillingEmailSetup(f.db,identity('mail-admin'),key,{revision:0,enabled:true,apiKey:'re_FIXTURESENDINGONLY123456789'});
 let sends=0;const fetcher=async()=>{sends++;throw new Error('No send expected');};f.db.sqlite.prepare('UPDATE accounts SET email=? WHERE id=?').run('new-address@example.com','owner');await deliverInvoiceEmail(f.db,'in_CHANGEDDEST123',key,fetcher);assert.equal(sends,0);assert.equal(f.db.sqlite.prepare('SELECT status FROM billing_invoice_emails').get().status,'review');
 f.db.sqlite.prepare('UPDATE accounts SET email=? WHERE id=?').run('owner@example.com','owner');await f.api.emailInvoice({invoiceId:'in_CLOSEDEST123'});f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run('owner','Fixture closure',new Date().toISOString());await deliverInvoiceEmail(f.db,'in_CLOSEDEST123',key,fetcher);assert.equal(sends,0);
});
