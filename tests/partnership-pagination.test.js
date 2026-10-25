import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture,identity} from './support/partner-workspace.js';
import {service} from '../lib/service.ts';
import {discovery} from '../lib/discovery.ts';
import {relationshipWorkspace,relationshipsPath} from '../lib/relationships.ts';
import {businessPortal} from '../lib/portal-policy.ts';
const roles=['brand','agency','affiliate','creator'],phrase='Pagination fixture',note='Please review this represented program and decide whether to apply.';
async function seed(f,role,kind){
 const actor=f[role],business=businessPortal(role),ownProgram=business?(await service(f.db,actor).businessDashboard()).program:null,people=[];
 for(let i=0;i<13;i++){
  const other=await f.add(business?'affiliate':'brand',role+'-'+kind+'-'+i),name=phrase+' '+String(i).padStart(2,'0');people.push(other);
  if(business)f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run(name,other.userId);
  else f.db.sqlite.prepare('UPDATE workspaces SET name=? WHERE owner_id=?').run(name,other.userId);
  if(kind==='discovery'){
   f.db.sqlite.prepare("UPDATE platform_applications SET profile_json=json_set(profile_json,'$.name',?) WHERE user_id=?").run(name,other.userId);
   if(!business)f.db.sqlite.prepare("UPDATE platform_applications SET profile_json=json_set(profile_json,'$.businessName',?) WHERE user_id=?").run(name,other.userId);
   await discovery(f.db,actor).save({targetId:other.userId,saved:true});
  }else if(kind==='invitations')await discovery(f.db,business?actor:other).invite({targetId:business?other.userId:actor.userId,note});
  else{
   const program=ownProgram||(await service(f.db,other).businessDashboard()).program;
   await service(f.db,business?other:actor).apply({programId:program.id});
  }
 }
 return people;
}
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'partnership-pages-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__partnershipPagesDb;delete globalThis.__partnershipPagesUser;});
const output=await build({stdin:{contents:"export {RelationshipsView} from './app/relationships-view';export {DiscoveryView} from './app/discover/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'partnership-page-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__partnershipPagesDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__partnershipPagesUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const file=join(temp,'views.mjs');writeFileSync(file,output.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const countWrites=db=>db.sqlite.prepare('SELECT total_changes() n').get().n;

test('four-role pending lists recover the last available page after a decision without broadening filters',async t=>{
 for(const role of roles){
  const f=await partnerFixture(t);await seed(f,role,'applications');const actor=f[role],query={tab:'pending',q:phrase,page:2},before=countWrites(f.db),last=await relationshipWorkspace(f.db,actor,query);
  assert.equal(last.total,13);assert.equal(last.rows.length,1);const far=await relationshipWorkspace(f.db,actor,{...query,page:10000});assert.equal(far.page,2);assert.equal(far.rows[0].id,last.rows[0].id);assert.equal(countWrites(f.db),before);
  const row=last.rows[0],owner=f.db.sqlite.prepare('SELECT w.owner_id FROM programs p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?').get(row.program_id).owner_id;
  await service(f.db,identity(owner)).review({applicationId:row.id,status:'rejected'});
  const stable=countWrites(f.db),result=await relationshipWorkspace(f.db,actor,query);assert.equal(result.page,1);assert.equal(result.pages,1);assert.equal(result.total,12);assert.equal(result.rows.length,12);assert.equal(result.filters.q,phrase);assert.equal(result.filters.tab,'pending');assert.equal(result.filters.page,1);assert.ok(result.rows.every(r=>r.status==='pending'&&r.name.startsWith(phrase)));assert.equal(countWrites(f.db),stable);
 }
});

test('four-role invitation inboxes recover after the last pending invitation on a page is declined',async t=>{
 for(const role of roles){
  const f=await partnerFixture(t);await seed(f,role,'invitations');const actor=f[role],query={tab:'invitations',invitationStatus:'pending',q:phrase,page:2},last=await relationshipWorkspace(f.db,actor,query);assert.equal(last.total,13);assert.equal(last.invitations.length,1);
  const far=await relationshipWorkspace(f.db,actor,{...query,page:10000});assert.equal(far.page,2);assert.equal(far.invitations[0].id,last.invitations[0].id);
  const item=last.invitations[0];await discovery(f.db,identity(item.recipient_id)).respond({id:item.id,decision:'declined'});
  const stable=countWrites(f.db),result=await relationshipWorkspace(f.db,actor,query);assert.equal(result.page,1);assert.equal(result.pages,1);assert.equal(result.total,12);assert.equal(result.invitations.length,12);assert.equal(result.filters.invitationStatus,'pending');assert.equal(result.filters.q,phrase);assert.ok(result.invitations.every(r=>r.status==='pending'));assert.equal(countWrites(f.db),stable);
  const history=await relationshipWorkspace(f.db,actor,{tab:'invitations',invitationStatus:'declined',q:phrase,page:10000});assert.equal(history.page,1);assert.equal(history.invitations[0].id,item.id);
 }
});

test('every role can still browse its remaining saved profiles after a listed member opts out',async t=>{
 for(const role of roles){
  const f=await partnerFixture(t);await seed(f,role,'discovery');const api=discovery(f.db,f[role]),query={saved:true,q:phrase,sort:'name',page:2},last=await api.browse(query);assert.equal(last.total,13);assert.equal(last.profiles.length,1);
  const stable=countWrites(f.db),far=await api.browse({...query,page:10000});assert.equal(far.page,2);assert.equal(far.profiles[0].user_id,last.profiles[0].user_id);assert.equal(countWrites(f.db),stable);
  await discovery(f.db,identity(last.profiles[0].user_id)).setListing({listed:false});
  const result=await api.browse(query);assert.equal(result.page,1);assert.equal(result.pages,1);assert.equal(result.total,12);assert.equal(result.profiles.length,12);assert.ok(result.profiles.every(p=>p.saved&&p.name.startsWith(phrase)));
  const empty=await api.browse({...query,q:'no matching profile',page:10000});assert.equal(empty.page,1);assert.equal(empty.pages,0);assert.equal(empty.total,0);assert.deepEqual(empty.profiles,[]);
 }
});

test('actual partnership and directory views render the effective page and matching previous link for all four portals',async t=>{
 for(const role of roles){
  const f=await partnerFixture(t);await seed(f,role,'applications');await seed(f,role,'discovery');globalThis.__partnershipPagesDb=f.db;globalThis.__partnershipPagesUser=f[role];
  const stable=countWrites(f.db),relationship=renderToStaticMarkup(await views.RelationshipsView({portal:role,searchParams:Promise.resolve({tab:'pending',q:phrase,page:'10000'})}));assert.ok(relationship.includes('Page 2 of 2'));assert.ok(relationship.includes(relationshipsPath(role)+'?tab=pending&amp;q=Pagination+fixture&amp;page=1'));assert.ok(!relationship.includes('Page 10000'));
  const directory=renderToStaticMarkup(await views.DiscoveryView({expected:role,searchParams:Promise.resolve({tab:'saved',q:phrase,sort:'name',page:'10000'})}));assert.ok(directory.includes('Page 2 of 2'));assert.ok(directory.includes('q=Pagination+fixture&amp;sort=name&amp;page=1'));assert.ok(!directory.includes('No matching profiles yet'));assert.ok(!directory.includes('Page 10000'));assert.equal(countWrites(f.db),stable);
 }
});
