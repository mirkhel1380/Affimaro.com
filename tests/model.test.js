import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, validState, commission, summary, createOrder, approveOrder, refundOrder, recordPayout, updateProgram, addAffiliate, setAffiliateStatus} from '../public/demo/model.js';

test('sample data balances, and each affiliate sees only their own totals',()=>{
  const s=initialState();
  assert.ok(validState(s));
  assert.equal(summary(s).revenue,250900);
  assert.equal(summary(s).approved,10590);
  assert.equal(summary(s,'sofia').revenue,85000);
  assert.equal(summary(s,'sofia').paid,2400);
  assert.equal(summary(s,'alex').paid,3200);
  assert.equal(summary(s,'missing').sales,0);
});
test('sale at 10 percent yields $10; a duplicate never changes data',()=>{
  const s=initialState();
  const input={id:'NEW-100',affiliateId:'sofia',amountCents:10000,referralAgeDays:1};
  assert.equal(commission(createOrder(s,input)),1000);
  const before=JSON.stringify(s);
  assert.throws(()=>createOrder(s,{...input,id:'new-100'}),/duplicate/);
  assert.equal(JSON.stringify(s),before);
});
test('program rates apply to new orders without rewriting existing commissions',()=>{
  const s=initialState();
  const old=commission(s.orders[0]);
  updateProgram(s,{name:'Updated program',rate:12.5,cookieDays:45,active:true});
  assert.equal(commission(s.orders[0]),old);
  assert.equal(commission(createOrder(s,{id:'NEW-101',affiliateId:'maya',amountCents:10000,referralAgeDays:40})),1250);
  assert.throws(()=>createOrder(s,{id:'NEW-102',affiliateId:'maya',amountCents:10000,referralAgeDays:46}),/outside/);
});
test('partial and full refunds recalculate commissions; paid orders remain protected',()=>{
  const s=initialState();
  const o=createOrder(s,{id:'NEW-103',affiliateId:'sofia',amountCents:10000,referralAgeDays:0});
  refundOrder(s,o.id,2500);
  assert.equal(commission(o),750);
  refundOrder(s,o.id,7500);
  assert.equal(commission(o),0);
  assert.equal(o.status,'cancelled');
  assert.throws(()=>refundOrder(s,'ORD-1041',1),/unpaid/);
  assert.throws(()=>refundOrder(s,'ORD-1043',18001),/remaining/);
});
test('a payment records only the selected affiliate’s approved commissions once',()=>{
  const s=initialState();
  const due=summary(s,'sofia').approved;
  const maya=summary(s,'maya').approved;
  const payment=recordPayout(s,'sofia','Bank transfer','TEST-01');
  assert.equal(payment.amountCents,due);
  assert.equal(summary(s,'sofia').approved,0);
  assert.equal(summary(s,'sofia').pending,2100);
  assert.equal(summary(s,'maya').approved,maya);
  assert.throws(()=>recordPayout(s,'sofia','Bank transfer','TEST-02'),/no approved/);
  assert.ok(validState(s));
});
test('pending or suspended affiliates and inactive programs cannot create sales',()=>{
  const s=initialState();
  const a=addAffiliate(s,{name:'Sample Partner',email:'partner@example.com',channel:'Blog'});
  const input={id:'NEW-104',affiliateId:a.id,amountCents:10000,referralAgeDays:0};
  assert.throws(()=>createOrder(s,input),/approved affiliate/);
  setAffiliateStatus(s,a.id,'approved');
  createOrder(s,input);
  approveOrder(s,input.id);
  assert.equal(s.orders.at(-1).status,'approved');
  setAffiliateStatus(s,a.id,'suspended');
  assert.throws(()=>createOrder(s,{...input,id:'NEW-105'}),/approved affiliate/);
  updateProgram(s,{...s.program,active:false});
  assert.throws(()=>createOrder(s,{...input,id:'NEW-106',affiliateId:'sofia'}),/Activate/);
});
