import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement,isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {commerce,signStoreRequest,receiveStoreEvent} from '../lib/woocommerce.ts';
import {storeConnectionProgress,storeWorkspacePath} from '../lib/store-progress.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'store-progress-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__storeProgressDb;delete globalThis.__storeProgressUser;});
const bundle=await build({stdin:{contents:"export {WorkspaceView} from './app/workspace/page';export {StoreSetup} from './app/store-setup';export {ShopifySetup} from './app/shopify-setup';export {StoreChoice} from './app/store-choice';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'store-progress-fixture',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__storeProgressDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__storeProgressUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'store.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
function instances(node,type,out=[]){if(Array.isArray(node)){for(const child of node)instances(child,type,out);return out;}if(!isValidElement(node))return out;if(node.type===type)out.push(node.props);instances(node.props.children,type,out);return out;}
const set=(f,user)=>{globalThis.__storeProgressDb=f.db;globalThis.__storeProgressUser=user;};

test('brand and agency store panels pass the matching portal to every platform connection form',async t=>{
 const f=await partnerFixture(t);for(const portal of ['brand','agency']){set(f,f[portal]);const base=portal==='agency'?'/agency/program':'/workspace';let element=await views.WorkspaceView({portal,base,searchParams:Promise.resolve({tab:'store'})});const component=portal==='brand'?views.StoreSetup:views.StoreChoice;assert.equal(instances(element,component)[0].portal,portal);
  if(portal==='agency'){await commerce(f.db,f.agency).configure({action:'connect',platform:'custom',storeUrl:'https://agency.example'});element=await views.WorkspaceView({portal,base,searchParams:Promise.resolve({tab:'store'})});assert.equal(instances(element,views.StoreSetup)[0].portal,'agency');}
 }
});

test('connection verification alone does not claim that referred order tracking has been received',async t=>{
 const f=await partnerFixture(t);set(f,f.brand);const html=renderToStaticMarkup(await views.WorkspaceView({portal:'brand',base:'/workspace',searchParams:Promise.resolve({tab:'overview'})}));assert.ok(!html.includes('signed order tracking configured'));assert.ok(html.includes('Waiting for referral data'));
 const store=renderToStaticMarkup(await views.WorkspaceView({portal:'brand',base:'/workspace',searchParams:Promise.resolve({tab:'store'})}));assert.ok(store.includes('Recorded setup progress'));assert.ok(store.includes('First referred order'));assert.ok(store.includes('Refresh saved status'));
});

test('paused connections retain their own history and explain the next step without marking tracking live',async t=>{
 const f=await partnerFixture(t);await commerce(f.db,f.brand).configure({action:'disconnect'});set(f,f.brand);const html=renderToStaticMarkup(await views.WorkspaceView({portal:'brand',base:'/workspace',searchParams:Promise.resolve({tab:'store'})}));assert.ok(html.includes('Connection paused'));assert.ok(html.includes('Resume the connection'));assert.ok(!html.includes('signed order tracking configured'));
});


const connected={platform:'woocommerce',active:1,last_seen:'2026-10-24T00:00:00.000Z'};
const shopStatus={shop_domain:'example.myshopify.com',client_id:'fixture-client-identifier',scopes:['read_orders'],synced_through:null,in_progress:false,last_result:null,pending:[]};
const completeSync={checked:0,imported:0,deferred:0,unattributed:0,testOrders:0,hasMore:false,at:'2026-10-24T00:00:00.000Z'};

test('recorded progress keeps verification, program activity and referred order evidence separate',()=>{
 for(const platform of ['woocommerce','custom']){
  const input={connection:{...connected,platform},programActive:true,referrals:0,orders:0};assert.equal(storeConnectionProgress({...input,connection:null}).state,'not_connected');assert.equal(storeConnectionProgress({...input,connection:{...input.connection,last_seen:null}}).state,'verification_pending');assert.equal(storeConnectionProgress(input).state,'referral_pending');assert.equal(storeConnectionProgress({...input,referrals:1}).state,'order_pending');assert.equal(storeConnectionProgress({...input,referrals:1,orders:1}).state,'order_received');
  const paused=storeConnectionProgress({...input,referrals:1,orders:1,connection:{...input.connection,active:0}});assert.equal(paused.state,'connection_paused');assert.ok(paused.completed<paused.total);
  const program=storeConnectionProgress({...input,referrals:1,orders:1,programActive:false});assert.equal(program.state,'program_paused');assert.equal(program.nextTab,'program');
 }
});

test('Shopify app verification, incomplete sync, data holds and an empty completed sync have distinct next steps',()=>{
 const input={connection:{...connected,platform:'shopify'},programActive:true,referrals:0,orders:0,shopify:shopStatus};
 assert.equal(storeConnectionProgress({...input,shopify:null}).state,'verification_pending');assert.equal(storeConnectionProgress({...input,shopify:{...shopStatus,scopes:[]}}).state,'verification_pending');assert.equal(storeConnectionProgress(input).state,'sync_pending');assert.equal(storeConnectionProgress({...input,shopify:{...shopStatus,in_progress:true}}).state,'syncing');
 assert.equal(storeConnectionProgress({...input,shopify:{...shopStatus,synced_through:connected.last_seen,last_result:{...completeSync,hasMore:true}}}).state,'syncing');
 const held=storeConnectionProgress({...input,shopify:{...shopStatus,synced_through:connected.last_seen,pending:[{order_id:'gid://shopify/Order/1',reason:'Waiting for data.'}]}});assert.equal(held.state,'review');assert.equal(held.steps.find(s=>s.id==='sync').complete,false);
 const empty=storeConnectionProgress({...input,shopify:{...shopStatus,synced_through:connected.last_seen,last_result:completeSync}});assert.equal(empty.state,'referral_pending');assert.equal(empty.steps.find(s=>s.id==='sync').complete,true);assert.ok(empty.nextStep.includes('test orders are excluded'));assert.equal(empty.steps.find(s=>s.id==='order').complete,false);
});

test('recorded progress does not project credentials and portal paths always preserve the represented-program destination',()=>{
 const result=storeConnectionProgress({connection:{...connected,signing_key:'DO_NOT_PROJECT_SIGNING_KEY'},programActive:true,referrals:1,orders:1,shopify:{...shopStatus,encrypted_secret:'DO_NOT_PROJECT_SECRET',encrypted_token:'DO_NOT_PROJECT_TOKEN'}});const text=JSON.stringify(result);assert.ok(!text.includes('DO_NOT_PROJECT'));assert.ok(!text.includes('client_id'));
 assert.equal(storeWorkspacePath('agency'),'\/agency/program?tab=store');assert.equal(storeWorkspacePath('agency','orders'),'\/agency/program?tab=orders');assert.equal(storeWorkspacePath('agency','program'),'\/agency/program?tab=program');assert.equal(storeWorkspacePath('brand'),'\/workspace?tab=store');
});

async function deliver(f,key,payload){const raw=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),id=crypto.randomUUID(),signature=await signStoreRequest(key,timestamp,id,raw);return receiveStoreEvent(f.db,new Request('https://affimaro.example/api/woocommerce/event',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':f.connected.connection.id,'X-Affimaro-Event':id,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Signature':signature},body:raw}));}

