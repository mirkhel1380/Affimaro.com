import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {partnerFixture} from './support/partner-workspace.js';
import {audienceTools} from '../lib/audience-tools.ts';
import {service,AppError} from '../lib/service.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'audience-edit-conflicts-'));after(()=>{rmSync(temp,{recursive:true,force:true});for(const key of ['__audienceEditDb','__audienceEditUser','__audienceEditGate','__audienceEditHooks'])delete globalThis[key];});
const server=await build({stdin:{contents:"export {POST} from './app/api/audience/route';export {AppError} from './lib/service';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'audience-edit-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$|\/billing-runtime(?:\.ts)?$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('/billing-runtime')?"export async function requireBusinessSubscription(){return globalThis.__audienceEditGate();}":a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__audienceEditDb:undefined;}});":a.path==='next/navigation'?"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}":"export async function headers(){const u=globalThis.__audienceEditUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}",loader:'js'}));}}]});
const serverFile=join(temp,'server.mjs');writeFileSync(serverFile,server.outputFiles[0].contents);const api=await import(pathToFileURL(serverFile).href);
const browser=await build({stdin:{contents:"export {ClientForm,ContentForm} from './app/audience-forms';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',plugins:[{name:'audience-edit-hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function useState(initial){const h=globalThis.__audienceEditHooks,index=h.cursor++;if(!(index in h.states))h.states[index]=initial;return [h.states[index],next=>{h.states[index]=next;}];}",loader:'js'}));}}]});
const browserFile=join(temp,'forms.mjs');writeFileSync(browserFile,browser.outputFiles[0].contents);const forms=await import(pathToFileURL(browserFile).href);
const cases=[{role:'agency',method:'saveClient',table:'agency_clients',data:{name:'Client company',website:'https://client.example',contact:'Business contact',status:'prospect',notes:'Original private client notes',authorized:true}},{role:'creator',method:'saveContent',table:'creator_content',data:{title:'A tutorial idea',platform:'YouTube',status:'idea',applicationId:null,url:'',notes:'Original private planner notes'}}];
const fails=status=>e=>e instanceof AppError&&e.status===status;
const editing=(c,row,extra={})=>({...c.data,id:row.id,updatedAt:row.updated_at,...extra});
const row=(f,c,id)=>f.db.sqlite.prepare('SELECT * FROM '+c.table+' WHERE id=?').get(id);
const set=(f,user,gate=()=>{})=>{globalThis.__audienceEditDb=f.db;globalThis.__audienceEditUser=user;globalThis.__audienceEditGate=gate;};
const request=(body,origin='https://affimaro.example')=>new Request('https://affimaro.example/api/audience',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
function beforeUpdate(db,inject){let fired=false;function prepare(sql,values=[]){const statement=db.prepare(sql).bind(...values);return {bind(...args){return prepare(sql,args);},first:()=>statement.first(),all:()=>statement.all(),async run(){if(!fired&&/^UPDATE (agency_clients|creator_content) SET /.test(sql)){fired=true;inject();}return statement.run();}};}return {...db,prepare};}
const financialCounts=f=>Object.fromEntries(['orders','billing_accounts','billing_checkouts','payout_requests','payment_connections','audit_events'].map(table=>[table,f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n]));

for(const c of cases)test(c.role+' edits require the original record version and reject a stale second tab without overwriting the first',async t=>{
 const f=await partnerFixture(t),tools=audienceTools(f.db,f[c.role]),original=await tools[c.method](c.data),before=financialCounts(f);
 await assert.rejects(tools[c.method]({...c.data,id:original.id,notes:'Missing version'}),fails(409));
 const saved=await tools[c.method](editing(c,original,{notes:'First tab new private notes'}));assert.notEqual(saved.updated_at,original.updated_at);
 await assert.rejects(tools[c.method](editing(c,original,{notes:'Second tab stale notes'})),fails(409));assert.equal(row(f,c,original.id).notes,'First tab new private notes');
 const next=await tools[c.method](editing(c,saved,{notes:'Newly loaded edit'}));assert.equal(next.notes,'Newly loaded edit');assert.notEqual(next.updated_at,saved.updated_at);assert.deepEqual(financialCounts(f),before);
});

test('a successful edit changes its version even when the application clock has not moved',async t=>{
 const f=await partnerFixture(t),fixed=Date.now();t.mock.method(Date,'now',()=>fixed);
 for(const c of cases){const tools=audienceTools(f.db,f[c.role]),original=await tools[c.method](c.data);f.db.sqlite.prepare('UPDATE '+c.table+' SET updated_at=? WHERE id=?').run(new Date(fixed).toISOString(),original.id);original.updated_at=new Date(fixed).toISOString();const a=await tools[c.method](editing(c,original)),b=await tools[c.method](editing(c,a));assert.equal(Date.parse(a.updated_at),fixed+1);assert.equal(Date.parse(b.updated_at),fixed+2);await assert.rejects(tools[c.method](editing(c,original)),fails(409));}
});

test('atomic edit predicates reject writes interleaved after the version read',async t=>{
 const f=await partnerFixture(t);
 for(const c of cases){const tools=audienceTools(f.db,f[c.role]),original=await tools[c.method](c.data),newer='A different tab saved between read and write',wrapped=beforeUpdate(f.db,()=>f.db.sqlite.prepare('UPDATE '+c.table+' SET notes=?,updated_at=? WHERE id=?').run(newer,'2090-01-01T00:00:00.000Z',original.id));await assert.rejects(audienceTools(wrapped,f[c.role])[c.method](editing(c,original,{notes:'Should not overwrite'})),fails(409));assert.equal(row(f,c,original.id).notes,newer);}
});

test('closure, approval withdrawal and role changes at the write prevent edits in both private tools',async t=>{
 const f=await partnerFixture(t);
 for(const c of cases)for(const change of ['closure','approval','role']){const who=await f.add(c.role,c.role+'-'+change),tools=audienceTools(f.db,who),original=await tools[c.method](c.data),wrapped=beforeUpdate(f.db,()=>{if(change==='closure')f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(who.userId,new Date().toISOString());if(change==='approval')f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(who.userId);if(change==='role')f.db.sqlite.prepare("UPDATE account_portals SET portal='affiliate' WHERE user_id=?").run(who.userId);});await assert.rejects(audienceTools(wrapped,who)[c.method](editing(c,original,{notes:'Should not save after access changed'})),fails(409));assert.equal(row(f,c,original.id).notes,c.data.notes);}
});

test('creator edits recheck the assigned approved partnership at the write and can explicitly remove an old assignment',async t=>{
 const f=await partnerFixture(t);await service(f.db,f.brand).review({applicationId:f.pending.id,status:'approved'});const c=cases[1],tools=audienceTools(f.db,f.creator),original=await tools.saveContent({...c.data,applicationId:f.pending.id}),wrapped=beforeUpdate(f.db,()=>f.db.sqlite.prepare("UPDATE applications SET status='suspended' WHERE id=?").run(f.pending.id));await assert.rejects(audienceTools(wrapped,f.creator).saveContent(editing(c,original,{applicationId:f.pending.id,notes:'Should not save'})),fails(409));assert.equal(row(f,c,original.id).notes,c.data.notes);const removed=await tools.saveContent(editing(c,original,{applicationId:null,notes:'Continue as an unassigned private draft'}));assert.equal(removed.application_id,null);assert.equal(removed.notes,'Continue as an unassigned private draft');
});

test('private edit tokens never replace ownership, field, role or existing partnership checks',async t=>{
 const f=await partnerFixture(t);
 for(const c of cases){const tools=audienceTools(f.db,f[c.role]),original=await tools[c.method](c.data),foreign=await f.add(c.role,c.role+'-other'),before=financialCounts(f);await assert.rejects(audienceTools(f.db,foreign)[c.method](editing(c,original)),fails(404));for(const value of ['',42,'not-a-date','2026-01-01T00:00:00.000Z\n','x'.repeat(1000)])await assert.rejects(tools[c.method](editing(c,original,{updatedAt:value})),fails(400));await assert.rejects(tools[c.method](editing(c,original,{user_id:foreign.userId})),fails(400));await assert.rejects(audienceTools(f.db,f.affiliate)[c.method](editing(c,original)),fails(403));assert.deepEqual(financialCounts(f),before);assert.equal(row(f,c,original.id).notes,c.data.notes);}
 await assert.rejects(audienceTools(f.db,f.creator).saveContent({...cases[1].data,applicationId:f.application.id}),fails(403));
});

test('actual audience API keeps authentication, origin, paid-agency and no-store checks while returning conflicts',async t=>{
 const f=await partnerFixture(t);let checks=0;
 for(const c of cases){const record=await audienceTools(f.db,f[c.role])[c.method](c.data),body={action:c.method,data:editing(c,record,{notes:'API first save'})};set(f,null);assert.equal((await api.POST(request(body))).status,401);set(f,f[c.role],()=>{checks++;});assert.equal((await api.POST(request(body,'https://foreign.example'))).status,403);const saved=await api.POST(request(body));assert.equal(saved.status,200);assert.match(saved.headers.get('Cache-Control'),/private, no-store/);const retry=await api.POST(request({...body,data:{...body.data,notes:'Stale API save'}}));assert.equal(retry.status,409);assert.match((await retry.json()).error,/Reload the latest record/);assert.equal(row(f,c,record.id).notes,'API first save');}
 assert.equal(checks,2);const agencyRecord=(await audienceTools(f.db,f.agency).clients())[0];set(f,f.agency,()=>{throw new api.AppError(402,'An active subscription is required.');});assert.equal((await api.POST(request({action:'saveClient',data:editing(cases[0],agencyRecord)}))).status,402);
});

function find(node,check){if(!node||typeof node!=='object')return null;if(typeof node.type==='function')return find(node.type(node.props),check);if(check(node))return node;for(const child of [node.props?.children].flat(Infinity)){const match=find(child,check);if(match)return match;}return null;}
const textOf=node=>node==null||typeof node==='boolean'?'':typeof node==='object'?typeof node.type==='function'?textOf(node.type(node.props)):[node.props?.children].flat(Infinity).map(textOf).join(''):String(node);
test('actual client and content forms send the loaded version, preserve conflict drafts and offer explicit reload',async t=>{
 const f=await partnerFixture(t),requests=[],reloads=[];const savedWindow=globalThis.window,savedFormData=globalThis.FormData;t.after(()=>{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;globalThis.FormData=savedFormData;});globalThis.window={location:{reload:()=>reloads.push(true),assign:()=>assert.fail('A failed private edit must not navigate.')}};globalThis.FormData=class{constructor(values){this.values=values;}get(key){return this.values[key]??null;}};
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,'/api/audience');assert.equal(init.credentials,'same-origin');const body=JSON.parse(init.body);requests.push(body);return api.POST(new Request('https://affimaro.example'+url,{...init,headers:{...init.headers,Origin:'https://affimaro.example'}}));});
 for(const c of cases){const tools=audienceTools(f.db,f[c.role]),original=await tools[c.method](c.data);await tools[c.method](editing(c,original,{notes:'Other tab saved'}));set(f,f[c.role]);const h={cursor:0,states:[]};globalThis.__audienceEditHooks=h;const props=c.role==='agency'?{client:original}:{item:original,partnerships:[]},render=()=>{h.cursor=0;return forms[c.role==='agency'?'ClientForm':'ContentForm'](props);};let tree=render();const draft={...c.data,notes:'Keep my unsaved draft',...(c.role==='agency'?{authorized:'on'}:{applicationId:''})};await tree.props.onSubmit({preventDefault(){},currentTarget:draft});tree=render();assert.equal(requests.at(-1).data.updatedAt,original.updated_at);assert.equal(requests.at(-1).data.notes,'Keep my unsaved draft');assert.match(textOf(tree),/Reload the latest record/);assert.ok(find(tree,n=>n.type==='button'&&textOf(n)==='Reload latest record'));assert.equal(draft.notes,'Keep my unsaved draft');assert.equal(reloads.length,0);assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);assert.equal(row(f,c,original.id).notes,'Other tab saved');}
});

