import test from 'node:test';
import assert from 'node:assert/strict';
import {queueFixture,seedApplicant,queueAt} from './support/admission-queue.js';
import {admissions} from '../lib/admissions.ts';
import {AppError} from '../lib/service.ts';
import {applicationProfile} from './support/application-profiles.js';
import {parseAdmissionQueueFilters,admissionQueuePath} from '../lib/admission-queue.ts';
const fails=status=>e=>e instanceof AppError&&e.status===status;

test('the owner can reach every application beyond 100, with stable oldest-first pages',async t=>{
 const f=await queueFixture(t);for(let i=0;i<131;i++)seedApplicant(f,'applicant-'+String(i).padStart(4,'0'));
 const ids=[];for(let page=1;page<=3;page++){const q=await admissions(f.db,f.owner).queue('pending',undefined,{page});assert.equal(q.total,131);assert.equal(q.pages,3);assert.equal(q.pageSize,50);assert.equal(q.page,page);assert.equal(q.applications.length,page===3?31:50);ids.push(...q.applications.map(a=>a.user_id));}
 assert.equal(new Set(ids).size,131);assert.equal(ids[0],'applicant-0000');assert.equal(ids.at(-1),'applicant-0130');
 const history=await admissions(f.db,f.owner).queue('pending',undefined,{page:3});assert.ok(history.applications.some(a=>a.user_id==='applicant-0130'));
});

test('search matches applicant/contact names, email and declared brand or agency without searching private profile fields',async t=>{
 const f=await queueFixture(t);seedApplicant(f,'brand','brand',{name:'Display Alias',email:'review-brand@example.com',profile:{...applicationProfile('brand'),businessName:'Northline Commerce',contactName:'Zara Malik',description:'PRIVATE_DESCRIPTION',phone:'PRIVATE_PHONE'}});seedApplicant(f,'agency','agency',{profile:{...applicationProfile('agency'),agencyName:'Juniper Partnerships'}});seedApplicant(f,'creator','creator');
 const api=admissions(f.db,f.owner);for(const q of ['display alias','REVIEW-BRAND@','northline','zara malik']){const result=await api.queue('pending',undefined,{q});assert.equal(result.total,1,q);assert.equal(result.applications[0].user_id,'brand');}
 assert.equal((await api.queue('pending','agency',{q:'JUNIPER'})).applications[0].organization_name,'Juniper Partnerships');
 for(const q of ['PRIVATE_DESCRIPTION','PRIVATE_PHONE',"' OR 1=1 --",'%','_'])assert.equal((await api.queue('pending',undefined,{q})).total,0,q);
 const json=JSON.stringify(await api.queue());for(const secret of ['PRIVATE_DESCRIPTION','PRIVATE_PHONE','profile_json','transition_id','reviewed_by'])assert.ok(!json.includes(secret));
});

test('four exact account types, statuses and search combine while pending counts remain global and exclude owners and closed accounts',async t=>{
 const f=await queueFixture(t);for(const role of ['brand','affiliate','creator','agency']){seedApplicant(f,role+'-pending',role,{name:'Target pending '+role});seedApplicant(f,role+'-approved',role,{status:'approved',name:'Target approved '+role});}
 seedApplicant(f,'closed','creator');f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run('closed','Closed by member.',queueAt);seedApplicant(f,'other-owner','brand');f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run('other-owner',queueAt);
 for(const role of ['brand','affiliate','creator','agency']){const result=await admissions(f.db,f.owner).queue('approved',role,{q:'target'});assert.equal(result.total,1);assert.equal(result.applications[0].portal,role);assert.equal(result.applications[0].user_id,role+'-approved');for(const p of ['brand','affiliate','creator','agency'])assert.equal(result.counts.find(c=>c.portal===p&&c.status==='pending').total,1);}
 const empty=await admissions(f.db,f.owner).queue('pending',undefined,{q:'no match'});assert.equal(empty.total,0);assert.equal(empty.counts.reduce((n,c)=>n+c.total,0),8);
});

