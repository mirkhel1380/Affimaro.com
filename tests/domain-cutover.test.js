import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {independentFetch} from '../self-hosted/bridge.ts';
import {cloudflareSettings} from '../self-hosted/cloudflare-settings.mjs';
import {verifyCloudflareTarget} from '../self-hosted/preflight.mjs';
import {prepareCustomDomains} from '../self-hosted/custom-domains.mjs';
const origin='https://affimaro.example',owner='https://admin.affimaro.example',legacy='https://affimaro-com.m-mirkhel20.workers.dev';
const settings=()=>cloudflareSettings({APP_ORIGIN:origin,OWNER_ORIGIN:owner,LEGACY_ORIGIN:legacy});
test('cutover keeps the old Worker callback route and verifies exact build origins',()=>{
 const s=settings();assert.equal(s.routing.workers_dev,true);assert.equal(s.workersSubdomain,'m-mirkhel20');assert.deepEqual(s.routing.routes.map(r=>r.pattern),['affimaro.example','admin.affimaro.example']);
 const config={name:'affimaro-com',account_id:s.accountId,vars:{APP_ORIGIN:origin,OWNER_ORIGIN:owner,LEGACY_ORIGIN:legacy},d1_databases:[{binding:'DB',database_id:s.databaseId}],...s.routing};verifyCloudflareTarget(config,s);assert.throws(()=>verifyCloudflareTarget({...config,vars:{...config.vars,LEGACY_ORIGIN:undefined}},s));
});
test('legacy pages move to the new hosts, browser writes fail and signed webhook bytes remain unchanged',async t=>{
 const db=database(t),env={DB:db,APP_ORIGIN:origin,OWNER_ORIGIN:owner,LEGACY_ORIGIN:legacy,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',AUTH_SESSION_ENCRYPTION_KEY:'ab'.repeat(32)};let calls=0;
 const app=async request=>{calls++;assert.equal(request.headers.get('oai-authenticated-user-id'),null);return new Response(await request.text());};
 for(const [path,destination] of [['/pricing?plan=growth',origin],['/auth/owner/login',owner],['/owner/users',owner]]){const r=await independentFetch(new Request(legacy+path),env,app);assert.equal(r.status,307);assert.equal(r.headers.get('location'),destination+path);}
 for(const path of ['/auth/brand/login','/api/billing','/api/admin/billing-setup']){const r=await independentFetch(new Request(legacy+path,{method:'POST',body:'private form'}),env,app);assert.equal(r.status,409);assert.equal(r.headers.get('location'),null);}
 const denied=await independentFetch(new Request(legacy+'/api/billing'),env,app);assert.equal(denied.status,409);assert.equal(calls,0);
 const raw=' { "signed": "original body" }\n';for(const path of ['/api/billing/webhook','/api/custom/event','/api/woocommerce/event']){const r=await independentFetch(new Request(legacy+path,{method:'POST',headers:{'stripe-signature':'fixture','oai-authenticated-user-id':'spoof'},body:raw}),env,app);assert.equal(await r.text(),raw);}assert.equal(calls,3);
});
test('domain preflight attaches only missing exact hostnames and checks HTTPS before upload',async()=>{
 const s=settings(),calls=[],bindings=[];
 await prepareCustomDomains(s,'fixture-token',async(url,init)=>{calls.push({url,init});if(url.startsWith('https://api.cloudflare.com')){if(url.includes('/zones?'))return Response.json({success:true,result:[{id:'a'.repeat(32),name:'affimaro.example',status:'active',account:{id:s.accountId}}]});if(init.method==='PUT'){bindings.push(JSON.parse(init.body));return Response.json({success:true,result:bindings.at(-1)});}return Response.json({success:true,result:bindings});}return new Response('old Worker rejects new host',{status:403});});
 assert.equal(calls.filter(c=>c.init.method==='PUT').length,2);assert.deepEqual(bindings.map(b=>b.hostname),['affimaro.example','admin.affimaro.example']);assert.equal(calls.filter(c=>!c.url.startsWith('https://api.cloudflare.com')).length,2);
});
test('domain preflight never overwrites another Worker, removes extra bindings or proceeds without DNS/TLS',async()=>{
 const s=settings();for(const bindings of [[{hostname:'affimaro.example',service:'other-worker',environment:'production'}],[{hostname:'extra.affimaro.example',service:'affimaro-com',environment:'production'}]]){let writes=0;await assert.rejects(prepareCustomDomains(s,'fixture',async(_url,init)=>{if(init.method==='PUT')writes++;return Response.json({success:true,result:bindings});}));assert.equal(writes,0);}
 const bindings=s.routing.routes.map(r=>({hostname:r.pattern,service:'affimaro-com',environment:'production'}));await assert.rejects(prepareCustomDomains(s,'fixture',async url=>url.startsWith('https://api.cloudflare.com')?Response.json({success:true,result:bindings}):new Response(null,{status:526})),/current Worker has not been replaced/);
 await assert.rejects(prepareCustomDomains(s,'fixture',async()=>new Response(null,{status:403})),/Custom domain access failed/);
});
