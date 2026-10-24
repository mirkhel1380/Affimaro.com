import test from 'node:test';
import assert from 'node:assert/strict';
import {queueFixture,seedApplicant,seedProperty,seedPropertyQueue} from './support/ownership-queue.js';
import {ownershipReviewQueue} from '../lib/ownership-review.ts';
import {parseOwnershipQueueFilters,ownershipQueuePath,ownershipReviewPath} from '../lib/ownership-review.ts';
import {reviewMediaProperty,mediaProperties} from '../lib/media-properties.ts';
import {AppError} from '../lib/service.ts';
const fails=status=>e=>e instanceof AppError&&e.status===status;

test('every ownership record beyond 100 remains reachable through stable oldest-update-first pages',async t=>{
 const f=await queueFixture(t),rows=seedPropertyQueue(f),ids=[];for(let page=1;page<=6;page++){const q=await ownershipReviewQueue(f.db,f.owner,{page:String(page)});assert.equal(q.total,131);assert.equal(q.pages,6);assert.equal(q.pageSize,25);assert.equal(q.properties.length,page===6?6:25);ids.push(...q.properties.map(p=>p.id));}assert.deepEqual(ids,rows.map(p=>p.id));assert.equal(new Set(ids).size,131);
});

test('literal search covers property names, URLs, platforms and applicant names/email while status counts stay within the same scope',async t=>{
 const f=await queueFixture(t);seedApplicant(f,'author','creator',{name:'Maya Publisher',email:'Maya.Author@example.com'});seedApplicant(f,'other','brand');seedProperty(f,'author',{name:'Studio Journal',url:'https://journal.example/notes'});seedProperty(f,'author',{name:'Published videos',kind:'Video',platform:'YouTube',url:'https://www.youtube.com/@example',status:'verified'});seedProperty(f,'other',{name:'Studio Journal'});
 for(const q of ['studio','journal.example','MAYA PUBLISHER','maya.author@']){const data=await ownershipReviewQueue(f.db,f.owner,{applicant:'author',q});assert.ok(data.total>=1);assert.ok(data.properties.every(p=>p.user_id==='author'));}
 const videos=await ownershipReviewQueue(f.db,f.owner,{q:'youtube',status:'all',portal:'creator'});assert.equal(videos.total,1);assert.equal(videos.properties[0].platform,'YouTube');const scoped=await ownershipReviewQueue(f.db,f.owner,{applicant:'author',status:'review_pending'});assert.equal(scoped.total,1);assert.equal(scoped.statusCounts.find(c=>c.status==='verified').total,1);assert.equal(scoped.statusCounts.reduce((n,c)=>n+c.total,0),2);
 for(const q of ['%',"' OR 1=1 --",'no-match'])assert.equal((await ownershipReviewQueue(f.db,f.owner,{q,status:'all'})).total,0);
});

test('archived properties and closed applicants stay excluded from records, totals and status counts',async t=>{
 const f=await queueFixture(t);for(const id of ['open','closed'])seedApplicant(f,id);seedProperty(f,'open');seedProperty(f,'open',{archived:1});seedProperty(f,'closed');f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run('closed','Member requested closure.',new Date().toISOString());
 const q=await ownershipReviewQueue(f.db,f.owner,{status:'all'});assert.equal(q.total,1);assert.equal(q.statusCounts.reduce((n,c)=>n+c.total,0),1);assert.equal(q.properties[0].user_id,'open');await assert.rejects(ownershipReviewQueue(f.db,f.owner,{applicant:'closed'}),fails(404));await assert.rejects(ownershipReviewQueue(f.db,f.owner,{applicant:'missing'}),fails(404));
});