test('actual signed connection, referral and order delivery advance recorded progress; key rotation still requires fresh verification',async t=>{
 const f=await partnerFixture(t),api=commerce(f.db,f.brand),progress=async()=>{const data=await api.dashboard();return storeConnectionProgress({connection:data.connection,programActive:true,referrals:data.visits,orders:data.totals.reduce((n,r)=>n+r.count,0)});};
 let rotated=await api.configure({action:'rotate'});assert.equal((await progress()).state,'verification_pending');await deliver(f,rotated.key,{kind:'ping',storeUrl:rotated.connection.store_url});assert.equal((await progress()).state,'referral_pending');
 const referral=await deliver(f,rotated.key,{kind:'referral',applicationId:f.application.id});assert.equal((await progress()).state,'order_pending');await deliver(f,rotated.key,{kind:'order',orderId:'1234',revision:1,referralId:referral.referralId,createdAt:new Date().toISOString(),currency:'USD',decimals:2,basis:10000,refundedBasis:0,status:'processing',refundUnallocated:false});assert.equal((await progress()).state,'order_received');
 rotated=await api.configure({action:'rotate'});const after=await progress();assert.equal(after.state,'verification_pending');assert.equal(after.steps.find(s=>s.id==='order').complete,true);set(f,f.brand);const html=renderToStaticMarkup(await views.WorkspaceView({portal:'brand',base:'/workspace',searchParams:Promise.resolve({tab:'store'})}));assert.ok(!html.includes(rotated.key));assert.ok(html.includes('Waiting for connection verification'));
});

