import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {partnerFixture} from './support/partner-workspace.js';
import {service} from '../lib/service.ts';
import {partnerResources} from '../lib/partner-resources.ts';
import {closeAccount} from '../lib/account-closure.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'partnership-api-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__partnershipApiDb;delete globalThis.__partnershipApiUser;delete globalThis.__partnershipBillingGate;});
// The actual request/auth/application code runs with isolated D1. Only the paid
// access check is replaced, to change evidence while that awaited check runs.
const bundle=await build({stdin:{contents:"export {POST,PATCH} from './app/api/applications/route';export {AppError} from './lib/service';",resolveDir:root,loader:'ts'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'isolated-partnership-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$|\/billing-runtime(?:\.ts)?$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('/billing-runtime')?"export async function requireBusinessSubscription(){if(!globalThis.__partnershipBillingGate)throw new Error('Missing isolated billing gate');return globalThis.__partnershipBillingGate();}":a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__partnershipApiDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__partnershipApiUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(){throw new Error('Unexpected redirect');}",loader:'js'}));}}]});const file=join(temp,'api.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const api=await import(pathToFileURL(file).href);
function setup(f,user,gate){globalThis.__partnershipApiDb=f.db;globalThis.__partnershipApiUser=user;globalThis.__partnershipBillingGate=gate;}
const request=(body,method='PATCH',origin='https://affimaro.example')=>new Request('https://affimaro.example/api/applications',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const reviewCount=f=>f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='application_reviewed'").get().n;

test('the actual review API approves verified partners for brand and agency programs after their subscription gate',async t=>{
 const f=await partnerFixture(t);for(const [owner,partner] of [[f.brand,f.creator],[f.agency,f.affiliate]]){
  const program=(await service(f.db,owner).businessDashboard()).program,application=await service(f.db,partner).apply({programId:program.id});let checks=0;setup(f,owner,()=>{checks++;});const response=await api.PATCH(request({applicationId:application.id,status:'approved'}));assert.equal(response.status,200);assert.equal(checks,1);assert.equal((await response.json()).data.status,'approved');assert.equal((await partnerResources(f.db,partner).forPartnership(application.id)).partnership.id,application.id);
 }
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_checkouts').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);
});
test('the actual approval API rejects changed ownership, profile revision and competing review decisions after the awaited billing gate',async t=>{
 const mutations=[
  db=>db.sqlite.prepare("UPDATE media_properties SET status='revoked',revision=revision+1 WHERE user_id='creator'").run(),
  db=>db.sqlite.prepare("UPDATE media_properties SET revision=revision+1 WHERE user_id='creator'").run(),
  db=>db.sqlite.prepare("UPDATE media_properties SET verified_at='2020-01-01T00:00:00.000Z' WHERE user_id='creator'").run(),
  db=>db.sqlite.prepare("UPDATE media_properties SET archived=1 WHERE user_id='creator'").run(),
  db=>db.sqlite.prepare("UPDATE platform_applications SET revision=revision+1 WHERE user_id='creator'").run(),
  db=>db.sqlite.prepare("UPDATE platform_applications SET status='changes_requested' WHERE user_id='creator'").run(),
  db=>db.sqlite.prepare("UPDATE applications SET status='rejected' WHERE affiliate_user_id='creator'").run(),
 ];
 for(const mutate of mutations){const f=await partnerFixture(t),before=reviewCount(f);let checks=0;setup(f,f.brand,()=>{checks++;mutate(f.db);});const response=await api.PATCH(request({applicationId:f.pending.id,status:'approved'}));assert.equal(response.status,409);assert.match((await response.json()).error,/changed/);assert.equal(checks,1);assert.notEqual(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(f.pending.id).status,'approved');assert.equal(reviewCount(f),before);}
});
test('closing either participant during the actual API subscription check cannot reactivate a suspended partnership',async t=>{
 for(const target of ['brand','creator']){const f=await partnerFixture(t),before=reviewCount(f);setup(f,f.brand,()=>closeAccount(f.db,f[target],'Closing an isolated test account.'));const response=await api.PATCH(request({applicationId:f.pending.id,status:'approved'}));assert.equal(response.status,409);assert.equal(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(f.pending.id).status,'suspended');assert.equal(reviewCount(f),before);}
});
test('the actual review API never accepts browser-supplied approval evidence or skips the subscription gate',async t=>{
 const f=await partnerFixture(t);let checks=0;setup(f,f.brand,()=>{checks++;throw new api.AppError(402,'An active subscription is required.');});
 const before=reviewCount(f);assert.equal((await api.PATCH(request({applicationId:f.pending.id,status:'approved',approval:{admissionRevision:1,properties:[]}}))).status,400);assert.equal(checks,0);assert.equal((await api.PATCH(request({applicationId:f.pending.id,status:'approved'},'PATCH','https://outside.example'))).status,403);assert.equal(checks,0);assert.equal(reviewCount(f),before);const blocked=await api.PATCH(request({applicationId:f.pending.id,status:'approved'}));assert.equal(blocked.status,402);assert.equal(checks,1);assert.equal(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(f.pending.id).status,'pending');assert.equal(reviewCount(f),before);
});
