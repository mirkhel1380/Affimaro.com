import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {seedOrder,agencyPair} from './support/order-history.js';
import {ordersPath} from '../lib/portal-policy.ts';
import {defaultPreferences} from '../lib/account-preferences.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'order-history-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__orderDb;delete globalThis.__orderUser;});
const bundle=await build({stdin:{contents:"export {OrdersView} from './app/orders-view';export {OrderTable} from './app/tracking';export {default as BrandPage} from './app/workspace/orders/page';export {default as AgencyPage} from './app/agency/orders/page';export {default as AffiliatePage} from './app/partner/orders/page';export {default as CreatorPage} from './app/creator/orders/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'isolated-order-history',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__orderDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__orderUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'orders.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const set=(f,user)=>{globalThis.__orderDb=f.db;globalThis.__orderUser=user;};
const htmlOf=async element=>renderToStaticMarkup(await element).replaceAll(/<!--.*?-->/g,'');

test('the four actual route pages retain their own navigation, filters, older orders and counterpart labels',async t=>{
 const f=await partnerFixture(t),agency=await agencyPair(f);for(let i=0;i<60;i++){seedOrder(f,f.application,f.connected.connection,{external:'BRAND-HISTORY-'+i,state:'review'});seedOrder(f,agency.application,agency.store,{external:'AGENCY-HISTORY-'+i,state:'review'});}
 for(const [role,page,source,other] of [['brand','BrandPage','BRAND-HISTORY','AGENCY-HISTORY'],['affiliate','AffiliatePage','BRAND-HISTORY','AGENCY-HISTORY'],['agency','AgencyPage','AGENCY-HISTORY','BRAND-HISTORY'],['creator','CreatorPage','AGENCY-HISTORY','BRAND-HISTORY']]){
  set(f,f[role]);const html=await htmlOf(views[page]({searchParams:Promise.resolve({q:source,state:'review',currency:'USD',range:'all',page:'3'})}));
  for(const text of ['Page 3 of 3','Orders 51–60 of 60','Matching orders','Orders needing review','All recorded history','Commission state',source])assert.ok(html.includes(text),role+': '+text);
  assert.ok(!html.includes(other));assert.ok(!html.includes('Latest 100 received orders'));assert.ok(html.includes('action="'+ordersPath(role)+'"'));assert.ok(html.includes('href="'+ordersPath(role)+'?q='+source+'&amp;state=review&amp;currency=USD&amp;page=2"'));assert.ok(html.includes('<th>'+(['brand','agency'].includes(role)?'Partner':'Business')+'</th>'));
 }
});

test('the actual page gives recoverable invalid-filter states and cannot switch another account role',async t=>{
 const f=await partnerFixture(t);seedOrder(f,f.application,f.connected.connection,{external:'PRIVATE_ORDER'});set(f,f.brand);
 for(const input of [{state:'paid'},{page:['1','2']},{q:'x'.repeat(101)},{currency:'usd'}]){const html=await htmlOf(views.OrdersView({portal:'brand',searchParams:Promise.resolve(input)}));assert.ok(html.includes('Check your order filters'));assert.ok(html.includes('Clear filters'));assert.ok(!html.includes('PRIVATE_ORDER'));}
 await assert.rejects(views.OrdersView({portal:'creator',searchParams:Promise.resolve({})}),e=>typeof e.location==='string');set(f,null);await assert.rejects(views.OrdersView({portal:'brand',searchParams:Promise.resolve({})}),e=>typeof e.location==='string');
});

test('history rendering honors saved display preferences, explains empty results and reads without external calls or writes',async t=>{
 const f=await partnerFixture(t);seedOrder(f,f.application,f.connected.connection,{external:'KABUL-TIME',created:'2026-10-24T10:00:00.000Z'});f.db.sqlite.prepare('INSERT INTO account_preferences VALUES (?,?,1,?)').run(f.brand.userId,JSON.stringify({...defaultPreferences,timeZone:'Asia/Kabul',dateFormat:'iso'}),new Date().toISOString());set(f,f.brand);
 let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,html=await htmlOf(views.OrdersView({portal:'brand',searchParams:Promise.resolve({})}));assert.ok(html.includes('2026-10-24 14:30:00'));assert.ok(html.includes('timestamps use Asia/Kabul'));assert.ok(!html.includes(f.connected.key));assert.ok(!html.includes('encrypted'));
 const empty=await htmlOf(views.OrdersView({portal:'brand',searchParams:Promise.resolve({q:'no-match',page:'9999'})}));assert.ok(empty.includes('No referred orders match these filters'));assert.ok(!empty.includes('Page 9999'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(fetches,0);
});

test('existing short order summaries link to complete history and dated reports inside the matching portal',async t=>{
 const f=await partnerFixture(t);const row={id:'fixture',external_id:'100',created_at:'2026-10-24T10:00:00.000Z',status:'completed',basis:10000,refunded_basis:0,currency:'USD',decimals:2,commission:1000,rate_bps:1000,commission_state:'accrued',partner_name:'Partner',business_name:'Business'};
 for(const portal of ['brand','affiliate','agency','creator']){const partner=['affiliate','creator'].includes(portal),html=renderToStaticMarkup(createElement(views.OrderTable,{orders:[row],partner,portal}));assert.ok(html.includes('Latest 100 received orders'));assert.ok(html.includes('href="'+ordersPath(portal)+'"'));const empty=renderToStaticMarkup(createElement(views.OrderTable,{orders:[],partner,portal}));assert.ok(empty.includes('href="'+ordersPath(portal)+'"'));if(portal==='agency')assert.ok(html.includes('href="/agency/reports"'));if(portal==='creator')assert.ok(html.includes('href="/creator/reports"'));}
});
