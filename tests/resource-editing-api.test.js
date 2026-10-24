import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {partnerResources} from '../lib/partner-resources.ts';
import {service} from '../lib/service.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'resource-edit-api-'));after(()=>{rmSync(temp,{recursive:true,force:true});for(const key of ['__resourceDb','__resourceUser','__resourceGate'])delete globalThis[key];});
// Actual resource/auth/request/view code; only the subscription check is isolated.
const bundle=await build({stdin:{contents:"export {POST} from './app/api/program-resources/route';export {ProgramResourcesView} from './app/program-resources-view';export {AppError} from './lib/service';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'isolated-resource-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$|\/billing-runtime(?:\.ts)?$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('/billing-runtime')?"export async function requireBusinessSubscription(){return globalThis.__resourceGate();}":a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__resourceDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__resourceUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'api.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const api=await import(pathToFileURL(file).href);
const text={kind:'text',title:'Original approved copy',body:'Original promotional content with disclosure.'},coupon={code:'ORIGINAL10',title:'Original offer',terms:'Follow all store terms and exclusions.'};
const setup=(f,user,gate=()=>{})=>{globalThis.__resourceDb=f.db;globalThis.__resourceUser=user;globalThis.__resourceGate=gate;};
const request=(body,origin='https://affimaro.example')=>new Request('https://affimaro.example/api/program-resources',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const update=(record,type,fields)=>({action:'update',data:{id:record.id,revision:record.revision,type,fields}});
const changed=f=>f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action IN ('program_asset_updated','program_coupon_updated')").get().n;

test('actual brand and agency resource APIs save edits only after the subscription gate without creating financial records',async t=>{
 const f=await partnerFixture(t);let checks=0;
 for(const role of ['brand','agency'])for(const type of ['asset','coupon']){
  const owner=partnerResources(f.db,f[role]),record=await owner[type==='asset'?'addAsset':'addCoupon'](type==='asset'?text:coupon);setup(f,f[role],()=>{checks++;});const response=await api.POST(request(update(record,type,{...(type==='asset'?text:coupon),title:'Saved resource title'})));assert.equal(response.status,200);const saved=(await response.json()).data;assert.equal(saved.id,record.id);assert.equal(saved.revision,2);assert.equal(saved.title,'Saved resource title');
 }
 assert.equal(checks,4);for(const table of ['billing_checkouts','payout_requests','orders'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});

test('actual update requests enforce authentication, origin, roles, strict fields, ownership, revision and paid access',async t=>{
 const f=await partnerFixture(t),record=await partnerResources(f.db,f.brand).addAsset(text),body=update(record,'asset',text);
 setup(f,null);assert.equal((await api.POST(request(body))).status,401);setup(f,f.brand);assert.equal((await api.POST(request(body,'https://foreign.example'))).status,403);
 for(const role of ['affiliate','creator']){setup(f,f[role]);assert.equal((await api.POST(request(body))).status,403);}
 setup(f,f.foreignBrand);assert.equal((await api.POST(request(body))).status,409);setup(f,f.brand);assert.equal((await api.POST(request({...body,data:{...body.data,fields:{...text,status:'archived'}}}))).status,400);assert.equal((await api.POST(request({...body,data:{...body.data,revision:2}}))).status,409);
 let checks=0;setup(f,f.brand,()=>{checks++;throw new api.AppError(402,'An active subscription is required.');});assert.equal((await api.POST(request(body))).status,402);assert.equal(checks,1);assert.equal((await partnerResources(f.db,f.brand).editable({id:record.id,type:'asset'})).record.revision,1);assert.equal(changed(f),0);
 checks=0;assert.equal((await api.POST(request({action:'unknown',data:{}}))).status,400);assert.equal(checks,0);
 const archived=await api.POST(request({action:'archive',data:{id:record.id,revision:1,type:'asset'}}));assert.equal(archived.status,200);assert.equal(checks,0);
});

test('both business portals prefill only their own editor and show effective coupon availability',async t=>{
 const f=await partnerFixture(t);
 for(const role of ['brand','agency']){
  const owner=partnerResources(f.db,f[role]),asset=await owner.addAsset(text),code=await owner.addCoupon({...coupon,startsAt:'2090-01-01T00:00:00.000Z'});await owner.addCoupon({...coupon,code:'EXPIRED',expiresAt:'2020-01-01T00:00:00.000Z'});setup(f,f[role]);const render=params=>api.ProgramResourcesView({portal:role,searchParams:Promise.resolve(params)}).then(renderToStaticMarkup);
  const html=await render({tab:'assets',edit:asset.id});assert.ok(html.includes('Edit asset'));assert.ok(html.includes('Save asset changes'));assert.ok(html.includes('Original promotional content'));assert.ok(!html.includes('name="url"'));assert.ok(html.includes('Cancel editing'));assert.ok(html.includes('data-portal="'+role+'"'));
  const codes=await render({tab:'coupons',edit:code.id});assert.ok(codes.includes('Edit coupon code'));assert.ok(codes.includes('Scheduled'));assert.ok(codes.includes('Expired'));assert.ok(codes.includes('Loading date fields'));assert.ok(codes.includes('value="ORIGINAL10"'));
  await assert.rejects(api.ProgramResourcesView({portal:role,searchParams:Promise.resolve({tab:'coupons',edit:asset.id})}),e=>e.notFound===true);
 }
 setup(f,f.foreignBrand);const foreign=(await partnerResources(f.db,f.brand).manage()).assets[0];await assert.rejects(api.ProgramResourcesView({portal:'brand',searchParams:Promise.resolve({edit:foreign.id})}),e=>e.notFound===true);
 setup(f,f.creator);await assert.rejects(api.ProgramResourcesView({portal:'brand',searchParams:Promise.resolve({})}),e=>typeof e.location==='string');
});

test('editing a resource with a suspended assignment keeps that selection instead of silently publishing to everyone',async t=>{
 const f=await partnerFixture(t),owner=partnerResources(f.db,f.brand),asset=await owner.addAsset({...text,applicationId:f.application.id});await service(f.db,f.brand).review({applicationId:f.application.id,status:'suspended'});setup(f,f.brand);
 const html=renderToStaticMarkup(await api.ProgramResourcesView({portal:'brand',searchParams:Promise.resolve({edit:asset.id})}));assert.ok(html.includes('Current assigned partner is unavailable'));assert.ok(html.includes('explicitly select all approved partners'));assert.ok(html.includes('value="'+f.application.id+'" selected=""'));
 const response=await api.POST(request(update(asset,'asset',{...text,applicationId:f.application.id})));assert.equal(response.status,403);assert.equal(changed(f),0);
});
