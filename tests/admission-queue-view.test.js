import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {queueFixture,seedApplicant} from './support/admission-queue.js';
import {seedVerifiedProperties,applicationProfile} from './support/application-profiles.js';
import {admissions} from '../lib/admissions.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'admission-queue-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__admissionQueueDb;delete globalThis.__admissionQueueUser;});
const bundle=await build({stdin:{contents:"export {default as OwnerPage} from './app/owner/applications/page';export {default as LegacyPage} from './app/admin/applications/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'owner-review-queue-fixture',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__admissionQueueDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__admissionQueueUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'queue.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const set=(f,user=f.owner)=>{globalThis.__admissionQueueDb=f.db;globalThis.__admissionQueueUser=user;};
const htmlOf=async(params={},page='OwnerPage')=>renderToStaticMarkup(await views[page]({searchParams:Promise.resolve(params)})).replaceAll(/<!--.*?-->/g,'');

test('the actual owner and legacy review pages expose older applications without writes or provider activity',async t=>{
 const f=await queueFixture(t);for(let i=0;i<131;i++)seedApplicant(f,'record-'+String(i).padStart(4,'0'));set(f);let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 for(const page of ['OwnerPage','LegacyPage']){const html=await htmlOf({page:'3'},page);for(const text of ['Showing 101–131 of 131','Page 3 of 3','Applicant record-0130','Applicant name, email or business','Search applications'])assert.ok(html.includes(text),text);assert.ok(html.includes('href="/owner/applications?status=pending&amp;page=2"'));assert.ok(!html.includes('Showing the oldest 100 applications'));assert.ok(!html.includes('Save review decision'));}
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(fetches,0);
});

test('page, profile, status and type links keep the search context and reset the appropriate page and selection',async t=>{
 const f=await queueFixture(t);for(let i=0;i<105;i++)seedApplicant(f,'creator-'+String(i).padStart(3,'0'),'creator',{name:'Target creator '+i});set(f);seedVerifiedProperties(f.db,'creator-050',applicationProfile('creator'));
 const html=await htmlOf({status:'pending',portal:'creator',q:'Target',page:'2',applicant:'creator-050'});
 for(const href of ['/owner/applications?status=pending&amp;portal=creator&amp;q=Target','/owner/applications?status=pending&amp;portal=creator&amp;q=Target&amp;page=3','/owner/applications?status=approved&amp;portal=creator&amp;q=Target','/owner/applications?status=pending&amp;portal=agency&amp;q=Target','/owner/applications?status=pending&amp;portal=creator&amp;q=Target&amp;page=2&amp;applicant=creator-050','/owner/applications?status=pending&amp;portal=brand'])assert.ok(html.includes('href="'+href+'"'),href);
 assert.ok(html.includes('action="/owner/applications"'));assert.ok(html.includes('name="status" value="pending"'));assert.ok(html.includes('name="portal" value="creator"'));assert.ok(html.includes('value="Target"'));assert.ok(html.includes('Save review decision'));assert.ok(html.includes('Approve account &amp; open portal'));assert.ok(html.includes('Review this applicant’s property evidence'));assert.ok(html.includes('creator-050@example.com'));
 const form=html.match(/<form\b(?=[^>]*action="\/owner\/applications")[\s\S]*?<\/form>/)[0];assert.ok(!form.includes('name="page"'));assert.ok(!form.includes('name="applicant"'));
});

test('a completed manual review leaves an accurate selected profile and clamps the old last page without another decision',async t=>{
 const f=await queueFixture(t);for(let i=0;i<51;i++)seedApplicant(f,'record-'+String(i).padStart(3,'0'));set(f);const query={status:'pending',page:'2',applicant:'record-050'};let html=await htmlOf(query);assert.ok(html.includes('Page 2 of 2'));assert.ok(html.includes('Save review decision'));
 await admissions(f.db,f.owner).review({userId:'record-050',revision:2,decision:'rejected',note:'Please provide a suitable publishing plan before applying again.'});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;html=await htmlOf(query);assert.ok(html.includes('Page 1 of 1'));assert.ok(html.includes('Current state: rejected'));assert.ok(!html.includes('Save review decision'));assert.ok(html.includes('record-050@example.com'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(f.db.sqlite.prepare("SELECT revision FROM platform_applications WHERE user_id='record-050'").get().revision,3);
 await assert.rejects(admissions(f.db,f.owner).review({userId:'record-050',revision:2,decision:'approved',note:''}),e=>e.status===409);
});

test('invalid filters and missing profiles show recoverable states without exposing other profile data',async t=>{
 const f=await queueFixture(t);seedApplicant(f,'one','brand',{profile:{...applicationProfile('brand'),phone:'+1 202 555 0999'}});set(f);
 for(const query of [{status:['pending','approved']},{portal:'owner'},{page:['1','2']},{q:'x'.repeat(121)},{applicant:['one','other']}]){const html=await htmlOf(query);assert.ok(html.includes('Check your application filters'));assert.ok(html.includes('Reset queue filters'));assert.ok(!html.includes('+1 202 555 0999'));assert.ok(!html.includes('Save review decision'));}
 const missing=await htmlOf({applicant:'missing'});assert.ok(missing.includes('Application not found'));assert.ok(!missing.includes('Save review decision'));const empty=await htmlOf({q:'not found'});assert.ok(empty.includes('No applications match this view'));assert.ok(empty.includes('0 matching applications'));assert.ok(empty.includes('Clear search'));
});

test('all customer roles, anonymous visitors and a revoked owner cannot render the owner queue',async t=>{
 const f=await queueFixture(t);for(const role of ['brand','affiliate','creator','agency']){const user=seedApplicant(f,role,role);set(f,{userId:user.userId,email:f.owner.email,role:'owner'});await assert.rejects(views.OwnerPage({searchParams:Promise.resolve({})}),e=>e.status===403||typeof e.location==='string');}
 set(f,null);await assert.rejects(views.OwnerPage({searchParams:Promise.resolve({})}),e=>typeof e.location==='string');f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);set(f);await assert.rejects(views.OwnerPage({searchParams:Promise.resolve({})}),e=>e.status===403||typeof e.location==='string');
});
