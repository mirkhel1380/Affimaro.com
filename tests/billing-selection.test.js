import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service} from '../lib/service.ts';
import {billingSelection} from '../lib/billing-selection.ts';
import {platformBillingCatalog} from '../lib/platform-billing-catalog.ts';
async function fixture(t){
 const db=database(t),at=new Date().toISOString(),accounts={};
 for(const portal of ['brand','agency','affiliate','creator']){
  const user={userId:portal,email:portal+'@example.com'},api=service(db,user);await api.saveAccount({name:portal+' owner'});await api.createBusiness({name:portal+' business',website:''});db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run(portal,portal,at);accounts[portal]=await api.workspace();
 }
 function save(role,price,amount,status='active'){
  const id=crypto.randomUUID();db.sqlite.prepare('INSERT INTO billing_accounts (id,workspace_id,platform_id,mode,price_id,amount,subscription_id,status,created_at,updated_at) VALUES (?,?,?,\'live\',?,?,?, ?,?,?)').run(id,accounts[role].id,platformBillingCatalog.accountId,price,amount,'sub_FIXTURE'+role.toUpperCase()+'123',status,at,at);return id;
 }
 function pending(role,account,price,amount){const id=crypto.randomUUID();db.sqlite.prepare("INSERT INTO billing_checkouts(id,account_id,workspace_id,price_id,amount,state,first_submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?,?)").run(id,account,accounts[role].id,price,amount,at,at,at);return id;}
 return {db,save,pending};
}
test('new billing selections use durable account roles, keep free roles out and do not inherit another owner’s price',async t=>{
 const f=await fixture(t);f.save('brand',platformBillingCatalog.prices.growth,4900);assert.deepEqual(await billingSelection(f.db,'agency','starter'),{plan:'starter',portal:'agency'});assert.deepEqual(await billingSelection(f.db,'brand','business'),{plan:'business',portal:'brand'});
 for(const role of ['affiliate','creator'])await assert.rejects(billingSelection(f.db,role,'starter'),e=>e.status===403);
});
test('existing agency subscriptions keep old verified prices while new purchases use the current agency schedule',async t=>{
 const f=await fixture(t);f.save('agency',platformBillingCatalog.prices.growth,4900);
 assert.deepEqual(await billingSelection(f.db,'agency',undefined,true),{plan:'growth',portal:'agency',priceId:platformBillingCatalog.prices.growth,savedPrice:true,legacyPrice:true});
 assert.deepEqual(await billingSelection(f.db,'agency','starter'),{plan:'starter',portal:'agency'});
 f.db.sqlite.prepare("UPDATE billing_accounts SET status='canceled'").run();assert.deepEqual(await billingSelection(f.db,'agency','starter',true),{plan:'starter',portal:'agency'});
});
test('an unresolved old agency payment retains its original context until expiration and rejects a mismatched notification price',async t=>{
 const f=await fixture(t),account=f.save('agency',null,null,'none'),attempt=f.pending('agency',account,platformBillingCatalog.prices.starter,1900);
 const selected=await billingSelection(f.db,'agency','starter');assert.equal(selected.legacyPrice,true);assert.equal(selected.priceId,platformBillingCatalog.prices.starter);
 await assert.rejects(billingSelection(f.db,'agency',undefined,true,'price_FOREIGN123'),e=>e.status===409);
 f.db.sqlite.prepare("UPDATE billing_checkouts SET state='expired' WHERE id=?").run(attempt);assert.deepEqual(await billingSelection(f.db,'agency','starter'),{plan:'starter',portal:'agency'});
});
test('new agency saved prices resolve the plan from their own exact amount and invalid saved brand prices cannot grant context',async t=>{
 const f=await fixture(t);f.save('agency','price_AGENCYGROWTH123',7900);assert.deepEqual(await billingSelection(f.db,'agency',undefined,true),{plan:'growth',portal:'agency',priceId:'price_AGENCYGROWTH123',savedPrice:true});
 f.save('brand','price_AGENCYSTARTER123',3900);await assert.rejects(billingSelection(f.db,'brand',undefined,true),e=>e.status===409);
});

test('closed subscription reconciliation retains its owned record without making the old price a new purchase option',async t=>{
 const f=await fixture(t);f.save('agency',platformBillingCatalog.prices.growth,4900,'canceled');
 assert.deepEqual(await billingSelection(f.db,'agency','starter',true,platformBillingCatalog.prices.growth,true),{plan:'growth',portal:'agency',priceId:platformBillingCatalog.prices.growth,savedPrice:true,legacyPrice:true,reconcileOnly:true});
 assert.deepEqual(await billingSelection(f.db,'agency','starter',true),{plan:'starter',portal:'agency'});
});