test('agency store progress is read-only and cannot obtain another workspace connection or create provider activity',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE store_connections SET store_url=? WHERE id=?').run('https://PRIVATE-OTHER-STORE.example',f.connected.connection.id);await commerce(f.db,f.agency).configure({action:'connect',platform:'custom',storeUrl:'https://agency.example'});set(f,f.agency);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected provider operation');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 const html=renderToStaticMarkup(await views.WorkspaceView({portal:'agency',base:'/agency/program',searchParams:Promise.resolve({tab:'store'})}));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);assert.ok(!html.includes('PRIVATE-OTHER-STORE'));assert.ok(html.includes('href="/agency/program?tab=store"'));assert.ok(!html.includes('href="/workspace?tab=store"'));
 for(const role of ['affiliate','creator']){set(f,f[role]);await assert.rejects(views.WorkspaceView({portal:'agency',base:'/agency/program',searchParams:Promise.resolve({tab:'store'})}),e=>typeof e.location==='string');}
});

test('rendered WooCommerce, custom and Shopify controls retain brand or agency store and order links',async t=>{
 const f=await partnerFixture(t);for(const portal of ['brand','agency']){
  for(const platform of ['woocommerce','custom']){const html=renderToStaticMarkup(createElement(views.StoreSetup,{portal,initial:{...f.connected.connection,platform},platform}));assert.ok(html.includes('href="'+storeWorkspacePath(portal)+'"'));if(portal==='agency')assert.ok(!html.includes('href="/workspace?tab='));}
  const html=renderToStaticMarkup(createElement(views.ShopifySetup,{portal,connection:{...f.connected.connection,platform:'shopify'},status:{...shopStatus,synced_through:connected.last_seen,last_result:completeSync}}));assert.ok(html.includes('href="'+storeWorkspacePath(portal,'orders')+'"'));assert.ok(html.includes('href="'+storeWorkspacePath(portal)+'"'));if(portal==='agency')assert.ok(!html.includes('href="/workspace?tab='));
 }
});


test('saved Shopify metadata remains scoped to the matching business portal without contacting Shopify',async t=>{
 const f=await partnerFixture(t);await commerce(f.db,f.agency).configure({action:'connect',platform:'custom',storeUrl:'https://agency.example'});let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected Shopify request');});
 for(const portal of ['brand','agency']){
  const c=(await commerce(f.db,f[portal]).dashboard()).connection;f.db.sqlite.prepare("UPDATE store_connections SET platform='shopify',last_seen=? WHERE id=?").run(connected.last_seen,c.id);
  f.db.sqlite.prepare('INSERT INTO shopify_accounts(store_id,shop_domain,shop_id,client_id,encrypted_secret,encrypted_token,token_expires_at,scopes) VALUES(?,?,?,?,?,?,?,?)').run(c.id,portal+'.myshopify.com','gid://shopify/Shop/1','fixture-client-identifier','PRIVATE_ENCRYPTED_SECRET','PRIVATE_ENCRYPTED_TOKEN','2090-01-01T00:00:00.000Z','read_orders');
  set(f,f[portal]);const base=portal==='agency'?'/agency/program':'/workspace',before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,element=await views.WorkspaceView({portal,base,searchParams:Promise.resolve({tab:'store'})});assert.equal(instances(element,views.ShopifySetup)[0].portal,portal);const html=renderToStaticMarkup(element);assert.ok(html.includes('First Shopify sync pending'));assert.ok(!html.includes('PRIVATE_ENCRYPTED'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
 }
 assert.equal(calls,0);
});
