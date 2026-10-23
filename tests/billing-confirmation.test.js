import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmSavedPayment,confirmationDelays} from '../lib/billing-confirmation.ts';
function options(){return {updates:[],waits:[],stop:false,update(value){this.updates.push(value)},async wait(milliseconds){this.waits.push(milliseconds)},cancelled(){return this.stop}};}
const bind=o=>({update:o.update.bind(o),wait:o.wait.bind(o),cancelled:o.cancelled.bind(o)}),result=status=>({status,mode:status==='test_complete'?'test':'live'});
test('confirmation waits for verified access, keeps checks sequential and retries temporary network failures',async()=>{
 const o=options();let calls=0,inFlight=0;const state=await confirmSavedPayment(async()=>{assert.equal(inFlight++,0);try{calls++;if(calls===1)throw Error('Temporary connection error');return result(calls===3?'active':'processing');}finally{inFlight--}},bind(o));assert.equal(state.status,'active');assert.equal(calls,3);assert.deepEqual(o.waits,confirmationDelays.slice(1,3));assert.deepEqual(o.updates.map(s=>s.status),['processing','active']);
});
test('slow processing stops after the bounded checks and never reports an unverified payment as active',async()=>{
 const o=options();let calls=0;const state=await confirmSavedPayment(async()=>{calls++;return result('processing')},bind(o));assert.equal(calls,confirmationDelays.length);assert.equal(state.status,'processing');assert.ok(o.updates.every(s=>s.status!=='active'));assert.deepEqual(o.waits,confirmationDelays.slice(1));
});
test('open, expired, attention and test-complete payments stop polling immediately',async()=>{
 for(const status of ['open','expired','attention','test_complete']){const o=options();let calls=0;assert.equal((await confirmSavedPayment(async()=>{calls++;return result(status)},bind(o))).status,status);assert.equal(calls,1);assert.equal(o.waits.length,0);}
});
test('leaving the page cancels subsequent checks and suppresses a late result',async()=>{
 const o=options();let calls=0;const state=await confirmSavedPayment(async()=>{calls++;o.stop=true;return result('active')},bind(o));assert.equal(state,null);assert.equal(calls,1);assert.equal(o.updates.length,0);
 const waiting=options();waiting.wait=async()=>{waiting.stop=true};let checks=0;assert.equal(await confirmSavedPayment(async()=>{checks++;return result('processing')},bind(waiting)),null);assert.equal(checks,1);
});
test('repeated network failures terminate with a recoverable error rather than a success result',async()=>{const o=options();let calls=0;await assert.rejects(confirmSavedPayment(async()=>{calls++;throw Error('Connection unavailable')},bind(o)),/Connection unavailable/);assert.equal(calls,confirmationDelays.length);assert.equal(o.updates.length,0);});
