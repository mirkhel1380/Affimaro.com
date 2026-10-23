import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture,identity} from './support/partner-workspace.js';
import {partnerApplicationReview,assertPartnerReadyForApproval} from '../lib/partner-review.ts';
import {discovery} from '../lib/discovery.ts';
import {service,AppError} from '../lib/service.ts';
const fails=n=>e=>e instanceof AppError&&e.status===n;

test('program owners can review their own unlisted applicants with role-specific promotional information only',async t=>{
 const f=await partnerFixture(t);
 await discovery(f.db,f.creator).setListing({listed:false});
 f.db.sqlite.prepare("UPDATE media_properties SET review_note='PRIVATE_EVIDENCE_NOTE',proof_url='https://private.example/proof',challenge='PRIVATE_CHALLENGE' WHERE user_id='creator'").run();
 f.db.sqlite.prepare("UPDATE platform_applications SET review_note='OWNER_PRIVATE_NOTE' WHERE user_id='creator'").run();
 let review=await partnerApplicationReview(f.db,f.brand,f.pending.id);
 assert.equal(review.portal,'creator');assert.equal(review.status,'pending');assert.equal(review.approvalReady,true);
 assert.equal(review.profile.primaryPlatform,'YouTube');assert.deepEqual(review.profile.contentFormats,['Videos','Articles']);
 assert.equal(review.channels.length,3);assert.ok(review.channels.every(c=>c.verified));
 const raw=JSON.stringify(review);
 for(const secret of ['PRIVATE_EVIDENCE_NOTE','PRIVATE_CHALLENGE','OWNER_PRIVATE_NOTE','private.example','@example.com','contactName','phone','city','review_note','proof_url','profile_json','legalBusinessName','registrationNumber'])assert.ok(!raw.includes(secret),secret);
 const program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.affiliate).apply({programId:program.id});
 review=await partnerApplicationReview(f.db,f.agency,application.id);
 assert.equal(review.portal,'affiliate');assert.equal(review.profile.channel,'Blog');assert.ok(!Object.hasOwn(review.profile,'primaryPlatform'));
 assert.equal(review.profile.promotionPlan.includes('comparisons'),true);
});
test('applicant detail rejects foreign businesses, applicants, owner administration and unknown identifiers',async t=>{
 const f=await partnerFixture(t);
 for(const actor of [f.foreignBrand,f.agency])await assert.rejects(partnerApplicationReview(f.db,actor,f.pending.id),fails(404));
 for(const actor of [f.affiliate,f.creator,f.operator,identity('unknown')])await assert.rejects(partnerApplicationReview(f.db,actor,f.pending.id),fails(403));
 for(const id of ['not-an-application',crypto.randomUUID()])await assert.rejects(partnerApplicationReview(f.db,f.brand,id),fails(404));
});
test('approval requires current complete channel evidence and an approved open applicant account',async t=>{
 const f=await partnerFixture(t),input={applicationId:f.pending.id,status:'approved'};
 await assertPartnerReadyForApproval(f.db,f.brand,input);
 const properties=f.db.sqlite.prepare("SELECT * FROM media_properties WHERE user_id='creator'").all();
 for(const state of ['revoked','review_pending','unverified']){
  f.db.sqlite.prepare('UPDATE media_properties SET status=? WHERE id=?').run(state,properties[0].id);
  assert.equal((await partnerApplicationReview(f.db,f.brand,f.pending.id)).approvalReady,false);
  await assert.rejects(assertPartnerReadyForApproval(f.db,f.brand,input),fails(409));
 }
 f.db.sqlite.prepare("UPDATE media_properties SET status='verified',verified_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(properties[0].id);
 const expired=await partnerApplicationReview(f.db,f.brand,f.pending.id);assert.equal(expired.channels.find(p=>p.url===properties[0].url).verified,false);assert.equal(expired.ownershipReady,false);
 await assert.rejects(assertPartnerReadyForApproval(f.db,f.brand,input),fails(409));
 f.db.sqlite.prepare('UPDATE media_properties SET verified_at=?,archived=1 WHERE id=?').run(new Date().toISOString(),properties[0].id);
 await assert.rejects(assertPartnerReadyForApproval(f.db,f.brand,input),fails(409));
 f.db.sqlite.prepare('UPDATE media_properties SET archived=0 WHERE id=?').run(properties[0].id);
 f.db.sqlite.prepare("UPDATE platform_applications SET status='changes_requested' WHERE user_id='creator'").run();
 await assert.rejects(assertPartnerReadyForApproval(f.db,f.brand,input),fails(409));
 f.db.sqlite.prepare("UPDATE platform_applications SET status='approved' WHERE user_id='creator'").run();
 await assertPartnerReadyForApproval(f.db,f.brand,input);
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at,reason) VALUES (?,?,?)').run('creator',new Date().toISOString(),'Fixture account closure');
 assert.equal((await partnerApplicationReview(f.db,f.brand,f.pending.id)).closed,true);
 await assert.rejects(assertPartnerReadyForApproval(f.db,f.brand,input),fails(409));
 assert.equal(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(f.pending.id).status,'pending');
 await assert.rejects(assertPartnerReadyForApproval(f.db,f.brand,{...input,userId:'affiliate'}),fails(400));
});
