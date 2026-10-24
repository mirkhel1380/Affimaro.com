import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {service} from '../lib/service.ts';
import {clickExport} from '../lib/link-clicks.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'click-export-api-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__clickDb;delete globalThis.__clickUser;});
const bundle=await build({stdin:{contents:"export {GET} from './app/api/clicks/export/route';export {ClicksView} from './app/clicks-view';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'isolated-click-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__clickDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__clickUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'clicks.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const api=await import(pathToFileURL(file).href);
const setup=(f,user)=>{globalThis.__clickDb=f.db;globalThis.__clickUser=user;};
function seed(f,id,source='newsletter',country='US',device='Mobile'){f.db.sqlite.prepare('INSERT INTO link_clicks VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,source,'email','referrer.example',device,country,new Date().toISOString());}
const request=query=>new Request('https://affimaro.example/api/clicks/export'+(query?'?'+query:''));

test('the actual CSV endpoint serves each role its own filtered rows with private download headers',async t=>{
 const f=await partnerFixture(t),agencyProgram=(await service(f.db,f.agency).businessDashboard()).program,agencyApplication=await service(f.db,f.creator).apply({programId:agencyProgram.id});await service(f.db,f.agency).review({applicationId:agencyApplication.id,status:'approved'});seed(f,f.application.id,'brand-campaign');seed(f,agencyApplication.id,'agency-campaign','GB');
 for(const [role,source,country,other] of [['brand','brand-campaign','US','agency-campaign'],['affiliate','brand-campaign','US','agency-campaign'],['agency','agency-campaign','GB','brand-campaign'],['creator','agency-campaign','GB','brand-campaign']]){
  setup(f,f[role]);const response=await api.GET(request('days=7&q='+source+'&country='+country+'&device=Mobile'));assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/text\/csv/);assert.match(response.headers.get('Content-Disposition'),/attachment; filename="affimaro-clicks-7d.csv"/);assert.match(response.headers.get('Cache-Control'),/private, no-store/);assert.equal(response.headers.get('Vary'),'Cookie');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');const csv=await response.text();assert.ok(csv.includes(source));assert.ok(!csv.includes(other));assert.equal(csv.includes('"Partner"'),['brand','agency'].includes(role));
 }
});

test('the actual CSV endpoint denies anonymous, unapproved, foreign selections and forged query authority',async t=>{
 const f=await partnerFixture(t);seed(f,f.application.id,'DO_NOT_LEAK');setup(f,null);let response=await api.GET(request());assert.equal(response.status,401);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.ok(!(await response.text()).includes('DO_NOT_LEAK'));
 setup(f,{userId:'not-approved',email:'unapproved@example.com'});assert.equal((await api.GET(request())).status,403);
 setup(f,f.creator);response=await api.GET(request('application='+f.application.id));assert.equal(response.status,403);assert.ok(!(await response.text()).includes('DO_NOT_LEAK'));
 setup(f,f.affiliate);for(const q of ['portal=brand','userId=brand','days=7&days=90','limit=999999','device=Phone'])assert.equal((await api.GET(request(q))).status,400);
});

test('four real click pages expose scoped filters, preserve them through pagination and show the correct identity column',async t=>{
 const f=await partnerFixture(t),program=(await service(f.db,f.agency).businessDashboard()).program,agencyApplication=await service(f.db,f.creator).apply({programId:program.id});await service(f.db,f.agency).review({applicationId:agencyApplication.id,status:'approved'});
 for(let i=0;i<30;i++){seed(f,f.application.id);seed(f,agencyApplication.id);}
 for(const role of ['brand','affiliate','agency','creator']){
  setup(f,f[role]);const html=renderToStaticMarkup(await api.ClicksView({portal:role,searchParams:Promise.resolve({q:'newsletter',country:'US',device:'Mobile',days:'7',page:'2'})}));
  for(const text of ['Download clicks CSV','Source, medium or referrer','Country','Device','Clicks over time','Clicks by source','Page 2 of 2'])assert.ok(html.includes(text),role+': '+text);
  assert.ok(html.includes('<th>' + (['brand','agency'].includes(role)?'Partner':'Brand')+'</th>'));assert.ok(html.includes('q=newsletter&amp;country=US&amp;device=Mobile'));assert.ok(html.includes('name="q"'));assert.ok(html.includes('value="newsletter"'));assert.ok(!html.includes('user_id'));
 }
});

test('invalid or foreign page filters render a recoverable state without exporting or disclosing click rows',async t=>{
 const f=await partnerFixture(t);seed(f,f.application.id,'PRIVATE_SOURCE');setup(f,f.creator);
 for(const params of [{application:f.application.id},{country:'bad'},{days:['7','90']}]){const html=renderToStaticMarkup(await api.ClicksView({portal:'creator',searchParams:Promise.resolve(params)}));assert.ok(html.includes('Check your report filters'));assert.ok(html.includes('Clear filters'));assert.ok(!html.includes('PRIVATE_SOURCE'));assert.ok(!html.includes('Download clicks CSV'));}
 setup(f,f.brand);await assert.rejects(api.ClicksView({portal:'creator',searchParams:Promise.resolve({})}),e=>typeof e.location==='string');
});

test('the actual export enforces its limit and leaves reports, financial records and click counts unchanged',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<5001;i++)seed(f,f.application.id);setup(f,f.affiliate);const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,response=await api.GET(request());assert.equal(response.status,409);assert.match((await response.json()).error,/5,000/);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
 const html=renderToStaticMarkup(await api.ClicksView({portal:'affiliate',searchParams:Promise.resolve({})}));assert.ok(html.includes('Narrow your filters to enable the download'));assert.match(html,/<button[^>]*disabled=""[^>]*>Download clicks CSV/);
 for(const table of ['orders','payout_requests','billing_checkouts'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});

test('a click export uses only read queries and never loads bank or provider tables',async t=>{
 const f=await partnerFixture(t);seed(f,f.application.id);const reads=[],db={prepare(query){assert.match(query.trim(),/^SELECT\b/i);assert.ok(!/bank_profiles|payment_connections|encrypted_|\borders\b|payout_requests|stripe_/i.test(query));reads.push(query);return f.db.prepare(query);}};const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,result=await clickExport(db,f.affiliate);assert.equal(result.rowCount,1);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.ok(reads.length>0);
});
