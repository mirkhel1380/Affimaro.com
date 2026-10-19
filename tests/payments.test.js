import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce,receiveStoreEvent} from '../lib/woocommerce.ts';
import {payments,payoutCsv} from '../lib/payments.ts';
import {sealPayment,openPayment} from '../lib/payment-crypto.ts';
const dataKey='ab'.repeat(32),identity=id=>({userId:id,email:id+'@example.com'});
const bank={beneficiary:'Example Partner',bank:'Example Bank',country:'US',currency:'USD',account:'123456789012',swift:'EXAMUS33',routing:'012345678',address:'Test address, Example City'};
const fails=n=>e=>e instanceof AppError&&e.status===n;
const today=()=>new Date().toISOString().slice(0,10);
async function fixture(t){
  const db=database(t),owner=service(db,identity('owner')),affiliate=service(db,identity('affiliate'));
  await owner.saveAccount({name:'Test Owner'});await owner.createBusiness({name:'Test Business',website:'https://store.example'});
  await affiliate.saveAccount({name:'Example Partner'});await affiliate.saveAffiliate({name:'Example Partner',channel:'Blog',website:'',bio:''});
  const program=(await owner.businessDashboard()).program,application=await affiliate.apply({programId:program.id});await owner.review({applicationId:application.id,status:'approved'});
  const configured=await commerce(db,identity('owner')).configure({action:'connect',storeUrl:'https://store.example'});
  const f={db,owner,affiliate,application,connection:configured.connection,signingKey:configured.key,merchant:payments(db,identity('owner'),dataKey),partner:payments(db,identity('affiliate'),dataKey)};
  f.referral=await send(f,{kind:'referral',applicationId:application.id});await f.partner.saveBank(bank);await sale(f);return f;
}
async function send(f,payload){
  const now=new Date(),raw=JSON.stringify(payload),timestamp=String(Math.floor(now.getTime()/1000)),event=crypto.randomUUID(),signature=createHmac('sha256',f.signingKey).update(`${timestamp}.${event}.${raw}`).digest('hex');
  return receiveStoreEvent(f.db,new Request('https://affimaro.example/api/woocommerce/event',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':f.connection.id,'X-Affimaro-Event':event,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Signature':signature},body:raw}),now);
}
async function sale(f,override={}){
  const prior=f.db.sqlite.prepare('SELECT created_at FROM orders WHERE external_id=?').get(override.orderId||'123');
  await send(f,{kind:'order',orderId:'123',revision:1,referralId:f.referral.referralId,createdAt:prior?.created_at||new Date().toISOString(),currency:'USD',decimals:2,basis:12000,refundedBasis:0,status:'processing',refundUnallocated:false,...override});
  return f.db.sqlite.prepare('SELECT * FROM orders WHERE external_id=?').get(override.orderId||'123');
}
async function approve(f,order){order=order||f.db.sqlite.prepare('SELECT * FROM orders LIMIT 1').get();return f.merchant.approveCommission({orderId:order.id,revision:order.revision});}
function request(f,override={}){return {requestId:crypto.randomUUID(),applicationId:f.application.id,currency:'USD',decimals:2,...override};}
const receipt=(reference='TEST-BANK-REFERENCE-1')=>({reference,paidDate:today(),receiptUrl:'https://bank.example/receipt',confirmed:true});
async function pay(f,req,reference){await f.merchant.review({requestId:req.id,status:'approved',reason:''});return f.merchant.recordPaid({requestId:req.id,receipt:receipt(reference)});}

