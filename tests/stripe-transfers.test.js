import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {payments} from '../lib/payments.ts';
import {commerce,receiveStoreEvent} from '../lib/woocommerce.ts';
import {paymentConnections} from '../lib/payment-connections.ts';
import {stripeConnect} from '../lib/stripe-connect.ts';
import {stripeTransfers} from '../lib/stripe-transfers.ts';
import {sealPayment,openPayment} from '../lib/payment-crypto.ts';
const key='ef'.repeat(32),identity=id=>({userId:id,email:`${id}@example.com`}),fails=n=>e=>e instanceof AppError&&e.status===n;
const bank={beneficiary:'Example Partner',bank:'Example Bank',country:'US',currency:'USD',account:'123456789012',swift:'EXAMUS33',routing:'012345678',address:''};
async function fixture(t,{testMode=false}={}){
  const db=database(t),owner=service(db,identity('owner')),affiliate=service(db,identity('affiliate'));
  await owner.saveAccount({name:'Example Owner'});await owner.createBusiness({name:'Example Business',website:''});await affiliate.saveAccount({name:'Example Partner'});await affiliate.saveAffiliate({name:'Example Partner',channel:'Blog',website:'',bio:''});
  const program=(await owner.businessDashboard()).program,application=await affiliate.apply({programId:program.id});await owner.review({applicationId:application.id,status:'approved'});
  const configured=await commerce(db,identity('owner')).configure({action:'connect',storeUrl:'https://store.example'});
  const f={db,owner,affiliate,application,connection:configured.connection,signingKey:configured.key,merchant:payments(db,identity('owner'),key),partner:payments(db,identity('affiliate'),key)};
  f.referral=await event(f,{kind:'referral',applicationId:application.id});f.createdAt=new Date().toISOString();await sale(f);await approve(f);await f.partner.saveBank(bank);
  const state={calls:[],available:100000,live:!testMode,account:null,transfers:new Map(),byKey:new Map(),created:0,fault:null,afterTransfer:null,mutateResponse:null,loseAfter:false,loseBefore:false,insufficient:false,platform:'acct_PLATFORMTRANSFER12345'};
  const fetcher=async(url,init)=>{
    const u=new URL(url),path=u.pathname,params=new URLSearchParams(init.body||'');assert.equal(u.origin,'https://api.stripe.com');assert.equal(init.redirect,'manual');assert.ok(!url.includes('FIXTUREKEY'));const call={path,params,method:init.method,headers:init.headers,url:u};state.calls.push(call);
    if(state.fault){const response=await state.fault(call);if(response)return response;}
    if(path==='/v1/account')return Response.json({object:'account',id:state.platform,country:'US',default_currency:'usd',payouts_enabled:true,business_profile:{name:'Example Business'}});
    if(path==='/v1/balance')return Response.json({object:'balance',livemode:state.live,available:[{currency:'usd',amount:state.available}]});
    if(path==='/v1/accounts'&&init.method==='POST'){state.account={id:'acct_RECIPIENTTRANSFER12345',object:'account',country:'US',details_submitted:true,payouts_enabled:true,capabilities:{transfers:'active'},controller:{stripe_dashboard:{type:'express'},requirement_collection:'stripe'},metadata:{affimaro_recipient:params.get('metadata[affimaro_recipient]'),affimaro_application:params.get('metadata[affimaro_application]'),affimaro_workspace:params.get('metadata[affimaro_workspace]')},requirements:{currently_due:[],pending_verification:[],disabled_reason:null}};return Response.json(state.account);}
    if(path.startsWith('/v1/accounts/'))return Response.json(state.account);
    if(path==='/v1/account_links')return Response.json({object:'account_link',url:'https://connect.stripe.com/setup/s/FIXTURE',expires_at:Math.floor(Date.now()/1000)+300});
    if(path==='/v1/transfers'&&init.method==='GET')return Response.json({object:'list',has_more:false,data:[...state.transfers.values()].filter(v=>v.transfer_group===u.searchParams.get('transfer_group'))});
    if(path.startsWith('/v1/transfers/')){const v=state.transfers.get(path.split('/').at(-1));return v?Response.json(v):new Response('{}',{status:404});}
    if(path==='/v1/transfers'&&init.method==='POST'){
      if(state.loseBefore){state.loseBefore=false;throw new Error('Fixture interrupted before transfer');}
      if(state.insufficient)return Response.json({error:{code:'balance_insufficient',message:'PRIVATE PROVIDER MESSAGE'}},{status:400});
      const idem=init.headers['Idempotency-Key'];assert.ok(idem);let proof=state.byKey.get(idem);
      if(!proof){state.created++;proof={object:'transfer',id:`tr_FIXTURE${String(state.created).padStart(8,'0')}`,amount:Number(params.get('amount')),amount_reversed:0,created:Math.floor(Date.now()/1000),currency:params.get('currency'),destination:params.get('destination'),livemode:state.live,metadata:{affimaro_attempt:params.get('metadata[affimaro_attempt]'),affimaro_request:params.get('metadata[affimaro_request]'),affimaro_workspace:params.get('metadata[affimaro_workspace]')},transfer_group:params.get('transfer_group'),reversed:false,source_transaction:null};state.transfers.set(proof.id,proof);state.byKey.set(idem,proof);state.available-=proof.amount;}
      if(state.afterTransfer)await state.afterTransfer(proof);
      if(state.loseAfter){state.loseAfter=false;throw new Error('Fixture lost transfer response');}
      return Response.json(state.mutateResponse?state.mutateResponse(structuredClone(proof)):proof);
    }
    throw new Error('Unsupported fixture operation '+path);
  };
  const connectionApi=paymentConnections(db,identity('owner'),key,fetcher),stripeConnection=await connectionApi.connect({provider:'stripe',mode:testMode?'test':'live',secret:`rk_${testMode?'test':'live'}_FIXTUREKEYONLY123456789`});
  const merchantSetup=stripeConnect(db,identity('owner'),key,fetcher),partnerSetup=stripeConnect(db,identity('affiliate'),key,fetcher);await merchantSetup.configure({enabled:true,confirmed:true,connectionId:stripeConnection.id});await partnerSetup.start({applicationId:application.id,country:'US',consent:true});
  return {...f,state,fetcher,connectionApi,stripeConnection,partnerSetup,transfers:stripeTransfers(db,identity('owner'),key,fetcher)};
}
async function event(f,payload){const timestamp=String(Math.floor(Date.now()/1000)),id=crypto.randomUUID(),body=JSON.stringify(payload),signature=createHmac('sha256',f.signingKey).update(`${timestamp}.${id}.${body}`).digest('hex');return receiveStoreEvent(f.db,new Request('https://affimaro.example/api/woocommerce/event',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':f.connection.id,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Event':id,'X-Affimaro-Signature':signature},body}));}
async function sale(f,change={}){return event(f,{kind:'order',orderId:'123',revision:1,referralId:f.referral.referralId,createdAt:f.createdAt,currency:'USD',decimals:2,basis:12000,refundedBasis:0,status:'processing',refundUnallocated:false,...change});}
async function approve(f){const o=f.db.sqlite.prepare('SELECT * FROM orders WHERE external_id=?').get('123');return f.merchant.approveCommission({orderId:o.id,revision:o.revision});}
async function request(f,change={}){return f.partner.request({requestId:crypto.randomUUID(),applicationId:f.application.id,currency:'USD',decimals:2,method:'stripe',...change});}
async function ready(f){const r=await request(f);await f.merchant.review({requestId:r.id,status:'approved',reason:''});return r;}
async function review(f,r){return f.transfers.preview({requestId:r.id});}
async function send(f,r,preview){const p=preview||await review(f,r);return f.transfers.send({requestId:r.id,reviewToken:p.reviewToken,confirmed:true});}
const current=(f,r)=>f.db.sqlite.prepare('SELECT * FROM payout_requests WHERE id=?').get(r.id);
const attempt=(f,r)=>f.db.sqlite.prepare('SELECT * FROM stripe_transfer_attempts WHERE request_id=? ORDER BY rowid DESC LIMIT 1').get(r.id);
const posts=f=>f.state.calls.filter(c=>c.path==='/v1/transfers'&&c.method==='POST');

