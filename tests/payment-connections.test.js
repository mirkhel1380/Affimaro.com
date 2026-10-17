import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {paymentConnections,STRIPE_VERSION,WISE_VERSION} from '../lib/payment-connections.ts';
import {openPayment} from '../lib/payment-crypto.ts';
const key='ce'.repeat(32),secret='rk_test_FIXTUREONLY1234567890',wiseSecret='FIXTURE_ONLY_WISE_1234567890';
const identity=id=>({userId:id,email:`${id}@example.com`});
const fails=n=>e=>e instanceof AppError&&e.status===n;
const stripeInput=(overrides={})=>({provider:'stripe',mode:'test',secret,...overrides});
const wiseInput=(overrides={})=>({provider:'wise',mode:'test',secret:wiseSecret,profileId:'24680',...overrides});
const data=value=>Response.json(value);
async function fixture(t){
  const db=database(t),owner=service(db,identity('owner'));
  await owner.saveAccount({name:'Merchant Example'});await owner.createBusiness({name:'Merchant Business',website:''});
  const workspace=await owner.workspace();
  const state={calls:[],error:null,hook:null,account:{object:'account',id:'acct_FIXTURE123456',country:'US',default_currency:'usd',payouts_enabled:false,business_profile:{name:'Example Business'},email:'private-owner@example.com',external_accounts:{data:[{account_number:'123456789'}]}},balance:{object:'balance',livemode:false,available:[{currency:'usd',amount:123456}]},profiles:[{id:13579,type:'PERSONAL',firstName:'Sensitive Person',dateOfBirth:'1990-01-01'},{id:24680,type:'BUSINESS',businessName:'Example Wise Ltd',address:{countryIso2Code:'GB',addressFirstLine:'Sensitive address'},currentState:'VISIBLE'}]};
  const fetcher=async(url,init)=>{
    state.calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.ok(init.signal instanceof AbortSignal);assert.ok(!init.body);assert.ok(!url.includes(secret));assert.ok(!url.includes(wiseSecret));
    if(state.hook)await state.hook(url,init);
    if(state.error)return state.error(url,init);
    if(url==='https://api.stripe.com/v1/account')return data(state.account);
    if(url==='https://api.stripe.com/v1/balance')return data(state.balance);
    if([`https://api.wise.com/${WISE_VERSION}/profiles`,`https://api.wise-sandbox.com/${WISE_VERSION}/profiles`].includes(url))return data(state.profiles);
    throw new Error('Unexpected provider endpoint');
  };
  return {db,owner,workspace,state,fetcher,api:paymentConnections(db,identity('owner'),key,fetcher)};
}
const target=c=>({provider:c.provider,connectionId:c.id});