test('a saved ownership decision or narrower search resolves a stale last page without approving the account',async t=>{
 const f=await queueFixture(t),rows=seedPropertyQueue(f,26);let q=await ownershipReviewQueue(f.db,f.owner,{page:'2'});assert.equal(q.properties.length,1);const last=rows.at(-1);await reviewMediaProperty(f.db,f.owner,{id:last.id,revision:last.revision,decision:'verified',note:'Exact current public code and authorized control reviewed.',observedCode:last.challenge,evidenceChecked:true});
 q=await ownershipReviewQueue(f.db,f.owner,{page:'2'});assert.equal(q.page,1);assert.equal(q.total,25);assert.equal(q.statusCounts.find(c=>c.status==='verified').total,1);assert.equal(f.db.sqlite.prepare('SELECT status FROM platform_applications WHERE user_id=?').get(last.user_id).status,'pending');const narrow=await ownershipReviewQueue(f.db,f.owner,{page:'9999',q:'site-25.example',status:'verified'});assert.equal(narrow.page,1);assert.equal(narrow.total,1);const empty=await ownershipReviewQueue(f.db,f.owner,{page:'9999',q:'none'});assert.equal(empty.page,1);assert.equal(empty.pages,0);
});

test('queue reads do not verify proof, call DNS/providers, rotate challenges or weaken the existing revision/code checks',async t=>{
 const f=await queueFixture(t);seedApplicant(f,'author');const p=seedProperty(f,'author'),before=f.db.sqlite.prepare('SELECT total_changes() n FROM media_properties').get().n;let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected external proof check');});
 const q=await ownershipReviewQueue(f.db,f.owner,{applicant:'author'});assert.equal(q.properties[0].challenge,p.challenge);assert.equal(q.properties[0].status,'review_pending');assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
 await assert.rejects(reviewMediaProperty(f.db,f.owner,{id:p.id,revision:2,decision:'verified',note:'I reviewed the claimed public code.',observedCode:'WRONG_CODE',evidenceChecked:true}),fails(409));await mediaProperties(f.db,{userId:'author',email:'author@example.com'}).renew({id:p.id,revision:2});await assert.rejects(reviewMediaProperty(f.db,f.owner,{id:p.id,revision:2,decision:'verified',note:'A stale queue cannot approve this proof.',observedCode:p.challenge,evidenceChecked:true}),fails(409));
});

test('all customer roles and revoked owners are denied; malformed, repeated and authority filters fail safely',async t=>{
 const f=await queueFixture(t);for(const role of ['brand','affiliate','creator','agency']){seedApplicant(f,role,role);await assert.rejects(ownershipReviewQueue(f.db,{userId:role,email:f.owner.email,role:'owner'},{applicant:role}),fails(403));}
 for(const input of [{page:0},{page:['1','2']},{page:1000001},{status:['all','verified']},{status:'approved'},{portal:'owner'},{q:['one','two']},{q:'x'.repeat(121)},{applicant:' '},{applicant:['author','other']},{userId:'another'}])await assert.rejects(ownershipReviewQueue(f.db,f.owner,input),fails(400));
 const filters=parseOwnershipQueueFilters({applicant:'author&status=verified',portal:'creator',status:'review_pending',q:' studio & news ',page:'3'}),url=new URL(ownershipQueuePath(filters,{status:'verified',page:1}),'https://admin.example');assert.equal(url.searchParams.get('applicant'),'author&status=verified');assert.equal(url.searchParams.get('q'),'studio & news');assert.equal(url.searchParams.has('page'),false);assert.equal(url.searchParams.get('portal'),'creator');assert.equal(new URL(ownershipReviewPath('author'),'https://admin.example').searchParams.get('status'),'all');
 f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);await assert.rejects(ownershipReviewQueue(f.db,f.owner),fails(403));
});

test('applicant, exact account type and search narrow the same ownership scope without falling back to another applicant',async t=>{
 const f=await queueFixture(t);for(const role of ['brand','affiliate','creator','agency']){seedApplicant(f,role,role);seedProperty(f,role,{name:'Target '+role});}const q=await ownershipReviewQueue(f.db,f.owner,{applicant:'creator',portal:'creator',q:'Target'});assert.equal(q.status,'all');assert.equal(q.total,1);assert.equal(q.properties[0].user_id,'creator');assert.equal(q.properties[0].portal,'creator');assert.equal(q.account.email,'creator@example.com');assert.equal((await ownershipReviewQueue(f.db,f.owner,{applicant:'creator',portal:'brand'})).total,0);
});