test('page bounds recover after queue changes or narrowed searches, including empty results and null draft submission dates',async t=>{
 const f=await queueFixture(t);for(let i=0;i<51;i++)seedApplicant(f,'record-'+String(i).padStart(3,'0'));const api=admissions(f.db,f.owner);let q=await api.queue('pending',undefined,{page:999999});assert.equal(q.page,2);assert.equal(q.applications.length,1);
 f.db.sqlite.prepare("UPDATE platform_applications SET status='changes_requested' WHERE user_id='record-050'").run();q=await api.queue('pending',undefined,{page:2});assert.equal(q.page,1);assert.equal(q.applications.length,50);
 q=await api.queue('pending',undefined,{page:9999,q:'record-010'});assert.equal(q.page,1);assert.equal(q.total,1);q=await api.queue('pending',undefined,{page:9999,q:'none'});assert.equal(q.pages,0);assert.equal(q.page,1);assert.deepEqual(q.applications,[]);
 seedApplicant(f,'draft-a','creator',{status:'draft'});seedApplicant(f,'draft-b','creator',{status:'draft',profile:'invalid legacy JSON'});const drafts=await api.queue('draft','creator');assert.deepEqual(drafts.applications.map(a=>a.user_id),['draft-a','draft-b']);assert.ok(drafts.applications.every(a=>a.submitted_at===null));assert.equal(drafts.applications[1].organization_name,'');
});

test('queue reads cannot save decisions, modify revisions, provision portals or contact external providers',async t=>{
 const f=await queueFixture(t);seedApplicant(f,'pending-brand','brand');let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 for(const status of ['pending','changes_requested','approved','rejected','draft'])await admissions(f.db,f.owner).queue(status,undefined,{q:'pending'});
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(fetches,0);assert.equal(f.db.sqlite.prepare("SELECT status FROM platform_applications WHERE user_id='pending-brand'").get().status,'pending');for(const table of ['workspaces','affiliate_profiles','platform_review_events','billing_accounts','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
});

test('customer roles, a claimed owner email and revoked owner grants cannot read application queues',async t=>{
 const f=await queueFixture(t);for(const role of ['brand','affiliate','creator','agency']){const user=seedApplicant(f,role,role);await assert.rejects(admissions(f.db,{userId:user.userId,email:f.owner.email,role:'owner'}).queue('pending',undefined,{q:'Applicant'}),fails(403));}
 f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);await assert.rejects(admissions(f.db,f.owner).queue(),fails(403));
});

test('invalid or repeated filters reject safely and navigation retains search without carrying page or selection into a changed filter',async t=>{
 const f=await queueFixture(t),api=admissions(f.db,f.owner);
 for(const input of [{page:0},{page:['1','2']},{page:1.1},{page:1000001},{q:['one','two']},{q:'x'.repeat(121)},{ownerId:'another'},{status:'approved'}])await assert.rejects(api.queue('pending',undefined,input),fails(400));
 await assert.rejects(api.queue('unknown'),fails(400));await assert.rejects(api.queue('pending','owner'),fails(400));
 for(const input of [{status:['pending','approved']},{portal:['brand','creator']},{applicant:['a','b']},{applicant:'x'.repeat(201)},{userId:'another'}])assert.throws(()=>parseAdmissionQueueFilters(input),fails(400));
 const filters=parseAdmissionQueueFilters({status:'pending',portal:'agency',q:' juniper & partners ',page:'3',applicant:'profile&status=approved'}),url=new URL(admissionQueuePath(filters),'https://admin.example');assert.equal(url.searchParams.get('q'),'juniper & partners');assert.equal(url.searchParams.get('applicant'),'profile&status=approved');assert.equal(url.searchParams.get('status'),'pending');
 const changed=new URL(admissionQueuePath(filters,{status:'approved',page:1,applicant:undefined}),'https://admin.example');assert.equal(changed.searchParams.get('q'),'juniper & partners');assert.equal(changed.searchParams.get('portal'),'agency');assert.equal(changed.searchParams.has('page'),false);assert.equal(changed.searchParams.has('applicant'),false);
});
