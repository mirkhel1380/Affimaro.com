import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce,receiveStoreEvent,signStoreRequest,commissionFor} from '../lib/woocommerce.ts';
const clock=new Date('2026-10-15T08:00:00.300Z');
const status=expected=>e=>e instanceof AppError&&e.status===expected;
const identity=id=>({userId:id,email:id+'@example.com'});
async function fixture(t,id='owner'){
  const db=database(t),owner=service(db,identity(id)),partner=service(db,identity('affiliate'));
  await owner.saveAccount({name:'Test Merchant'});await owner.createBusiness({name:'Test Store',website:'https://store.example'});
  await partner.saveAccount({name:'Test Partner'});await partner.saveAffiliate({name:'Test Partner',channel:'Blog',website:'',bio:''});
  const program=(await owner.businessDashboard()).program,application=await partner.apply({programId:program.id});
  await owner.review({applicationId:application.id,status:'approved'});
  const c=commerce(db,identity(id)),configured=await c.configure({action:'connect',storeUrl:'https://store.example'});
  return {db,owner,partner,program,application,c,connection:configured.connection,key:configured.key};
}
async function request(f,payload,{eventId=crypto.randomUUID(),timestamp=String(Math.floor(clock.getTime()/1000)),key=f.key,storeId=f.connection.id,raw=JSON.stringify(payload),headers={}}={}){
  // Independent reference implementation matches WordPress hash_hmac, not receiver code.
  const signature=createHmac('sha256',key).update(`${timestamp}.${eventId}.${raw}`).digest('hex');
  return new Request('https://affimaro.example/api/woocommerce/event',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':storeId,'X-Affimaro-Event':eventId,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Signature':signature,...headers},body:raw});
}
async function send(f,payload,options={},at=clock){return receiveStoreEvent(f.db,await request(f,payload,options),at);}
async function referral(f){return send(f,{kind:'referral',applicationId:f.application.id});}
function order(ref,overrides={}){return {kind:'order',orderId:'123',revision:1,referralId:ref.referralId,createdAt:'2026-10-15T08:00:01.000Z',currency:'USD',decimals:2,basis:12000,refundedBasis:0,status:'processing',refundUnallocated:false,...overrides};}
const orders=f=>f.db.sqlite.prepare('SELECT * FROM orders ORDER BY external_id').all();

