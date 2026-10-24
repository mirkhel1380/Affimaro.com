import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {seedOrder} from './support/order-history.js';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'owner-orders-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__ownerOrdersDb;delete globalThis.__ownerOrdersUser;});
const bundle=await build({stdin:{contents:"export {default as Overview} from './app/owner/page';export {default as Records} from './app/owner/data/page';export {ownerMoney} from './app/owner/records';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'isolated-owner-order-views',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__ownerOrdersDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__ownerOrdersUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'orders.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const set=(f,user=f.operator)=>{globalThis.__ownerOrdersDb=f.db;globalThis.__ownerOrdersUser=user;};
const htmlOf=async element=>renderToStaticMarkup(await element).replaceAll(/<!--.*?-->/g,'').replaceAll('\u00a0',' ');

test('actual owner overview and order page show held orders, explicit money labels and the exact review destination without writes',async t=>{
 const f=await partnerFixture(t);seedOrder(f);f.db.sqlite.prepare('INSERT INTO shopify_pending(store_id,order_id,reason,updated_at) VALUES (?,?,?,?)').run(f.connected.connection.id,'gid://shopify/Order/1234','PRIVATE_HOLD_REASON',new Date().toISOString());set(f);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 const overview=await htmlOf(views.Overview());for(const text of ['Eligible merchandise','Recorded merchandise after refunds','Estimated commission','Needs review','2 decimal places','it is not a payment'])assert.ok(overview.includes(text),text);assert.ok(overview.includes('href="/owner/data?table=orders&amp;review=required"'));assert.ok(!overview.includes('table=orders&amp;q=required'));assert.ok(!overview.includes('Recorded commission'));
 const page=await htmlOf(views.Records({searchParams:Promise.resolve({table:'orders',review:'required'})}));assert.ok(page.includes('name="review"'));assert.ok(page.includes('value="required" selected=""'));assert.ok(page.includes('USD 0.00'));assert.ok(page.includes('Review'));assert.ok(!page.includes('PRIVATE_HOLD_REASON'));assert.ok(!page.includes(f.connected.key));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
});

test('review pagination and search stay together and malformed filters render a recoverable owner page',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<60;i++)seedOrder(f,f.application,f.connected.connection,{external:'SALE-'+i,state:'review',commission:0});set(f);const page=await htmlOf(views.Records({searchParams:Promise.resolve({table:'orders',review:'required',q:'sale',page:'2'})}));assert.ok(page.includes('51–60 of 60 records'));assert.ok(page.includes('href="/owner/data?table=orders&amp;q=sale&amp;review=required&amp;page=1"'));assert.ok(page.includes('name="review"'));assert.ok(page.includes('value="sale"'));
 for(const query of [{review:'bad'},{review:['clear','required']},{q:['one','two']}]){const html=await htmlOf(views.Records({searchParams:Promise.resolve({table:'orders',...query})}));assert.ok(html.includes('Check your record filters'));assert.ok(html.includes('Reset filters'));assert.ok(!html.includes('SALE-'));}
});

test('owner money formatting keeps exact minor-unit remainders including large values and six decimal places',()=>{
 const clean=value=>value.replaceAll('\u00a0',' ');assert.equal(clean(views.ownerMoney(Number.MAX_SAFE_INTEGER,'USD',2)),'USD 90,071,992,547,409.91');assert.equal(clean(views.ownerMoney(Number.MAX_SAFE_INTEGER,'USD',6)),'USD 9,007,199,254.740991');assert.equal(clean(views.ownerMoney(-1,'USD',6)),'-USD 0.000001');assert.equal(clean(views.ownerMoney(12345,'JPY',0)),'JPY 12,345');assert.throws(()=>views.ownerMoney(Number.MAX_SAFE_INTEGER+1,'USD',2),RangeError);
});

test('unsafe legacy aggregate totals show a truthful fallback with access to individual sales',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<2;i++)seedOrder(f,f.application,f.connected.connection,{external:'legacy-'+i,basis:Number.MAX_SAFE_INTEGER,commission:0});set(f);const html=await htmlOf(views.Overview());assert.ok(html.includes('combined monetary totals exceed the exact display limit'));assert.ok(html.includes('href="/owner/data?table=orders"'));assert.ok(!html.includes('Estimated commission'));
});

test('customer roles, anonymous visitors and revoked owner grants cannot render global sales or overview',async t=>{
 const f=await partnerFixture(t);for(const user of [f.brand,f.affiliate,f.creator,f.agency,null]){set(f,user);for(const render of [()=>views.Overview(),()=>views.Records({searchParams:Promise.resolve({table:'orders',review:'required'})})])await assert.rejects(render(),e=>e.status===403||typeof e.location==='string');}
 f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.operator.userId);set(f);await assert.rejects(views.Overview(),e=>e.status===403||typeof e.location==='string');
});