test('new-entry forms keep actual capacity errors without offering to reload a record that was never created',async t=>{
 const f=await partnerFixture(t),requests=[],reloads=[],savedWindow=globalThis.window,savedFormData=globalThis.FormData;
 t.after(()=>{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;globalThis.FormData=savedFormData;});
 globalThis.window={location:{reload:()=>reloads.push(true),assign:()=>assert.fail('A full private tool must not navigate.')}};
 globalThis.FormData=class{constructor(values){this.values=values;}get(key){return this.values[key]??null;}};
 t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push(JSON.parse(init.body));return api.POST(new Request('https://affimaro.example'+url,{...init,headers:{...init.headers,Origin:'https://affimaro.example'}}));});
 for(const c of cases){
  const tools=audienceTools(f.db,f[c.role]),limit=c.role==='agency'?5:250;
  for(let i=0;i<limit;i++)await tools[c.method](c.data);
  set(f,f[c.role]);const hooks={cursor:0,states:[]};globalThis.__audienceEditHooks=hooks;
  const render=()=>{hooks.cursor=0;return c.role==='agency'?forms.ClientForm({}):forms.ContentForm({partnerships:[]});};
  let tree=render();await tree.props.onSubmit({preventDefault(){},currentTarget:{...c.data,...(c.role==='agency'?{authorized:'on'}:{applicationId:''})}});tree=render();
  assert.match(textOf(tree),c.role==='agency'?/client-directory package limit has been reached/:/content planner is full/);
  assert.equal(find(tree,n=>n.type==='button'&&textOf(n)==='Reload latest record'),null);
  assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
  assert.equal('id' in requests.at(-1).data,false);assert.equal('updatedAt' in requests.at(-1).data,false);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+c.table+' WHERE user_id=?').get(f[c.role].userId).n,limit);
 }
 assert.equal(reloads.length,0);
});
