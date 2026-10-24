import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {queueFixture,seedApplicant,seedProperty,seedPropertyQueue} from './support/ownership-queue.js';
import {reviewMediaProperty} from '../lib/media-properties.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'ownership-queue-view-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__ownershipQueueDb;delete globalThis.__ownershipQueueUser;});
const bundle=await build({stdin:{contents:"export {default as QueuePage} from './app/owner/verifications/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'ownership-queue-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__ownershipQueueDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__ownershipQueueUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'queue.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const set=(f,user=f.owner)=>{globalThis.__ownershipQueueDb=f.db;globalThis.__ownershipQueueUser=user;};
const htmlOf=async params=>renderToStaticMarkup(await views.QueuePage({searchParams:Promise.resolve(params||{})})).replaceAll(/<!--.*?-->/g,'');

test('the actual owner verification page exposes records beyond 100 with complete counts and no automatic proof activity',async t=>{
 const f=await queueFixture(t),rows=seedPropertyQueue(f);set(f);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected DNS or provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,html=await htmlOf({page:'6'});
 for(const text of ['Showing 126–131 of 131','Page 6 of 6','All properties (131)','Awaiting review (131)','Property 130','Search properties','Ownership decision'])assert.ok(html.includes(text),text);assert.ok(!html.includes('Showing the oldest 100'));assert.ok(html.includes(rows[130].challenge));assert.ok(!html.includes(rows[0].challenge));assert.ok(html.includes('href="/owner/verifications?status=review_pending&amp;page=5"'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
});

test('status, search, type and pagination links retain context; applicant scoping never broadens through a filter or empty search',async t=>{
 const f=await queueFixture(t),rows=seedPropertyQueue(f);set(f);const global=await htmlOf({portal:'creator',q:'site',page:'2'});for(const href of ['/owner/verifications?status=verified&amp;portal=creator&amp;q=site','/owner/verifications?status=review_pending&amp;portal=creator&amp;q=site&amp;page=3'])assert.ok(global.includes('href="'+href+'"'),href);
 const scoped=await htmlOf({applicant:'member-001',portal:'creator',q:'site',page:'2'});assert.ok(scoped.includes('member-001@example.com'));assert.ok(scoped.includes('Showing 1–10 of 10'));assert.ok(scoped.includes('href="/owner/verifications?status=verified&amp;applicant=member-001&amp;portal=creator&amp;q=site"'));assert.ok(scoped.includes('href="/owner/verifications?status=all&amp;applicant=member-001&amp;portal=creator"'));assert.ok(scoped.includes('href="/owner/applications?applicant=member-001"'));assert.ok(!scoped.includes(rows[0].challenge));assert.ok(!scoped.includes(rows[130].challenge));
 const form=scoped.match(/<form\b(?=[^>]*action="\/owner\/verifications")[\s\S]*?<\/form>/)[0];assert.ok(form.includes('name="applicant" value="member-001"'));assert.ok(form.includes('name="status" value="all"'));assert.ok(!form.includes('name="page"'));
 const empty=await htmlOf({applicant:'member-001',portal:'brand'});assert.ok(empty.includes('No properties match this view'));assert.ok(empty.includes('member-001@example.com'));assert.ok(!empty.includes(rows[0].challenge));
});

test('the same queue URL reflects an explicit proof decision and corrects the old last page while account approval stays pending',async t=>{
 const f=await queueFixture(t),rows=seedPropertyQueue(f,26),last=rows.at(-1);set(f);let html=await htmlOf({page:'2'});assert.ok(html.includes(last.challenge));await reviewMediaProperty(f.db,f.owner,{id:last.id,revision:2,decision:'verified',observedCode:last.challenge,evidenceChecked:true,note:'Exact current proof and authorized publisher identity checked.'});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;html=await htmlOf({page:'2'});assert.ok(html.includes('Page 1 of 1'));assert.ok(html.includes('Awaiting review (25)'));assert.ok(!html.includes(last.challenge));assert.equal(f.db.sqlite.prepare('SELECT status FROM platform_applications WHERE user_id=?').get(last.user_id).status,'pending');assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
 const scoped=await htmlOf({applicant:last.user_id,status:'verified'});assert.ok(scoped.includes(last.challenge));assert.ok(scoped.includes('Return to this application'));
});

test('malformed filters have a recoverable scoped reset and missing/closed applicants cannot fall back to global evidence',async t=>{
 const f=await queueFixture(t);seedApplicant(f,'author');const property=seedProperty(f,'author');set(f);for(const input of [{status:['all','verified']},{portal:'owner'},{q:['one','two']},{page:['1','2']}]){const html=await htmlOf({applicant:'author',...input});assert.ok(html.includes('Check your property filters'));assert.ok(html.includes('href="/owner/verifications?status=all&amp;applicant=author"'));assert.ok(!html.includes(property.challenge));}
 await assert.rejects(htmlOf({applicant:'missing'}),e=>e.notFound===true);f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run('author','Member requested closure.',new Date().toISOString());await assert.rejects(htmlOf({applicant:'author'}),e=>e.notFound===true);
});

test('the actual verification page denies every customer role, anonymous visitors and a revoked owner',async t=>{
 const f=await queueFixture(t);for(const role of ['brand','affiliate','creator','agency']){const user=seedApplicant(f,role,role);set(f,{userId:user.userId,email:f.owner.email,role:'owner'});await assert.rejects(htmlOf({applicant:role}),e=>e.status===403||typeof e.location==='string');}set(f,null);await assert.rejects(htmlOf({}),e=>typeof e.location==='string');f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);set(f);await assert.rejects(htmlOf({}),e=>e.status===403||typeof e.location==='string');
});