test('Stripe requests reserve the approved USD balance and snapshot an encrypted live destination without bank dependence',async t=>{
  const f=await fixture(t);f.db.sqlite.prepare('DELETE FROM bank_profiles').run();const r=await request(f);assert.equal(r.amount,1200);assert.equal(r.method,'stripe');assert.equal(r.status,'requested');const details=await f.partner.details({requestId:r.id});assert.equal(details.method,'stripe');assert.equal(details.destination.accountId,f.state.account.id);assert.ok(!current(f,r).encrypted_destination.includes(f.state.account.id));assert.equal((await f.partner.partnerDashboard()).wallets[0].reserved,1200);
  await assert.rejects(request(f),fails(409));await assert.rejects(f.partner.request({requestId:r.id,applicationId:f.application.id,currency:'USD',decimals:2,method:'bank'}),fails(409));
});
test('test-mode, unsupported currency/precision, stale receivers and inflated client amounts cannot reserve Stripe commission',async t=>{
  const test=await fixture(t,{testMode:true});await assert.rejects(request(test),fails(409));const f=await fixture(t);for(const change of [{currency:'EUR'},{decimals:3},{amount:99999}])await assert.rejects(request(f,change),fails(400));
  f.db.sqlite.prepare('UPDATE stripe_recipients SET last_checked_at=?').run(new Date(Date.now()-600000).toISOString());await assert.rejects(request(f),fails(409));assert.equal(posts(f).length,0);
});
test('the local Stripe size limit does not truncate a commission request and bank payments remain available',async t=>{
  const f=await fixture(t);await sale(f,{revision:2,basis:1000000000000});await approve(f);await assert.rejects(request(f),fails(409));const bankRequest=await request(f,{method:'bank'});assert.equal(bankRequest.amount,100000000000);
});
test('only the owning business can preview/send/check; confirmation and signed review are required',async t=>{
  const f=await fixture(t),r=await ready(f),affiliate=stripeTransfers(f.db,identity('affiliate'),key,f.fetcher);await assert.rejects(affiliate.preview({requestId:r.id}),fails(404));await assert.rejects(f.transfers.send({requestId:r.id,reviewToken:'x'.repeat(80),confirmed:false}),fails(400));await assert.rejects(f.transfers.send({requestId:r.id,reviewToken:'x'.repeat(80),confirmed:true}),fails(400));
  await assert.rejects(f.transfers.preview({requestId:r.id,amount:1}),fails(400));const p=await review(f,r),w=await f.owner.workspace(),decoded=await openPayment(p.reviewToken,key,`stripe-review/${w.id}/owner`),expired=await sealPayment({...decoded,at:new Date(Date.now()-600000).toISOString()},key,`stripe-review/${w.id}/owner`);await assert.rejects(f.transfers.send({requestId:r.id,reviewToken:expired,confirmed:true}),fails(409));assert.equal(posts(f).length,0);
});
test('a confirmed transfer uses the stored amount/destination, verifies Stripe evidence and is idempotent',async t=>{
  const f=await fixture(t),r=await ready(f),p=await review(f,r);assert.equal(p.amount,1200);assert.equal(p.destination,f.state.account.id);const result=await send(f,r,p);assert.equal(result.outcome,'transferred');assert.equal(current(f,r).status,'transferred');assert.equal(f.state.created,1);assert.equal(posts(f)[0].params.get('amount'),'1200');assert.equal(posts(f)[0].params.get('destination'),p.destination);assert.ok(!posts(f)[0].params.has('source_transaction'));
  await send(f,r,p);assert.equal(posts(f).length,1);const w=(await f.partner.partnerDashboard()).wallets[0];assert.equal(w.paid,1200);assert.equal(w.available,0);assert.equal(w.reserved,0);const detail=await f.partner.details({requestId:r.id});assert.equal(detail.receipt.method,'stripe');assert.equal(detail.receipt.reference,current(f,r).stripe_transfer_id);
});
test('insufficient balance or changed receiver readiness blocks preview before a financial attempt',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.available=100;await assert.rejects(review(f,r),fails(409));assert.equal(current(f,r).status,'approved');f.state.available=100000;f.state.account.payouts_enabled=false;await assert.rejects(review(f,r),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM stripe_transfer_attempts').get().n,0);
});
test('lost transfer responses remain reserved and reconciliation records the existing transfer exactly once',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.loseAfter=true;const result=await send(f,r);assert.equal(result.outcome,'review');assert.equal(current(f,r).status,'processing');assert.equal(f.state.created,1);let w=(await f.partner.partnerDashboard()).wallets[0];assert.equal(w.paid,0);assert.equal(w.reserved,1200);
  await assert.rejects(request(f),fails(409));await assert.rejects(f.partner.cancel({requestId:r.id}),fails(409));await assert.rejects(f.merchant.review({requestId:r.id,status:'rejected',reason:'Try bank instead'}),fails(409));await assert.rejects(f.merchant.recordPaid({requestId:r.id,receipt:{reference:'FAKE-BANK-REFERENCE',paidDate:new Date().toISOString().slice(0,10),receiptUrl:'',confirmed:true}}),fails(409));
  await f.transfers.reconcile({requestId:r.id});w=(await f.partner.partnerDashboard()).wallets[0];assert.equal(w.paid,1200);assert.equal(w.reserved,0);assert.equal(posts(f).length,1);await f.transfers.reconcile({requestId:r.id});assert.equal(w.paid,1200);
});
test('a request interrupted before Stripe executes retries the same frozen idempotency key and body',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.loseBefore=true;await send(f,r);assert.equal(f.state.created,0);const first=attempt(f,r);await send(f,r);assert.equal(f.state.created,1);assert.equal(attempt(f,r).id,first.id);assert.equal(posts(f)[0].headers['Idempotency-Key'],posts(f)[1].headers['Idempotency-Key']);assert.equal(posts(f)[0].params.toString(),posts(f)[1].params.toString());
});
test('unknown attempts beyond the safe retry window cannot create another transfer but can still be reconciled',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.loseBefore=true;await send(f,r);f.db.sqlite.prepare('UPDATE stripe_transfer_attempts SET first_submitted_at=?').run(new Date(Date.now()-24*3600000).toISOString());const count=posts(f).length;const result=await send(f,r);assert.equal(result.outcome,'review');assert.equal(posts(f).length,count);assert.equal(current(f,r).status,'processing');
});
test('a definite Stripe balance rejection preserves the request reservation and permits a fresh attempt',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.insufficient=true;const first=await send(f,r),a=attempt(f,r);assert.equal(first.outcome,'rejected');assert.equal(a.state,'failed');assert.equal(current(f,r).status,'approved');assert.equal((await f.partner.partnerDashboard()).wallets[0].reserved,1200);f.state.insufficient=false;await send(f,r);assert.equal(current(f,r).status,'transferred');assert.notEqual(attempt(f,r).id,a.id);assert.equal(f.state.created,1);
});
test('refunds arriving before the atomic transfer claim prevent sending and do not leave an attempt',async t=>{
  const f=await fixture(t),r=await ready(f),p=await review(f,r),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);let interleave=true;
  f.db.prepare=query=>{const statement=prepare(query),bind=statement.bind.bind(statement);statement.bind=(...args)=>Object.assign(bind(...args),{fixtureQuery:query});return statement;};
  f.db.batch=async statements=>{if(interleave&&statements.some(s=>s.fixtureQuery?.startsWith('INSERT INTO stripe_transfer_attempts'))){interleave=false;await sale(f,{revision:2,refundedBasis:6000});}return batch(statements);};
  await assert.rejects(send(f,r,p),fails(409));assert.equal(posts(f).length,0);assert.equal(current(f,r).status,'approved');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM stripe_transfer_attempts').get().n,0);
});
test('a refund after Stripe executes becomes carry-forward debt while the verified transfer is recorded',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.afterTransfer=async()=>{f.state.afterTransfer=null;await sale(f,{revision:2,status:'refunded',refundedBasis:12000});};await send(f,r);const w=(await f.partner.partnerDashboard()).wallets[0];assert.equal(w.paid,1200);assert.equal(w.approved,0);assert.equal(w.debt,1200);assert.equal(current(f,r).status,'transferred');
});
test('provider transfer reversals reduce net disbursement and old snapshots cannot undo a recorded reversal',async t=>{
  const f=await fixture(t),r=await ready(f);await send(f,r);const proof=f.state.transfers.get(current(f,r).stripe_transfer_id);proof.amount_reversed=400;await f.transfers.reconcile({requestId:r.id});let w=(await f.partner.partnerDashboard()).wallets[0];assert.equal(w.paid,800);assert.equal(w.available,400);proof.amount_reversed=0;await f.transfers.reconcile({requestId:r.id});assert.equal(current(f,r).reversed_amount,400);assert.equal((await f.partner.partnerDashboard()).wallets[0].available,400);
  proof.amount_reversed=1200;proof.reversed=true;await f.transfers.reconcile({requestId:r.id});w=(await f.partner.partnerDashboard()).wallets[0];assert.equal(w.paid,0);assert.equal(w.available,1200);const next=await request(f);assert.equal(next.amount,1200);
});
test('a provider response with wrong amount, destination, metadata or test mode cannot settle real commission',async t=>{
  for(const change of [{amount:1201},{destination:'acct_OTHERRECEIVER123'},{livemode:false},{metadata:{affimaro_attempt:'wrong'}}]){const f=await fixture(t),r=await ready(f);f.state.mutateResponse=value=>({...value,...change});const result=await send(f,r);assert.equal(result.outcome,'review');assert.equal(current(f,r).status,'processing');assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,0);assert.equal(f.state.created,1);}
});
test('a changed business account invalidates an earlier review and never reroutes an existing destination snapshot',async t=>{
  const f=await fixture(t),r=await ready(f),p=await review(f,r);f.state.platform='acct_DIFFERENTPLATFORM123';await f.connectionApi.connect({provider:'stripe',mode:'live',secret:'rk_live_REPLACEMENTFIXTURE123456'});await assert.rejects(send(f,r,p),fails(409));assert.equal(posts(f).length,0);assert.equal(current(f,r).status,'approved');
});
test('an audit failure after remote execution retains processing state and lookup recovers the same transfer',async t=>{
  const f=await fixture(t),r=await ready(f);f.db.sqlite.exec("CREATE TRIGGER fail_transfer_audit BEFORE INSERT ON audit_events WHEN NEW.action='stripe_transfer_verified' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");await assert.rejects(send(f,r));assert.equal(f.state.created,1);assert.equal(current(f,r).status,'processing');assert.equal(current(f,r).stripe_transfer_id,null);f.db.sqlite.exec('DROP TRIGGER fail_transfer_audit');await f.transfers.reconcile({requestId:r.id});assert.equal(current(f,r).status,'transferred');assert.equal(posts(f).length,1);
});
test('concurrent operations honor the saved attempt lease and do not create another provider transfer',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.loseBefore=true;await send(f,r);f.db.sqlite.prepare('UPDATE stripe_transfer_attempts SET lease_id=?,lease_until=?').run('another-operation',new Date(Date.now()+60000).toISOString());await assert.rejects(f.transfers.reconcile({requestId:r.id}),fails(409));await assert.rejects(send(f,r),fails(409));assert.equal(f.state.created,0);f.db.sqlite.prepare('UPDATE stripe_transfer_attempts SET lease_until=?').run(new Date(Date.now()-1000).toISOString());await send(f,r);assert.equal(f.state.created,1);
});
test('duplicate lookup evidence and provider HTTP failures remain held without exposing raw errors',async t=>{
  const f=await fixture(t),r=await ready(f);f.state.loseAfter=true;await send(f,r);const proof=[...f.state.transfers.values()][0];f.state.fault=call=>call.path==='/v1/transfers'&&call.method==='GET'?Response.json({object:'list',has_more:false,data:[proof,proof]}):null;assert.equal((await f.transfers.reconcile({requestId:r.id})).outcome,'review');assert.equal(current(f,r).status,'processing');
  f.state.fault=call=>call.path==='/v1/transfers'&&call.method==='GET'?new Response('PRIVATE PROVIDER ERROR',{status:500}):null;await f.transfers.reconcile({requestId:r.id});assert.ok(!current(f,r).reason.includes('PRIVATE PROVIDER ERROR'));assert.equal(posts(f).length,1);
});
test('the transfer lease remains held until an ambiguous result and its audit are committed',async t=>{
  const f=await fixture(t),r=await ready(f),p=await review(f,r),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);let release,entered;const blocked=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{entered=resolve});
  f.db.prepare=query=>{const statement=prepare(query),bind=statement.bind.bind(statement);statement.bind=(...args)=>Object.assign(bind(...args),{fixtureQuery:query});return statement;};
  f.db.batch=async statements=>{if(statements.some(s=>s.fixtureQuery?.startsWith('UPDATE stripe_transfer_attempts SET state=?'))){entered();await blocked;}return batch(statements);};
  f.state.loseBefore=true;const pending=send(f,r,p);await started;assert.ok(attempt(f,r).lease_id);await assert.rejects(f.transfers.reconcile({requestId:r.id}),fails(409));release();assert.equal((await pending).outcome,'review');assert.equal(attempt(f,r).lease_id,null);
});
test('Stripe sends require recent complete Shopify source data, including inside the atomic claim',async t=>{
  const f=await fixture(t),r=await ready(f),old=new Date(Date.now()-600000).toISOString();f.db.sqlite.prepare("UPDATE store_connections SET platform='shopify' WHERE id=?").run(f.connection.id);f.db.sqlite.prepare('INSERT INTO shopify_accounts (store_id,shop_domain,shop_id,client_id,encrypted_secret,encrypted_token,token_expires_at,scopes,synced_through) VALUES (?,?,?,?,?,?,?,?,?)').run(f.connection.id,'fixture.myshopify.com','gid://shopify/Shop/123','FIXTURECLIENTID123','fixture-unused-secret','fixture-unused-token',new Date(Date.now()+600000).toISOString(),'read_orders',old);
  await assert.rejects(review(f,r),fails(409));f.db.sqlite.prepare('UPDATE shopify_accounts SET synced_through=?,sync_until=?').run(new Date().toISOString(),new Date().toISOString());await assert.rejects(review(f,r),fails(409));f.db.sqlite.prepare('UPDATE shopify_accounts SET sync_until=NULL').run();const p=await review(f,r),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);let interleave=true;
  f.db.prepare=query=>{const statement=prepare(query),bind=statement.bind.bind(statement);statement.bind=(...args)=>Object.assign(bind(...args),{fixtureQuery:query});return statement;};f.db.batch=async statements=>{if(interleave&&statements.some(s=>s.fixtureQuery?.startsWith('INSERT INTO stripe_transfer_attempts'))){interleave=false;f.db.sqlite.prepare('UPDATE shopify_accounts SET synced_through=?').run(old);}return batch(statements);};
  await assert.rejects(send(f,r,p),fails(409));assert.equal(posts(f).length,0);assert.equal(current(f,r).status,'approved');
});
test('the payout migration preserves encrypted legacy bank records and foreign-key integrity',async t=>{
  const db=database(t,7),owner=service(db,identity('legacy-owner')),affiliate=service(db,identity('legacy-affiliate'));await owner.saveAccount({name:'Legacy Owner'});await owner.createBusiness({name:'Legacy Business',website:''});await affiliate.saveAccount({name:'Legacy Partner'});db.sqlite.prepare("INSERT INTO affiliate_profiles(user_id,display_name,channel,website,bio,created_at) VALUES ('legacy-affiliate','Legacy Partner','Blog',NULL,'',?)").run(new Date().toISOString());const program=(await owner.businessDashboard()).program,a={id:crypto.randomUUID()},w=await owner.workspace(),id=crypto.randomUUID(),time=new Date().toISOString(),cipher=await sealPayment(bank,key,'bank/legacy-affiliate'),receipt=await sealPayment({reference:'LEGACY-PAID-REF',paidDate:time.slice(0,10),receiptUrl:'',confirmed:true},key,`receipt/legacy-affiliate/${id}`);
  // Seed this historical schema directly; current application writes require the later account-closure guards.
  db.sqlite.prepare("INSERT INTO applications(id,program_id,affiliate_user_id,status,created_at,updated_at) VALUES (?,?,?,'pending',?,?)").run(a.id,program.id,'legacy-affiliate',time,time);
  db.sqlite.prepare('INSERT INTO payout_requests (id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,encrypted_destination,account_hint,encrypted_receipt,reference_hash,paid_date,paid_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,\'paid\',?,?,?,?,?,?,?,?)').run(id,w.id,a.id,'legacy-affiliate','USD',2,1200,cipher,'9012',receipt,'legacy-reference-hash',time.slice(0,10),'legacy-owner',time,time);
  db.sqlite.exec('BEGIN');db.sqlite.exec(readFileSync(new URL('../drizzle/0008_brown_shadow_king.sql',import.meta.url),'utf8'));db.sqlite.exec('COMMIT');const saved=db.sqlite.prepare('SELECT * FROM payout_requests WHERE id=?').get(id);assert.equal(saved.method,'bank');assert.equal(saved.status,'paid');assert.equal(saved.amount,1200);assert.equal(saved.encrypted_destination,cipher);assert.equal(saved.encrypted_receipt,receipt);assert.equal(saved.reversed_amount,0);assert.equal(saved.stripe_transfer_id,null);assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys,1);const details=await payments(db,identity('legacy-affiliate'),key).details({requestId:id});assert.deepEqual(details.destination,bank);assert.equal(details.receipt.reference,'LEGACY-PAID-REF');
});
