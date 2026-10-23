import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {admissions} from '../lib/admissions.ts';
import {ownerOverview} from '../lib/owner.ts';
import {mediaProperties,mediaPropertiesFor,profileVerificationSummary,reviewMediaProperty,assertVerifiedProfile} from '../lib/media-properties.ts';
import {ownershipReviewQueue,ownershipReviewPath,applicationReviewPath} from '../lib/ownership-review.ts';
import {applicationProfile,seedVerifiedProperties} from './support/application-profiles.js';
const identity=userId=>({userId,email:userId+'@example.com'}),fails=status=>e=>e instanceof AppError&&e.status===status;
async function fixture(t){const db=database(t),owner=identity('owner'),applicant=identity('applicant'),other=identity('other');for(const user of [owner,applicant,other])await service(db,user).saveAccount({name:user.userId+' name'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,new Date().toISOString());return {db,owner,applicant,other};}

test('each account type can complete property review and then its separate profile review',async t=>{
 for(const role of ['brand','affiliate','creator','agency']){
  const f=await fixture(t),api=admissions(f.db,f.applicant),profile=applicationProfile(role);await api.start(role);const app=await api.submit({revision:1,profile});seedVerifiedProperties(f.db,f.applicant.userId,profile);
  let property=(await mediaPropertiesFor(f.db,f.applicant.userId))[0],properties=mediaProperties(f.db,f.applicant);property=await properties.renew({id:property.id,revision:property.revision});property=await properties.requestReview({id:property.id,revision:property.revision,proofUrl:property.url,note:'My current code appears on this exact public property.'});
  assert.equal((await ownerOverview(f.db,f.owner)).counts.pending_verifications,1);
  const before=await ownershipReviewQueue(f.db,f.owner,{applicant:f.applicant.userId});assert.equal(before.status,'all');assert.ok(before.properties.every(p=>p.user_id===f.applicant.userId));assert.equal(profileVerificationSummary(before.properties,profile).ready,false);
  await assert.rejects(admissions(f.db,f.owner).review({userId:f.applicant.userId,revision:app.revision,decision:'approved',note:''}),fails(409));
  await reviewMediaProperty(f.db,f.owner,{id:property.id,revision:property.revision,decision:'verified',observedCode:property.challenge,evidenceChecked:true,note:'Exact current proof and authorized management have been checked.'});
  assert.equal((await ownerOverview(f.db,f.owner)).counts.pending_verifications,0);
  const after=await ownershipReviewQueue(f.db,f.owner,{applicant:f.applicant.userId});assert.equal(after.properties.length,before.properties.length);assert.equal(profileVerificationSummary(after.properties,profile).ready,true);assert.equal((await api.own()).status,'pending','Ownership review must not approve the profile');
  assert.equal((await ownershipReviewQueue(f.db,f.owner,{applicant:f.applicant.userId,status:'review_pending'})).properties.length,0);
  const approved=await admissions(f.db,f.owner).review({userId:f.applicant.userId,revision:app.revision,decision:'approved',note:''});assert.equal(approved.status,'approved');assert.equal(approved.portal,role);
  for(const table of ['billing_accounts','billing_checkouts','payment_connections','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
 }
});

test('readiness identifies missing profile URLs, stale evidence, unrelated unverified properties and archived evidence',async t=>{
 const f=await fixture(t),profile=applicationProfile('creator'),at=Date.now();seedVerifiedProperties(f.db,f.applicant.userId,profile);const properties=await mediaPropertiesFor(f.db,f.applicant.userId);
 assert.equal(profileVerificationSummary(properties,profile,at).ready,true);
 const missing=profileVerificationSummary(properties.slice(1),profile,at);assert.equal(missing.ready,false);assert.ok(missing.urls.some(u=>!u.listed));
 const boundary=properties.map(p=>({...p,verified_at:new Date(at-180*86400000).toISOString()}));assert.equal(profileVerificationSummary(boundary,profile,at).ready,true);
 const expired=profileVerificationSummary(boundary,profile,at+1);assert.equal(expired.ready,false);assert.ok(expired.blockers.every(p=>p.reason==='Verification is out of date'));
 const extra={...properties[0],id:crypto.randomUUID(),url:'https://unrelated.example',name:'Extra channel',status:'unverified',verified_at:null};const incomplete=profileVerificationSummary([...properties,extra],profile,at);assert.ok(incomplete.urls.every(u=>u.verified));assert.equal(incomplete.ready,false);assert.equal(incomplete.blockers[0].id,extra.id);
 assert.equal(profileVerificationSummary([...properties,{...extra,archived:1}],profile,at).ready,true);
 assert.equal(profileVerificationSummary(properties.map(p=>({...p,archived:1})),profile,at).ready,false);
 assert.equal(profileVerificationSummary([],{},at).ready,false);
 f.db.sqlite.prepare('UPDATE media_properties SET verified_at=? WHERE user_id=?').run(new Date(at-181*86400000).toISOString(),f.applicant.userId);await assert.rejects(assertVerifiedProfile(f.db,f.applicant.userId,profile),fails(409));
});

test('owner property filters remain scoped to one applicant and customer roles cannot inspect the queue',async t=>{
 const f=await fixture(t),first=await mediaProperties(f.db,f.applicant).add({kind:'Website',platform:'Website / blog',name:'First website',url:'https://first.example',relationship:'Owner'}),second=await mediaProperties(f.db,f.other).add({kind:'Website',platform:'Website / blog',name:'Other website',url:'https://other.example',relationship:'Owner'});
 const own=await ownershipReviewQueue(f.db,f.owner,{applicant:f.applicant.userId});assert.deepEqual(own.properties.map(p=>p.id),[first.id]);assert.equal(own.account.email,f.applicant.email);assert.ok(!JSON.stringify(own).includes(second.challenge));
 assert.equal((await ownershipReviewQueue(f.db,f.owner)).status,'review_pending');assert.equal((await ownershipReviewQueue(f.db,f.owner,{status:'all'})).properties.length,2);
 assert.equal((await ownershipReviewQueue(f.db,f.owner,{applicant:f.applicant.userId,status:'verified'})).properties.length,0);
 for(const role of ['brand','affiliate','creator','agency']){const user=identity(role);await service(f.db,user).saveAccount({name:role+' account'});await admissions(f.db,user).start(role);await assert.rejects(ownershipReviewQueue(f.db,user,{applicant:f.applicant.userId}),fails(403));}
 await assert.rejects(ownershipReviewQueue(f.db,f.owner,{applicant:"' OR 1=1 --"}),fails(404));await assert.rejects(ownershipReviewQueue(f.db,f.owner,{applicant:'x'.repeat(201)}),fails(400));
 f.db.sqlite.prepare('UPDATE media_properties SET archived=1 WHERE id=?').run(first.id);assert.equal((await ownershipReviewQueue(f.db,f.owner,{applicant:f.applicant.userId})).properties.length,0);
 assert.equal(new URL(ownershipReviewPath('a&status=verified'),'https://admin.example').searchParams.get('applicant'),'a&status=verified');assert.equal(new URL(applicationReviewPath('a&other=value'),'https://admin.example').searchParams.get('applicant'),'a&other=value');
});
