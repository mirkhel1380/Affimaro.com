import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {queueFixture,seedApplicant} from './support/admission-queue.js';
import {submitContact} from '../lib/contact-inbox.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'owner-contact-view-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__contactViewDb;delete globalThis.__contactViewUser;});
const bundle=await build({stdin:{contents:"export {default as Inbox} from './app/owner/contact/page';export {POST} from './app/api/admin/contact/route';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'contact-view-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__contactViewDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__contactViewUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const file=join(temp,'views.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const view=await import(pathToFileURL(file).href);
const set=(db,user=null)=>{globalThis.__contactViewDb=db;globalThis.__contactViewUser=user;};
const render=async(query={})=>renderToStaticMarkup(await view.Inbox({searchParams:Promise.resolve(query)}));
const at=Date.parse('2026-10-25T00:00:00.000Z'),body={name:'Contact visitor',email:'visitor@example.com',topic:'account',message:'Please help with my account application and review status.'};
const request=(data,origin='https://admin.affimaro.example',type='application/json')=>new Request('https://admin.affimaro.example/api/admin/contact',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:JSON.stringify(data)});

test('the contact inbox uses its bounded selected-message owner sign-in destination without reading public data',async()=>{
 set({prepare(){assert.fail('Anonymous view touched inbox data');}});const query={message:crypto.randomUUID(),status:'in_progress',page:'2',q:'Visitor & account'};
 for(const raw of [query,{...query,q:['one','two'],token:'PRIVATE_TOKEN',return_to:'https://foreign.example'}])await assert.rejects(()=>render(raw),error=>{const location=new URL(error.location,'https://admin.example');assert.equal(location.pathname,'/auth/owner/login');const target=new URL(location.searchParams.get('return_to'),'https://admin.example');assert.equal(target.pathname,'/owner/contact');assert.deepEqual(Object.fromEntries(target.searchParams),Array.isArray(raw.q)?{message:query.message,status:query.status,page:query.page}:query);assert.ok(target.href.length<550);return true;});
});

test('actual owner inbox rendering keeps private text escaped, scoped counts and selected status controls without writes',async t=>{
 const f=await queueFixture(t),sent=await submitContact(f.db,{...body,name:'Visitor <script>',message:'Account support <script>alert(1)</script> needs a private reply.'},'203.0.113.99',at);set(f.db,f.owner);const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;assert.fail('Rendering contacted a provider');});
 const html=await render({status:'all',message:sent.reference,q:'support'});for(const text of ['Your contact inbox.','Contact inbox','Visitor &lt;script&gt;','&lt;script&gt;alert(1)&lt;/script&gt;','Save message status','Reply by email'])assert.ok(html.includes(text),text);assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(!html.includes('203.0.113.99'));assert.ok(!html.includes('email_hash'));assert.ok(!html.includes('network_hash'));assert.ok(!html.includes('payload_hash'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
 const invalid=await render({status:['all','new']});assert.ok(invalid.includes('Check your message filters.'));assert.ok(invalid.includes('Reset inbox filters'));
});

test('actual owner view denies members, closed owners and revoked grants before showing contact data',async t=>{
 const f=await queueFixture(t),member=seedApplicant(f,'member','brand',{status:'approved'});await submitContact(f.db,body,null,at);set(f.db,member);await assert.rejects(()=>render(),error=>error.status===403);
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.owner.userId,new Date().toISOString());set(f.db,f.owner);await assert.rejects(()=>render(),error=>error.location==='/account-closed');f.db.sqlite.prepare('DELETE FROM account_closures WHERE user_id=?').run(f.owner.userId);f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);await assert.rejects(()=>render(),error=>error.status===403);
});

test('the real owner contact action preserves authentication, same-origin, grant, closure and revision checks',async t=>{
 const f=await queueFixture(t),sent=await submitContact(f.db,body,null,at),change={id:sent.reference,revision:1,status:'in_progress'};set(f.db);assert.equal((await view.POST(request(change))).status,401);set(f.db,f.owner);assert.equal((await view.POST(request(change,'https://foreign.example'))).status,403);assert.equal((await view.POST(request(change,'https://admin.affimaro.example','text/plain'))).status,415);
 const member=seedApplicant(f,'member','creator',{status:'approved'});set(f.db,member);assert.equal((await view.POST(request(change))).status,403);set(f.db,f.owner);const saved=await view.POST(request(change));assert.equal(saved.status,200);assert.match(saved.headers.get('Cache-Control'),/private, no-store/);const result=await saved.json();assert.equal(result.data.status,'in_progress');assert.equal(result.data.revision,2);assert.ok(!JSON.stringify(result).includes('payload_hash'));assert.equal((await view.POST(request(change))).status,409);
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.owner.userId,new Date().toISOString());assert.equal((await view.POST(request({...change,revision:2}))).status,403);f.db.sqlite.prepare('DELETE FROM account_closures WHERE user_id=?').run(f.owner.userId);f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);assert.equal((await view.POST(request({...change,revision:2}))).status,403);assert.equal(f.db.sqlite.prepare('SELECT revision FROM contact_messages WHERE id=?').get(sent.reference).revision,2);
});