test('bank and receipt encryption is randomized, authenticated and bound to its owner/context',async()=>{
  const a=await sealPayment(bank,dataKey,'bank/affiliate'),b=await sealPayment(bank,dataKey,'bank/affiliate');assert.notEqual(a,b);assert.ok(!a.includes(bank.account));assert.deepEqual(await openPayment(a,dataKey,'bank/affiliate'),bank);
  await assert.rejects(openPayment(a,dataKey,'bank/other'),fails(503));await assert.rejects(openPayment(a,'cd'.repeat(32),'bank/affiliate'),fails(503));await assert.rejects(openPayment(a.slice(0,-2)+'00',dataKey,'bank/affiliate'),fails(503));await assert.rejects(sealPayment(bank,undefined,'bank/affiliate'),fails(503));
});
test('bank details are masked in dashboards and reject identity injection and invalid account formats',async t=>{
  const f=await fixture(t),dashboard=await f.partner.partnerDashboard();assert.equal(dashboard.bank.account_hint,'9012');assert.ok(!JSON.stringify(dashboard).includes(bank.account));assert.deepEqual(await f.partner.bankDetails(),bank);
  assert.ok(!f.db.sqlite.prepare('SELECT encrypted_details FROM bank_profiles').get().encrypted_details.includes(bank.account));
  for(const change of [{userId:'owner'},{account:'<script>'},{swift:'bad'},{country:'XX'},{currency:'USDT'}])await assert.rejects(f.partner.saveBank({...bank,...change}),fails(400));
  await assert.rejects(payments(f.db,identity('owner'),dataKey).bankDetails(),fails(404));
});
test('only the merchant can approve a current accrued commission; an approval cannot be inflated by clients',async t=>{
  const f=await fixture(t),o=f.db.sqlite.prepare('SELECT * FROM orders').get();
  await assert.rejects(f.partner.approveCommission({orderId:o.id,revision:1}),fails(404));await assert.rejects(f.merchant.approveCommission({orderId:o.id,revision:1,amount:50000}),fails(400));
  await assert.rejects(f.merchant.approveCommission({orderId:o.id,revision:999}),fails(409));await approve(f);await approve(f);assert.equal((await f.partner.partnerDashboard()).wallets[0].approved,1200);
  await sale(f,{revision:2,status:'pending'});await assert.rejects(f.merchant.approveCommission({orderId:o.id,revision:2}),fails(409));assert.equal((await f.partner.partnerDashboard()).wallets[0].approved,0);
});
test('request → approval → recorded bank payment preserves destination and reveals receipt only to the two parties',async t=>{
  const f=await fixture(t);await approve(f);const req=await f.partner.request(request(f));assert.equal(req.amount,1200);assert.equal(req.status,'requested');
  await f.partner.saveBank({...bank,account:'999999999999'});const details=await f.merchant.details({requestId:req.id});assert.equal(details.destination.account,bank.account);assert.equal(details.receipt,null);
  await pay(f,req);const updated=await f.partner.partnerDashboard();assert.equal(updated.wallets[0].paid,1200);assert.equal(updated.wallets[0].available,0);assert.equal(updated.requests[0].status,'paid');
  const paid=await f.partner.details({requestId:req.id});assert.equal(paid.receipt.reference,'TEST-BANK-REFERENCE-1');assert.equal(paid.destination.account,bank.account);
  await assert.rejects(payments(f.db,identity('stranger'),dataKey).details({requestId:req.id}),fails(404));assert.ok(!JSON.stringify(updated).includes(bank.account));assert.ok(!JSON.stringify(updated).includes(paid.receipt.reference));
});
test('payout requests reserve available money once, remain idempotent and reject client-selected amounts',async t=>{
  const f=await fixture(t);await assert.rejects(f.partner.request(request(f)),fails(409));await approve(f);
  const body=request(f),a=await f.partner.request(body),b=await f.partner.request(body);assert.equal(a.id,b.id);assert.equal((await f.partner.partnerDashboard()).wallets[0].reserved,1200);
  await assert.rejects(f.partner.request(request(f)),fails(409));await assert.rejects(f.partner.request({...body,currency:'AFN'}),fails(409));await assert.rejects(f.partner.request({...request(f),amount:999999}),fails(400));
  await assert.rejects(payments(f.db,identity('stranger'),dataKey).request(body),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,1);
});
test('completed Wise transfers can be manually recorded without treating a Stripe transfer as bank settlement',async t=>{
  const f=await fixture(t);await approve(f);const req=await f.partner.request(request(f));await f.merchant.review({requestId:req.id,status:'approved',reason:''});
  await assert.rejects(f.merchant.recordPaid({requestId:req.id,receipt:{...receipt(),method:'stripe'}}),fails(400));
  await f.merchant.recordPaid({requestId:req.id,receipt:{...receipt('WISE-EXAMPLE-TRANSFER-1'),method:'wise'}});
  const details=await f.partner.details({requestId:req.id});assert.equal(details.receipt.method,'wise');assert.equal(details.destination.account,bank.account);assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,1200);
  const stored=f.db.sqlite.prepare('SELECT encrypted_receipt FROM payout_requests').get();assert.ok(!stored.encrypted_receipt.includes('WISE-EXAMPLE-TRANSFER-1'));
});
test('cancel and decline release reservations; paid records cannot be cancelled or declined',async t=>{
  const f=await fixture(t);await approve(f);let req=await f.partner.request(request(f));await f.partner.cancel({requestId:req.id});assert.equal((await f.partner.partnerDashboard()).wallets[0].available,1200);
  req=await f.partner.request(request(f));await assert.rejects(f.merchant.review({requestId:req.id,status:'rejected',reason:''}),fails(400));await f.merchant.review({requestId:req.id,status:'rejected',reason:'Please correct the bank details.'});assert.equal((await f.partner.partnerDashboard()).wallets[0].available,1200);
  req=await f.partner.request(request(f));await pay(f,req);await assert.rejects(f.partner.cancel({requestId:req.id}),fails(409));await assert.rejects(f.merchant.review({requestId:req.id,status:'rejected',reason:'A different outcome'}),fails(409));assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,1200);
});
test('refunds reduce a pending request’s coverage and block both approval and recording payment',async t=>{
  const f=await fixture(t);await approve(f);const req=await f.partner.request(request(f));await sale(f,{revision:2,refundedBasis:2000});
  await assert.rejects(f.merchant.review({requestId:req.id,status:'approved',reason:''}),fails(409));assert.equal((await f.merchant.merchantDashboard()).requests[0].covered,0);
  await f.merchant.review({requestId:req.id,status:'rejected',reason:'Refund changed the payable amount.'});const corrected=await f.partner.request(request(f));assert.equal(corrected.amount,1000);
  await f.merchant.review({requestId:corrected.id,status:'approved',reason:''});await sale(f,{revision:3,refundedBasis:3000});await assert.rejects(f.merchant.recordPaid({requestId:corrected.id,receipt:receipt()}),fails(409));
});
test('a refund after payment carries debt into future commission instead of paying the same money again',async t=>{
  const f=await fixture(t);await approve(f);await pay(f,await f.partner.request(request(f)));await sale(f,{revision:2,status:'refunded',refundedBasis:12000});
  let wallet=(await f.partner.partnerDashboard()).wallets[0];assert.equal(wallet.debt,1200);assert.equal(wallet.available,0);
  const second=await sale(f,{orderId:'124',basis:20000});await approve(f,second);wallet=(await f.partner.partnerDashboard()).wallets[0];assert.equal(wallet.debt,0);assert.equal(wallet.available,800);
  const next=await f.partner.request(request(f));assert.equal(next.amount,800);await pay(f,next,'TEST-BANK-REFERENCE-2');assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,2000);
});
test('recording a payment requires an approved request, actual-transfer confirmation, date and unique bank reference',async t=>{
  const f=await fixture(t);await approve(f);const req=await f.partner.request(request(f));await assert.rejects(f.merchant.recordPaid({requestId:req.id,receipt:receipt()}),fails(409));
  await f.merchant.review({requestId:req.id,status:'approved',reason:''});
  for(const r of [{...receipt(),confirmed:false},{...receipt(),paidDate:'2026-02-30'},{...receipt(),receiptUrl:'javascript:alert(1)'},{...receipt(),paidDate:'2099-01-01'}])await assert.rejects(f.merchant.recordPaid({requestId:req.id,receipt:r}),fails(400));
  await f.merchant.recordPaid({requestId:req.id,receipt:receipt()});await f.merchant.recordPaid({requestId:req.id,receipt:receipt()});assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,1200);
  const nextOrder=await sale(f,{orderId:'124'});await approve(f,nextOrder);const next=await f.partner.request(request(f));await f.merchant.review({requestId:next.id,status:'approved',reason:''});await assert.rejects(f.merchant.recordPaid({requestId:next.id,receipt:receipt(' test-bank-reference-1 ')}),fails(409));assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,1200);
});
test('different merchants and affiliates cannot read, approve, cancel or pay each other’s requests',async t=>{
  const f=await fixture(t);await approve(f);const req=await f.partner.request(request(f));const other=service(f.db,identity('other'));await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other Business',website:''});
  const stranger=payments(f.db,identity('other'),dataKey);assert.equal((await stranger.merchantDashboard()).requests.length,0);assert.equal((await stranger.partnerDashboard()).requests.length,0);
  await assert.rejects(stranger.review({requestId:req.id,status:'approved',reason:''}),fails(404));await assert.rejects(stranger.recordPaid({requestId:req.id,receipt:receipt()}),fails(404));await assert.rejects(stranger.cancel({requestId:req.id}),fails(404));await assert.rejects(stranger.details({requestId:req.id}),fails(404));
});
test('payment writes roll back when their audit write fails and request retries remain possible',async t=>{
  const f=await fixture(t);await approve(f);const body=request(f);f.db.sqlite.exec("CREATE TRIGGER reject_payout_audit BEFORE INSERT ON audit_events WHEN NEW.action='payout_requested' BEGIN SELECT RAISE(ABORT,'test failure'); END");
  await assert.rejects(f.partner.request(body));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);assert.equal((await f.partner.partnerDashboard()).wallets[0].available,1200);
  f.db.sqlite.exec('DROP TRIGGER reject_payout_audit');assert.equal((await f.partner.request(body)).amount,1200);
});
test('bank currency, commission precision and suspended membership cannot be bypassed by the request body',async t=>{
  const f=await fixture(t);await approve(f);await f.partner.saveBank({...bank,currency:'EUR'});await assert.rejects(f.partner.request(request(f)),fails(409));await f.partner.saveBank(bank);
  await assert.rejects(f.partner.request(request(f,{decimals:3})),fails(409));await f.owner.review({applicationId:f.application.id,status:'suspended'});await assert.rejects(f.partner.request(request(f)),fails(409));
});
test('export includes only masked metadata and neutralizes spreadsheet formulas',async t=>{
  const f=await fixture(t);await approve(f);await f.partner.request(request(f));const rows=(await f.partner.partnerDashboard()).requests;rows[0].business_name='=HYPERLINK("https://evil.example")';rows[0].reason='  @SUM(1,2)';
  const csv=payoutCsv(rows);assert.ok(csv.includes('12.00'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes("'  @SUM"));assert.ok(!csv.includes(bank.account));assert.ok(!csv.includes('encrypted_destination'));
});
test('a competing request inserted before the batch cannot reserve the same balance twice',async t=>{
  const f=await fixture(t);await approve(f);const first=request(f),second=request(f),batch=f.db.batch.bind(f.db);let interleave=true;
  f.db.batch=async statements=>{if(interleave){interleave=false;await f.partner.request(second);}return batch(statements);};
  await assert.rejects(f.partner.request(first),fails(409));const dashboard=await f.partner.partnerDashboard();assert.equal(dashboard.requests.length,1);assert.equal(dashboard.requests[0].id,second.requestId);assert.equal(dashboard.wallets[0].reserved,1200);
});
test('a refund arriving immediately before payment commit is checked inside the update',async t=>{
  const f=await fixture(t);await approve(f);const req=await f.partner.request(request(f));await f.merchant.review({requestId:req.id,status:'approved',reason:''});
  const batch=f.db.batch.bind(f.db);let interleave=true;f.db.batch=async statements=>{if(interleave){interleave=false;await sale(f,{revision:2,refundedBasis:5000});}return batch(statements);};
  await assert.rejects(f.merchant.recordPaid({requestId:req.id,receipt:receipt()}),fails(409));assert.equal((await f.partner.partnerDashboard()).wallets[0].paid,0);
});
test('request coverage is calculated per partner, never across other partners’ reservations',async t=>{
  const f=await fixture(t);await approve(f);await f.partner.request(request(f));
  const second=service(f.db,identity('second'));await second.saveAccount({name:'Second Partner'});await second.saveAffiliate({name:'Second Partner',channel:'Blog',website:'',bio:''});const program=(await f.owner.businessDashboard()).program,application=await second.apply({programId:program.id});await f.owner.review({applicationId:application.id,status:'approved'});
  const f2={...f,application,partner:payments(f.db,identity('second'),dataKey),referral:await send(f,{kind:'referral',applicationId:application.id})};await f2.partner.saveBank(bank);const o=await sale(f2,{orderId:'124',basis:100000});await approve(f,o);await f2.partner.request(request(f2));
  const dashboard=await f.merchant.merchantDashboard();assert.equal(dashboard.requests.length,2);assert.ok(dashboard.requests.every(r=>r.covered===1));
});

test('account closure blocks estimated commission, open requests and refund debt',async t=>{
 const {accountClosureStatus,closeAccount}=await import('../lib/account-closure.ts'),f=await fixture(t);
 for(const userId of ['owner','affiliate'])assert.ok((await accountClosureStatus(f.db,userId)).blockers.some(b=>b.code==='balance'));
 const order=f.db.sqlite.prepare('SELECT * FROM orders').get();await f.merchant.approveCommission({orderId:order.id,revision:order.revision});const p=await f.partner.request({requestId:crypto.randomUUID(),applicationId:f.application.id,currency:'USD',decimals:2});assert.ok((await accountClosureStatus(f.db,'affiliate')).blockers.some(b=>b.code==='payout'));
 await f.merchant.review({requestId:p.id,status:'approved',reason:''});await f.merchant.recordPaid({requestId:p.id,receipt:{method:'bank',reference:'CLOSURE-FIXTURE-BANK-REFERENCE',paidDate:today(),receiptUrl:'',confirmed:true}});assert.equal((await accountClosureStatus(f.db,'affiliate')).eligible,true);
 await sale(f,{revision:2,refundedBasis:6000});assert.ok((await accountClosureStatus(f.db,'affiliate')).blockers.some(b=>b.code==='balance'));await assert.rejects(closeAccount(f.db,identity('affiliate'),''),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM account_closures').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT status FROM payout_requests WHERE id=?').get(p.id).status,'paid');
});
