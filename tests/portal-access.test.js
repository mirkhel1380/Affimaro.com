import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {accountPortal,writePortal} from '../lib/portal-policy.ts';
import {requireAccountPortal} from '../lib/portal-access.ts';
import {programInvitation} from '../lib/program-invitation.ts';

const identity=userId=>({userId,email:userId+'@example.com'}),fails=status=>error=>error instanceof AppError&&error.status===status;
const affiliate={name:'Example Affiliate',channel:'Blog',website:'',bio:''};
async function fixture(t){
  const db=database(t),brand=service(db,identity('brand')),partner=service(db,identity('affiliate'));
  await brand.saveAccount({name:'Brand User'});await brand.createBusiness({name:'Example Brand',website:''});
  await partner.saveAccount({name:'Affiliate User'});await partner.saveAffiliate(affiliate);
  return {db,brand,partner};
}
test('a primary account role cannot switch by creating the other workspace/profile',async t=>{
  const f=await fixture(t);assert.equal(await accountPortal(f.db,'brand'),'brand');assert.equal(await accountPortal(f.db,'affiliate'),'affiliate');
  await assert.rejects(f.brand.saveAffiliate(affiliate),fails(403));await assert.rejects(f.partner.createBusiness({name:'A different brand',website:''}),fails(403));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM affiliate_profiles').get().n,1);
  const other=service(f.db,identity('other-brand'));await other.saveAccount({name:'Other Brand'});await other.createBusiness({name:'Other Program',website:''});
  const program=(await other.businessDashboard()).program;await assert.rejects(f.brand.apply({programId:program.id}),fails(403));
  const invitation=await programInvitation(f.db,identity('brand'),program.id);assert.equal(invitation.stage,'brand');assert.equal(invitation.referralLink,null);
});
test('server write policy separates setup, finance and Stripe actions and rejects opposite-portal access',async t=>{
  const f=await fixture(t);
  const cases=[['/api/business','POST',{},'brand',true],['/api/affiliate','POST',{},'affiliate',true],['/api/applications','POST',{},'affiliate',false],['/api/applications','PATCH',{},'brand',false],['/api/payments','POST',{action:'request'},'affiliate',false],['/api/payments','POST',{action:'saveBank'},'affiliate',false],['/api/payments','POST',{action:'review'},'brand',false],['/api/payments','POST',{action:'recordPaid'},'brand',false],['/api/stripe-connect','POST',{action:'configure'},'brand',false],['/api/stripe-connect','POST',{action:'start'},'affiliate',false],['/api/stripe-transfers','POST',{},'brand',false],['/api/store','POST',{},'brand',false],['/api/billing','POST',{},'brand',false]];
  for(const [path,method,body,portal,allowUnset] of cases){const rule=writePortal(path,method,body);assert.deepEqual(rule,{portal,allowUnset});await requireAccountPortal(f.db,identity(portal==='brand'?'brand':'affiliate'),portal,allowUnset);await assert.rejects(requireAccountPortal(f.db,identity(portal==='brand'?'affiliate':'brand'),portal,allowUnset),fails(403));}
  await assert.rejects(requireAccountPortal(f.db,identity('new-account'),'brand'),fails(403));assert.equal(await requireAccountPortal(f.db,identity('new-account'),'brand',true),null);
});
test('conditional SQL prevents opposite roles even if a preliminary workspace/profile read becomes stale',async t=>{
  const f=await fixture(t);
  function stale(table){let used=false;return {...f.db,prepare(query){const statement=f.db.prepare(query);if(!used&&query.startsWith('SELECT * FROM '+table+' WHERE')){used=true;return {bind(){return {async first(){return null;}};}};}return statement;}};}
  await assert.rejects(service(stale('workspaces'),identity('brand')).saveAffiliate(affiliate),fails(403));
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM affiliate_profiles WHERE user_id='brand'").get().n,0);
  await assert.rejects(service(stale('affiliate_profiles'),identity('affiliate')).createBusiness({name:'Stale attempted business',website:''}),fails(403));
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM workspaces WHERE owner_id='affiliate'").get().n,0);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM programs').get().n,1);
});