test('store configuration is owner-scoped and exposes its key only on creation/rotation',async t=>{
  const f=await fixture(t),dashboard=await f.c.dashboard();
  assert.equal(f.key.length,64);assert.equal(dashboard.connection.id,f.connection.id);assert.ok(!JSON.stringify(dashboard).includes(f.key));assert.ok(!('signing_key' in dashboard.connection));
  const other=service(f.db,identity('other'));await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other Store',website:''});
  assert.equal((await commerce(f.db,identity('other')).dashboard()).connection,null);
  await assert.rejects(commerce(f.db,identity('other')).configure({action:'disconnect',storeId:f.connection.id}),status(400));
  await assert.rejects(f.c.configure({action:'connect',storeUrl:'https://other.example'}),status(409));
  await assert.rejects(f.c.configure({action:'connect',storeUrl:'javascript:alert(1)'}),status(400));
});
test('HMAC uses the raw body and rejects tampering, old timestamps, missing headers and unknown stores',async t=>{
  const f=await fixture(t),payload={kind:'ping',storeUrl:'https://store.example'},id=crypto.randomUUID(),stamp=String(Math.floor(clock.getTime()/1000)),raw=JSON.stringify(payload);
  assert.equal(await signStoreRequest(f.key,stamp,id,raw),createHmac('sha256',f.key).update(`${stamp}.${id}.${raw}`).digest('hex'));
  assert.deepEqual(await send(f,payload),{connected:true});
  await assert.rejects(send(f,payload,{key:'a'.repeat(64)}),status(401));
  await assert.rejects(send(f,payload,{headers:{'X-Affimaro-Signature':'0'.repeat(64)}}),status(401));
  await assert.rejects(send(f,payload,{timestamp:String(Number(stamp)-301)}),status(401));
  await assert.rejects(send(f,payload,{headers:{'X-Affimaro-Event':''}}),status(401));
  await assert.rejects(send(f,payload,{storeId:crypto.randomUUID()}),status(401));
  await assert.rejects(send(f,{kind:'ping',storeUrl:'https://other.example'}),status(409));
});
test('duplicate events replay the same referral result and cannot be repurposed',async t=>{
  const f=await fixture(t),eventId=crypto.randomUUID(),payload={kind:'referral',applicationId:f.application.id};
  const a=await send(f,payload,{eventId}),b=await send(f,payload,{eventId});
  assert.deepEqual(a,b);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM referrals').get().n,1);
  await assert.rejects(send(f,{kind:'ping',storeUrl:'https://store.example'},{eventId}),status(409));
});
test('pending, suspended, cross-program and paused-program referrals are rejected',async t=>{
  const f=await fixture(t);
  await f.owner.review({applicationId:f.application.id,status:'suspended'});await assert.rejects(referral(f),status(403));
  await f.owner.review({applicationId:f.application.id,status:'approved'});
  await f.owner.saveProgram({name:'Paused program',rate:10,windowDays:30,active:false});await assert.rejects(referral(f),status(403));
  await f.owner.saveProgram({name:'Active program',rate:10,windowDays:30,active:true});
  const other=service(f.db,identity('other'));await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other Store',website:''});
  const app=await f.partner.apply({programId:(await other.businessDashboard()).program.id});await other.review({applicationId:app.id,status:'approved'});
  await assert.rejects(send(f,{kind:'referral',applicationId:app.id}),status(403));
});
test('order flow locks the referral rate and handles paid, partial refund, full refund and cancellation',async t=>{
  const f=await fixture(t),r=await referral(f);
  await f.owner.saveProgram({name:'New rate',rate:20,windowDays:10,active:true});
  await send(f,order(r,{status:'pending'}));assert.equal(orders(f)[0].commission,0);assert.equal(orders(f)[0].commission_state,'pending');
  await send(f,order(r,{revision:2}));assert.equal(orders(f)[0].commission,1200);assert.equal(orders(f)[0].rate_bps,1000);
  await send(f,order(r,{revision:3,refundedBasis:2500}));assert.equal(orders(f)[0].commission,950);
  await send(f,order(r,{revision:4,refundedBasis:12000,status:'refunded'}));assert.equal(orders(f)[0].commission,0);assert.equal(orders(f)[0].commission_state,'reversed');
  await send(f,order(r,{revision:5,status:'completed'}));assert.equal(orders(f)[0].commission,1200);
  await send(f,order(r,{revision:6,status:'cancelled'}));assert.equal(orders(f)[0].commission,0);assert.equal(orders(f).length,1);
});
test('unallocated refunds require review; corrected refunds can accrue again',async t=>{
  const f=await fixture(t),r=await referral(f);await send(f,order(r));
  await send(f,order(r,{revision:2,refundUnallocated:true}));assert.equal(orders(f)[0].commission_state,'review');assert.equal(orders(f)[0].commission,0);
  await send(f,order(r,{revision:3,refundedBasis:2000}));assert.equal(orders(f)[0].commission,1000);
  await assert.rejects(send(f,order(r,{revision:4,refundedBasis:12001})),status(400));assert.equal(orders(f)[0].revision,3);
});
test('delayed revisions cannot restore a refunded order; immutable attribution/currency is enforced',async t=>{
  const f=await fixture(t),r=await referral(f);await send(f,order(r,{revision:3,status:'refunded',refundedBasis:12000}));
  assert.equal((await send(f,order(r,{revision:2}))).stale,true);assert.equal(orders(f)[0].commission,0);
  await assert.rejects(send(f,order(r,{revision:3})),status(409));
  await assert.rejects(send(f,order(r,{revision:4,currency:'AFN'})),status(409));
  const other=await referral(f);await assert.rejects(send(f,order(other,{revision:4})),status(409));
});
test('expired or inactive first-order attribution stays ineligible, existing refunds still work later',async t=>{
  const f=await fixture(t),r=await referral(f);await send(f,order(r));
  await f.owner.review({applicationId:f.application.id,status:'suspended'});
  await send(f,order(r,{orderId:'124'}));assert.equal(orders(f).find(o=>o.external_id==='124').commission_state,'ineligible');
  await f.owner.review({applicationId:f.application.id,status:'approved'});
  await send(f,order(r,{orderId:'124',revision:2}));assert.equal(orders(f).find(o=>o.external_id==='124').commission,0);
  const future=new Date('2026-12-01T08:00:00.000Z'),timestamp=String(Math.floor(future.getTime()/1000));
  await send(f,order(r,{orderId:'125',createdAt:future.toISOString()}),{timestamp},future);assert.equal(orders(f).find(o=>o.external_id==='125').commission,0);
  await send(f,order(r,{revision:2,refundedBasis:5000}),{timestamp},future);assert.equal(orders(f).find(o=>o.external_id==='123').commission,700);
});
test('key rotation rejects old signatures but preserves referrals; pause/resume rejects deliveries',async t=>{
  const f=await fixture(t),r=await referral(f);await send(f,order(r));
  const rotated=await f.c.configure({action:'rotate'});await assert.rejects(send(f,order(r,{revision:2})),status(401));
  f.key=rotated.key;await send(f,order(r,{revision:2,refundedBasis:1000}));assert.equal(orders(f)[0].commission,1100);
  await f.c.configure({action:'disconnect'});await assert.rejects(send(f,{kind:'ping',storeUrl:'https://store.example'}),status(401));
  await f.c.configure({action:'resume'});await send(f,{kind:'ping',storeUrl:'https://store.example'});
});
test('merchant and partner reports isolate users and keep currency totals separate',async t=>{
  const f=await fixture(t),r=await referral(f);await send(f,order(r));await send(f,order(r,{orderId:'124',currency:'AFN',decimals:0,basis:500,refundedBasis:0}));
  const merchant=await f.c.dashboard();assert.equal(merchant.totals.length,2);assert.equal(merchant.visits,1);
  const partner=await commerce(f.db,identity('affiliate')).partnerTracking();assert.equal(partner.orders.length,2);assert.equal(partner.links.length,1);assert.ok(partner.links[0].url.includes(f.application.id));
  const stranger=await commerce(f.db,identity('stranger')).partnerTracking();assert.equal(stranger.orders.length,0);assert.equal(stranger.links.length,0);assert.equal(stranger.totals.length,0);
  const other=service(f.db,identity('other'));await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other Store',website:''});
  assert.equal((await commerce(f.db,identity('other')).dashboard()).orders.length,0);
  const c=await commerce(f.db,identity('other')).configure({action:'connect',storeUrl:'https://other.example'});
  await assert.rejects(send({...f,connection:c.connection,key:c.key},order(r)),status(403));
});
test('failed accounting writes roll back both the event receipt and connection status',async t=>{
  const f=await fixture(t),r=await referral(f),before=(await f.c.dashboard()).connection.last_seen,eventId=crypto.randomUUID();
  f.db.sqlite.exec("CREATE TRIGGER reject_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
  await assert.rejects(send(f,order(r),{eventId}));assert.equal(orders(f).length,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_events WHERE event_id=?').get(eventId).n,0);assert.equal((await f.c.dashboard()).connection.last_seen,before);
  f.db.sqlite.exec('DROP TRIGGER reject_order');await send(f,order(r),{eventId});assert.equal(orders(f).length,1);
});
test('invalid schema, decimal precision, unsafe integers and oversized/invalid bodies never write receipts',async t=>{
  const f=await fixture(t),r=await referral(f);
  for(const overrides of [{basis:1.1},{basis:1e13},{decimals:7},{currency:'USDT'},{ownerId:'other'},{revision:Number.MAX_SAFE_INTEGER+1}])await assert.rejects(send(f,order(r,overrides)),status(400));
  await assert.rejects(send(f,{}, {raw:'x'.repeat(16385)}),status(413));
  await assert.rejects(send(f,{}, {raw:'{broken'}),status(400));
  await assert.rejects(send(f,{}, {headers:{'Content-Type':'text/plain'}}),status(415));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_events').get().n,1);
});
test('integer commission rounding is stable across currency precisions and large supported bases',()=>{
  assert.equal(commissionFor(5,0,1000),1);assert.equal(commissionFor(4,0,1000),0);assert.equal(commissionFor(10001,0,1250),1250);assert.equal(commissionFor(999999999999,1,5000),499999999999);assert.equal(commissionFor(1500,1500,3333),0);
});
