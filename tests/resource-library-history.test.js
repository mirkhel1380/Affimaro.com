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

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'resource-history-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__resourceHistoryDb;delete globalThis.__resourceHistoryUser;});
const bundle=await build({stdin:{contents:"export {ProgramResourcesView} from './app/program-resources-view';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'resource-history-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__resourceHistoryDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__resourceHistoryUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'views.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const {ProgramResourcesView}=await import(pathToFileURL(file).href);
const path=role=>role==='agency'?'/agency/resources':'/workspace/resources';
const setup=(db,user=null)=>{globalThis.__resourceHistoryDb=db;globalThis.__resourceHistoryUser=user;};
const render=(portal,query={})=>ProgramResourcesView({portal,searchParams:Promise.resolve(query)}).then(renderToStaticMarkup);
const writes=db=>db.sqlite.prepare('SELECT total_changes() n').get().n;
async function seed(f,role,tab,count=230){
 const program=(await service(f.db,f[role]).businessDashboard()).program,table=tab==='assets'?'program_resources':'program_coupons',ids=[];
 const sql=tab==='assets'?"INSERT INTO program_resources(id,program_id,kind,title,description,body,status,created_at,updated_at) VALUES (?,?,'text',?,'Approved resource','Promotional copy for an approved offer.',?,?,?)":"INSERT INTO program_coupons(id,program_id,code,title,terms,status,created_at,updated_at) VALUES (?,?,?,?,'Store coupon terms and exclusions.',?,?,?)";
 const insert=f.db.sqlite.prepare(sql);
 for(let i=0;i<count;i++){const id=crypto.randomUUID(),title='Historical material '+String(i).padStart(3,'0'),status=i<225?'archived':'active',at=new Date(Date.UTC(2025,0,1)+i*1000).toISOString();ids.push(id);insert.run(...(tab==='assets'?[id,program.id,title,status,at,at]:[id,program.id,'HISTORY'+i,title,status,at,at]));}
 return ids;
}

test('brand and agency can find archived resources and coupon codes beyond the former 200-row cutoff in the actual view',async t=>{
 const f=await partnerFixture(t);
 for(const role of ['brand','agency'])for(const tab of ['assets','coupons']){
  await seed(f,role,tab);setup(f.db,f[role]);const before=writes(f.db),html=await render(role,{tab,status:'archived',q:'Historical material 000'});
  assert.ok(html.includes('Historical material 000'));assert.ok(html.includes('1 resource matching your filters.'));assert.ok(html.includes('Page 1 of 1'));assert.ok(!html.includes('Historical material 229'));assert.equal(writes(f.db),before);
 }
});

test('resource library counts and pages remain scoped to the represented program, tab, status and literal search',async t=>{
 const f=await partnerFixture(t);for(const role of ['brand','agency','foreignBrand'])for(const tab of ['assets','coupons'])await seed(f,role,tab);
 for(const role of ['brand','agency'])for(const tab of ['assets','coupons']){
  const api=partnerResources(f.db,f[role]),before=writes(f.db),last=await api.library({tab,status:'archived',q:'Historical material',page:10000});
  assert.equal(last.total,225);assert.equal(last.page,19);assert.equal(last.pages,19);const rows=tab==='assets'?last.assets:last.coupons;assert.equal(rows.length,9);assert.ok(rows.some(r=>r.title==='Historical material 000'));assert.ok(rows.every(r=>r.status==='archived'&&r.program_id===last.program.id));
  const active=await api.library({tab,status:'active'});assert.equal(active.total,5);assert.equal((tab==='assets'?active.assets:active.coupons).length,5);
  const empty=await api.library({tab,q:'Historical%',page:10000});assert.equal(empty.total,0);assert.equal(empty.page,1);assert.equal(empty.pages,0);assert.deepEqual(empty.assets,[]);assert.deepEqual(empty.coupons,[]);assert.equal(writes(f.db),before);
 }
});

test('actual editor, cancel, archive and page links retain the filtered library and clamped page',async t=>{
 const f=await partnerFixture(t);
 for(const role of ['brand','agency'])for(const tab of ['assets','coupons']){
  await seed(f,role,tab);const api=partnerResources(f.db,f[role]),current=await api.library({tab,status:'active',q:'Historical material'}),record=(tab==='assets'?current.assets:current.coupons)[0];setup(f.db,f[role]);
  const html=await render(role,{tab,status:'archived',q:'Historical material',page:'10000'});assert.ok(html.includes('Page 19 of 19'));assert.ok(html.includes(path(role)+'?tab='+tab+'&amp;status=archived&amp;q=Historical+material&amp;page=18'));assert.ok(!html.includes('Page 10000'));
  const editor=await render(role,{tab,status:'active',q:'Historical material',page:'10000',edit:record.id});assert.ok(editor.includes('Cancel editing'));assert.ok(editor.includes(path(role)+'?tab='+tab+'&amp;status=active&amp;q=Historical+material'));assert.ok(editor.includes(tab==='assets'?'Save asset changes':'Loading date fields'));
  const tree=await ProgramResourcesView({portal:role,searchParams:Promise.resolve({tab,status:'active',q:'Historical material',page:'10000',edit:record.id})}),elements=[];const visit=node=>{if(!node||typeof node!=='object')return;elements.push(node);for(const child of [node.props?.children].flat(Infinity))visit(child);};visit(tree);const expected=path(role)+'?tab='+tab+'&status=active&q=Historical+material';assert.equal(elements.find(n=>n.props?.kind===(tab==='assets'?'asset':'coupon')&&n.props?.initial)?.props.successPath,expected);assert.ok(elements.filter(n=>n.props?.action==='archive').every(n=>n.props.successPath===expected));
  const before=writes(f.db);await assert.rejects(api.editable({id:(tab==='assets'?(await api.library({tab,status:'archived'})).assets:(await api.library({tab,status:'archived'})).coupons)[0].id,type:tab==='assets'?'asset':'coupon'}),e=>e.status===404);assert.equal(writes(f.db),before);
 }
});

test('resource selections survive sign-in without ambiguous or unrelated query values',async()=>{
 setup({prepare(){throw new Error('Anonymous resource view touched private data');}});
 for(const role of ['brand','agency']){
  const query={tab:'coupons',edit:'11111111-1111-4111-8111-111111111111',status:'active',page:'2',q:'Offer & Co'};
  await assert.rejects(()=>render(role,query),e=>{const u=new URL(e.location,'https://affimaro.example');assert.equal(u.pathname,'/auth/'+role+'/login');const target=new URL(u.searchParams.get('return_to'),'https://affimaro.example');assert.equal(target.pathname,path(role));assert.deepEqual(Object.fromEntries(target.searchParams),query);return true;});
  await assert.rejects(()=>render(role,{tab:'assets',q:['ambiguous','search'],edit:['one','two'],status:'archived',return_to:'https://foreign.example',token:'PRIVATE_TOKEN'}),e=>{const target=new URL(e.location,'https://affimaro.example').searchParams.get('return_to');assert.deepEqual(Object.fromEntries(new URL(target,'https://affimaro.example').searchParams),{tab:'assets',status:'archived'});return true;});
 }
});

test('filtered history cannot bypass business-role, owner, pending-profile or closed-account guards',async t=>{
 const f=await partnerFixture(t),query={tab:'assets',status:'archived',q:'Historical'};
 for(const role of ['affiliate','creator']){setup(f.db,f[role]);await assert.rejects(()=>render('brand',query),e=>e.location===(role==='creator'?'/creator':'/partner'));await assert.rejects(partnerResources(f.db,f[role]).library(query),e=>e.status===403);}
 setup(f.db,f.operator);await assert.rejects(()=>render('brand',query),e=>e.location==='/owner');
 f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.brand.userId);setup(f.db,f.brand);await assert.rejects(()=>render('brand',query),e=>new URL(e.location,'https://affimaro.example').pathname==='/application');
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.agency.userId,new Date().toISOString());setup(f.db,f.agency);await assert.rejects(()=>render('agency',query),e=>e.location==='/account-closed');
});

test('resource library rejects invalid direct filters instead of broadening a query',async t=>{
 const f=await partnerFixture(t),api=partnerResources(f.db,f.brand);
 for(const input of [{tab:'foreign'},{status:'verified'},{q:'x'.repeat(121)},{page:0},{page:10001},{q:['a','b']},{ownerId:f.foreignBrand.userId}])await assert.rejects(api.library(input),e=>e.status===400);
});


test('archiving the last published item on a page returns the filtered library to its remaining page',async t=>{
 const f=await partnerFixture(t);for(const role of ['brand','agency'])for(const tab of ['assets','coupons']){
  const api=partnerResources(f.db,f[role]);for(let i=0;i<13;i++)await api[tab==='assets'?'addAsset':'addCoupon'](tab==='assets'?{kind:'text',title:'Current campaign '+i,body:'Approved promotional campaign copy.'}:{code:'CURRENT'+i,title:'Current campaign '+i,terms:'Store restrictions and exclusions apply.'});
  const last=await api.library({tab,status:'active',q:'Current campaign',page:2}),record=(tab==='assets'?last.assets:last.coupons)[0];assert.equal(last.total,13);assert.equal((tab==='assets'?last.assets:last.coupons).length,1);await api.archive({id:record.id,revision:record.revision,type:tab==='assets'?'asset':'coupon'});
  const before=writes(f.db),remaining=await api.library({tab,status:'active',q:'Current campaign',page:2});assert.equal(remaining.page,1);assert.equal(remaining.total,12);assert.equal(remaining.pages,1);assert.equal((tab==='assets'?remaining.assets:remaining.coupons).length,12);assert.equal(writes(f.db),before);
  const archived=await api.library({tab,status:'archived',q:'Current campaign'});assert.equal(archived.total,1);assert.equal((tab==='assets'?archived.assets:archived.coupons)[0].id,record.id);setup(f.db,f[role]);const html=await render(role,{tab,status:'archived',q:'Current campaign'});assert.ok(!html.includes('>Edit asset</a>'));assert.ok(!html.includes('>Edit coupon</a>'));assert.ok(!html.includes('>Archive asset</button>'));assert.ok(!html.includes('>Archive coupon</button>'));
 }
 for(const table of ['orders','billing_checkouts','payment_connections','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});