test('Stripe access is remotely checked with GET only, pinned API version, and encrypted tenant-bound storage',async t=>{
  const f=await fixture(t),c=await f.api.connect(stripeInput());
  assert.equal(c.external_id,f.state.account.id);assert.equal(c.status,'verified');assert.equal(c.mode,'test');assert.equal(c.payouts_enabled,0);assert.equal(c.currency,'USD');assert.equal(f.state.calls.length,2);
  for(const call of f.state.calls){assert.equal(call.init.headers.Authorization,`Bearer ${secret}`);assert.equal(call.init.headers['Stripe-Version'],STRIPE_VERSION);assert.equal(call.init.headers['Stripe-Account'],undefined);}
  const saved=f.db.sqlite.prepare('SELECT * FROM payment_connections').get();assert.ok(!saved.encrypted_credential.includes(secret));
  assert.equal(await openPayment(saved.encrypted_credential,key,`provider/${f.workspace.id}/stripe/${c.id}`),secret);
  await assert.rejects(openPayment(saved.encrypted_credential,key,`provider/another/stripe/${c.id}`),fails(503));
  const publicData=JSON.stringify([c,await f.api.list()]);for(const value of [secret,'encrypted_credential','private-owner@example.com','123456789','\"available\"'])assert.ok(!publicData.includes(value));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);
});
test('key mode, publishable keys, unsafe Wise IDs, extra identities and arbitrary hosts fail before provider access',async t=>{
  const f=await fixture(t);
  for(const value of [stripeInput({mode:'live'}),stripeInput({secret:'pk_test_FIXTURE_1234567890'}),stripeInput({workspaceId:'another'}),stripeInput({apiUrl:'https://attacker.example'}),wiseInput({profileId:'9007199254740992'}),wiseInput({profileId:'1/../../admin'}),wiseInput({secret:'bad\r\nAuthorization: value'})])await assert.rejects(f.api.connect(value),fails(400));
  assert.equal(f.state.calls.length,0);assert.equal((await f.api.list()).length,0);
});
test('Stripe response mode and required account identity must match before a connection can be saved',async t=>{
  const f=await fixture(t);f.state.balance.livemode=true;await assert.rejects(f.api.connect(stripeInput()),fails(409));
  f.state.balance.livemode=false;f.state.account.id='another-provider';await assert.rejects(f.api.connect(stripeInput()),fails(502));assert.equal((await f.api.list()).length,0);
});
test('provider HTTP failures never reflect credential bodies or overwrite a previously checked account',async t=>{
  const f=await fixture(t),c=await f.api.connect(stripeInput());
  for(const [status,expected] of [[401,409],[403,409],[429,429],[500,502]]){
    f.state.error=()=>new Response(JSON.stringify({error:{message:secret}}),{status});
    await assert.rejects(f.api.connect(stripeInput({secret:'sk_test_REPLACEMENTFIXTURE123456'})),e=>fails(expected)(e)&&!e.message.includes(secret));
    assert.equal((await f.api.list())[0].id,c.id);
  }
});
test('transport errors, redirects, oversized bodies and invalid JSON are bounded and leave no connection',async t=>{
  const f=await fixture(t);
  for(const fail of [()=>{throw new Error(secret)},()=>new Response(null,{status:302,headers:{Location:`https://attacker.example/${secret}`}}),()=>new Response('x'.repeat(262145)),()=>new Response('not JSON')]){
    f.state.error=fail;await assert.rejects(f.api.connect(stripeInput()),e=>fails(502)(e)&&!e.message.includes(secret));assert.equal((await f.api.list()).length,0);
  }
});
test('Wise uses the selected fixed environment and only the accessible business profile is returned',async t=>{
  const f=await fixture(t),sandbox=await f.api.connect(wiseInput());
  assert.equal(f.state.calls[0].url,`https://api.wise-sandbox.com/${WISE_VERSION}/profiles`);assert.equal(sandbox.external_id,'24680');assert.equal(sandbox.country,'GB');assert.equal(sandbox.payouts_enabled,null);
  assert.match(f.state.calls[0].init.headers['X-External-Correlation-Id'],/^[a-f0-9-]{36}$/);
  const live=await f.api.connect(wiseInput({mode:'live'}));assert.equal(live.mode,'live');assert.equal(f.state.calls.at(-1).url,`https://api.wise.com/${WISE_VERSION}/profiles`);
  const serialized=JSON.stringify(await f.api.list());for(const privateValue of [wiseSecret,'Sensitive Person','Sensitive address','1990-01-01'])assert.ok(!serialized.includes(privateValue));
  assert.equal((await f.api.list()).length,1);
});
test('Wise rejects personal, unavailable, inactive and malformed business profiles',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.api.connect(wiseInput({profileId:'13579'})),fails(409));await assert.rejects(f.api.connect(wiseInput({profileId:'99999'})),fails(409));
  f.state.profiles[1].currentState='DEACTIVATED';await assert.rejects(f.api.connect(wiseInput()),fails(409));
  f.state.profiles[1].currentState='VISIBLE';f.state.profiles[1].id=9007199254740992;await assert.rejects(f.api.connect(wiseInput()),fails(502));assert.equal((await f.api.list()).length,0);
});
test('no runtime encryption key means no credential is sent or stored, and corrupt ciphertext is not sent',async t=>{
  const f=await fixture(t);await assert.rejects(paymentConnections(f.db,identity('owner'),undefined,f.fetcher).connect(stripeInput()),fails(503));assert.equal(f.state.calls.length,0);
  const c=await f.api.connect(stripeInput());f.state.calls.length=0;f.db.sqlite.prepare("UPDATE payment_connections SET encrypted_credential='invalid'").run();await assert.rejects(f.api.check(target(c)),fails(503));assert.equal(f.state.calls.length,0);
});
test('other owners and affiliates cannot inspect, check or remove a business connection',async t=>{
  const f=await fixture(t),c=await f.api.connect(stripeInput()),other=service(f.db,identity('other'));
  await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other Business',website:''});const another=paymentConnections(f.db,identity('other'),key,f.fetcher);assert.deepEqual(await another.list(),[]);
  const before=f.state.calls.length;await assert.rejects(another.check(target(c)),fails(409));await assert.rejects(another.remove(target(c)),fails(409));
  const affiliate=paymentConnections(f.db,identity('affiliate'),key,f.fetcher);await assert.rejects(affiliate.list(),fails(404));await assert.rejects(affiliate.connect(wiseInput()),fails(404));assert.equal(f.state.calls.length,before);assert.equal((await f.api.list()).length,1);
});
test('rechecks update provider capabilities, preserve last verified time on failure and recover without showing keys',async t=>{
  const f=await fixture(t),c=await f.api.connect(stripeInput());f.state.account.payouts_enabled=true;const checked=await f.api.check(target(c));assert.equal(checked.payouts_enabled,1);
  f.state.error=()=>new Response(secret,{status:401});const attention=await f.api.check(target(c));assert.equal(attention.status,'attention');assert.equal(attention.last_verified_at,checked.last_verified_at);assert.ok(!attention.last_error.includes(secret));
  f.state.error=null;const recovered=await f.api.check(target(c));assert.equal(recovered.status,'verified');assert.equal(recovered.last_error,null);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM commission_approvals').get().n,0);
});
test('a recheck cannot silently change the stored provider account identity',async t=>{
  const f=await fixture(t),c=await f.api.connect(stripeInput());f.state.account.id='acct_DIFFERENT1234';const checked=await f.api.check(target(c));assert.equal(checked.status,'attention');assert.equal(checked.external_id,c.external_id);assert.match(checked.last_error,/identity changed/);
});
test('a slow check cannot overwrite replacement credentials saved by another tab',async t=>{
  const f=await fixture(t),c=await f.api.connect(stripeInput());let replacement;
  f.state.hook=async()=>{f.state.hook=null;replacement=await f.api.connect(stripeInput({secret:'sk_test_NEWFIXTUREONLY123456'}));};
  await assert.rejects(f.api.check(target(c)),fails(409));const latest=(await f.api.list())[0];assert.equal(latest.id,replacement.id);assert.notEqual(latest.id,c.id);
  const saved=f.db.sqlite.prepare('SELECT encrypted_credential FROM payment_connections').get();assert.equal(await openPayment(saved.encrypted_credential,key,`provider/${f.workspace.id}/stripe/${latest.id}`),'sk_test_NEWFIXTUREONLY123456');
});
test('stale removal cannot delete a replacement; removing one provider preserves the other and financial records',async t=>{
  const f=await fixture(t),old=await f.api.connect(stripeInput()),replacement=await f.api.connect(stripeInput()),wise=await f.api.connect(wiseInput());
  await assert.rejects(f.api.remove(target(old)),fails(409));await f.api.remove(target(replacement));assert.deepEqual((await f.api.list()).map(c=>c.id),[wise.id]);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,1);
  const audit=f.db.sqlite.prepare("SELECT action FROM audit_events WHERE action='stripe_account_removed'").all();assert.equal(audit.length,1);
});
test('account saves, checks and removal roll back with their audit record when an audit write fails',async t=>{
  const f=await fixture(t);f.db.sqlite.exec("CREATE TRIGGER reject_provider_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE '%account_%' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  await assert.rejects(f.api.connect(stripeInput()));assert.equal((await f.api.list()).length,0);f.db.sqlite.exec('DROP TRIGGER reject_provider_audit');
  const c=await f.api.connect(stripeInput());f.db.sqlite.exec("CREATE TRIGGER reject_provider_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE '%account_%' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  f.state.error=()=>new Response('unauthorized',{status:401});await assert.rejects(f.api.check(target(c)));assert.equal((await f.api.list())[0].status,'verified');await assert.rejects(f.api.remove(target(c)));assert.equal((await f.api.list())[0].id,c.id);
});
