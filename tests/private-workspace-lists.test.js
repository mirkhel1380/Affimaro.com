import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {partnerFixture} from './support/partner-workspace.js';
import {audienceTools} from '../lib/audience-tools.ts';
import {service} from '../lib/service.ts';
import {accountSettings} from '../lib/account-settings.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'private-workspaces-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__privateListDb;delete globalThis.__privateListUser;});
const bundle=await build({stdin:{contents:"export {AgencyWorkspace} from './app/agency/page';export {CreatorWorkspace} from './app/creator/page';export {ContentForm} from './app/audience-forms';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'private-workspace-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__privateListDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__privateListUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const moduleFile=join(temp,'views.mjs');writeFileSync(moduleFile,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(moduleFile).href);
const kinds=[{role:'agency',key:'clients',method:'clientDirectory',table:'agency_clients',title:'Client'},{role:'creator',key:'content',method:'contentPlanner',table:'creator_content',title:'Content'}];
const setup=(db,user=null)=>{globalThis.__privateListDb=db;globalThis.__privateListUser=user;};
const render=(kind,query={},view=kind.key)=>(kind.role==='agency'?views.AgencyWorkspace(view,Promise.resolve(query)):views.CreatorWorkspace(view,Promise.resolve(query))).then(renderToStaticMarkup);
const writes=db=>db.sqlite.prepare('SELECT total_changes() n').get().n;
function seed(f,k,user=f[k.role],count=53,status=''){
 const ids=[];for(let i=0;i<count;i++){
  const id=crypto.randomUUID(),at=new Date(Date.UTC(2026,0,1)+i*1000).toISOString(),name=k.title+' fixture '+String(i).padStart(3,'0'),s=status||(k.role==='agency'?['prospect','active','on_hold','archived']:['idea','draft','published','archived'])[i%4];ids.push(id);
  if(k.role==='agency')f.db.sqlite.prepare('INSERT INTO agency_clients(id,user_id,name,website,contact,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,user.userId,name,'https://client'+i+'.example','Contact '+i,s,i===0?'Literal %_\\ marker':'Private notes '+i,at,at);
  else f.db.sqlite.prepare('INSERT INTO creator_content(id,user_id,title,platform,status,url,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,user.userId,name,i%2?'Instagram':'YouTube',s,'https://content.example/'+i,i===0?'Literal %_\\ marker':'Private notes '+i,at,at);
 }return ids;
}
const read=(f,k,input={})=>audienceTools(f.db,f[k.role])[k.method](input);

test('actual client and content views search older entries without rendering every saved edit form',async t=>{
 const f=await partnerFixture(t);for(const k of kinds){seed(f,k);setup(f.db,f[k.role]);const before=writes(f.db),html=await render(k,{q:k.title+' fixture 000'});assert.ok(html.includes(k.title+' fixture 000'));assert.ok(!html.includes(k.title+' fixture 052'));assert.ok(html.includes('1 matching record'));assert.ok(html.includes('Page 1 of 1'));assert.equal(writes(f.db),before);}
});

test('private readers page the full scoped directory using saved page size and literal search',async t=>{
 const f=await partnerFixture(t);for(const k of kinds){seed(f,k);const foreign=await f.add(k.role,'other-'+k.role);seed(f,k,foreign);const before=writes(f.db),last=await read(f,k,{page:10000});assert.equal(last.total,53);assert.equal(last.page,3);assert.equal(last.pages,3);assert.equal(last.pageSize,25);assert.equal(last.rows.length,3);assert.ok(last.rows.every(r=>r.user_id===f[k.role].userId));const literal=await read(f,k,{q:'%_\\'});assert.equal(literal.total,1);assert.equal(literal.rows[0][k.role==='agency'?'name':'title'],k.title+' fixture 000');assert.equal(writes(f.db),before);
  const settings=await accountSettings(f.db,f[k.role]).snapshot();await accountSettings(f.db,f[k.role]).savePreferences({revision:settings.revision,preferences:{...settings.preferences,pageSize:50}});const larger=await read(f,k,{page:2});assert.equal(larger.pageSize,50);assert.equal(larger.rows.length,3);assert.equal(larger.total,53);
 }
});

test('status and creator platform filters keep exact totals and a true empty result',async t=>{
 const f=await partnerFixture(t);for(const k of kinds){seed(f,k);for(const status of k.role==='agency'?['prospect','active','on_hold','archived']:['idea','draft','published','archived']){const data=await read(f,k,{status});assert.ok(data.rows.every(r=>r.status===status));assert.equal(data.total,status===(k.role==='agency'?'prospect':'idea')?14:13);}const empty=await read(f,k,{q:'Missing record',page:10000});assert.equal(empty.total,0);assert.equal(empty.page,1);assert.equal(empty.pages,0);assert.deepEqual(empty.rows,[]);}
 const data=await read(f,kinds[1],{platform:'Instagram',status:'draft'});assert.equal(data.total,13);assert.ok(data.rows.every(r=>r.platform==='Instagram'&&r.status==='draft'));
});

test('actual private pagers preserve filters and use clamped pages while agency statistics remain global',async t=>{
 const f=await partnerFixture(t);for(const k of kinds){seed(f,k,undefined,53,k.role==='agency'?'active':'draft');setup(f.db,f[k.role]);const html=await render(k,{status:k.role==='agency'?'active':'draft',q:k.title+' fixture',page:'10000'});assert.ok(html.includes('Page 3 of 3'));assert.ok(!html.includes('Page 10000'));assert.ok(html.includes('/'+k.role+'/'+k.key+'?status='+ (k.role==='agency'?'active':'draft')+'&amp;q='+k.title+'+fixture&amp;page=2'));assert.ok(!html.includes(k.title+' fixture 052'));assert.ok(html.includes(k.title+' fixture 000'));}
 setup(f.db,f.agency);const agency=await render(kinds[0],{q:'Client fixture 000'});assert.match(agency,/53 \/ 5/);assert.match(agency,/Clients marked active/);assert.match(agency,/>53</);
});

test('private list destinations survive login and reject ambiguous authenticated filters with a useful reset',async t=>{
 setup({prepare(){throw new Error('Anonymous lists touched private data');}});for(const k of kinds){const query={status:'archived',page:'3',q:'Private & saved',...(k.role==='creator'?{platform:'YouTube'}:{})};await assert.rejects(()=>render(k,query),e=>{const login=new URL(e.location,'https://affimaro.example');assert.equal(login.pathname,'/auth/'+k.role+'/login');assert.equal(new URL(login.searchParams.get('return_to'),'https://affimaro.example').pathname,'/'+k.role+'/'+k.key);assert.deepEqual(Object.fromEntries(new URL(login.searchParams.get('return_to'),'https://affimaro.example').searchParams),query);return true;});await assert.rejects(()=>render(k,{status:'archived',page:'2',q:['one','two'],token:'SECRET',return_to:'https://foreign.example'}),e=>{const target=new URL(e.location,'https://affimaro.example').searchParams.get('return_to');assert.deepEqual(Object.fromEntries(new URL(target,'https://affimaro.example').searchParams),{status:'archived',page:'2'});return true;});}
 const f=await partnerFixture(t);for(const k of kinds){setup(f.db,f[k.role]);const html=await render(k,{q:['one','two']});assert.ok(html.includes('Check your filters.'));assert.ok(html.includes('Reset filters'));}
});

test('private paged readers and views keep closed, wrong-role, owner and profile-review guards',async t=>{
 const f=await partnerFixture(t);for(const k of kinds){setup(f.db,f.brand);await assert.rejects(()=>render(k,{status:'archived'}),e=>e.location==='/workspace');await assert.rejects(audienceTools(f.db,f.brand)[k.method]({}),e=>e.status===403);setup(f.db,f.operator);await assert.rejects(()=>render(k,{}),e=>e.location==='/owner');f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f[k.role].userId);setup(f.db,f[k.role]);await assert.rejects(()=>render(k,{q:'saved'}),e=>new URL(e.location,'https://affimaro.example').pathname==='/application');f.db.sqlite.prepare("UPDATE platform_applications SET status='approved' WHERE user_id=?").run(f[k.role].userId);f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f[k.role].userId,new Date().toISOString());await assert.rejects(()=>render(k,{}),e=>e.location==='/account-closed');await assert.rejects(read(f,k),e=>e.status===403);}
});

test('editing the last matching row recovers the remaining page and keeps original-version edit safety',async t=>{
 const f=await partnerFixture(t);for(const k of kinds){seed(f,k,undefined,26,k.role==='agency'?'active':'draft');const tools=audienceTools(f.db,f[k.role]),last=await read(f,k,{status:k.role==='agency'?'active':'draft',page:2}),old=last.rows[0];assert.equal(last.rows.length,1);const fields=k.role==='agency'?{name:old.name,website:old.website,contact:old.contact,status:'archived',notes:old.notes,authorized:true}:{title:old.title,platform:old.platform,status:'archived',applicationId:old.application_id,url:old.url||'',notes:old.notes},method=k.role==='agency'?'saveClient':'saveContent';await tools[method]({...fields,id:old.id,updatedAt:old.updated_at});await assert.rejects(tools[method]({...fields,id:old.id,updatedAt:old.updated_at}),e=>e.status===409);const before=writes(f.db),remaining=await read(f,k,{status:k.role==='agency'?'active':'draft',page:2});assert.equal(remaining.page,1);assert.equal(remaining.total,25);assert.equal(remaining.rows.length,25);assert.equal(writes(f.db),before);}
 for(const table of ['orders','billing_checkouts','payout_requests','payment_connections'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});

test('invalid direct filters cannot broaden private directory queries',async t=>{
 const f=await partnerFixture(t);for(const k of kinds)for(const value of [{status:'approved'},{page:0},{page:10001},{page:'2junk'},{q:['one','two']},{q:'x'.repeat(121)},{user_id:f.brand.userId}])await assert.rejects(read(f,k,value),e=>e.status===400);await assert.rejects(read(f,kinds[1],{platform:'Made up network'}),e=>e.status===400);
});

test('an unavailable saved content partnership remains explicitly selected until the creator chooses to detach',async t=>{
 const f=await partnerFixture(t),tools=audienceTools(f.db,f.creator);await service(f.db,f.brand).review({applicationId:f.pending.id,status:'approved'});const entry=await tools.saveContent({title:'Partner tutorial',platform:'YouTube',status:'draft',applicationId:f.pending.id,url:'',notes:'Private plan'});await service(f.db,f.brand).review({applicationId:f.pending.id,status:'suspended'});const html=renderToStaticMarkup(createElement(views.ContentForm,{item:entry,partnerships:[]}));assert.ok(html.includes('value="'+f.pending.id+'" selected=""'));assert.ok(html.includes('Previous partnership — no longer approved'));assert.ok(html.includes('Choose another approved partnership or explicitly select No partnership attached'));
 const fields={id:entry.id,updatedAt:entry.updated_at,title:entry.title,platform:entry.platform,status:entry.status,applicationId:entry.application_id,url:'',notes:'Edited private plan'};await assert.rejects(tools.saveContent(fields),e=>e.status===403);const saved=await tools.saveContent({...fields,applicationId:null});assert.equal(saved.application_id,null);assert.equal(saved.notes,'Edited private plan');
});
