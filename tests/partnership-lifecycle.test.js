import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {service,AppError} from '../lib/service.ts';
import {closeAccount} from '../lib/account-closure.ts';
import {assertPartnerReadyForApproval} from '../lib/partner-review.ts';
import {programInvitation} from '../lib/program-invitation.ts';

const fails=status=>error=>error instanceof AppError&&error.status===status;
const onceBeforeBatch=(db,operation)=>{const original=db.batch.bind(db);let once=true;db.batch=async statements=>{if(once){once=false;await operation();}return original(statements);};};
const row=(f,id=f.pending.id)=>f.db.sqlite.prepare('SELECT * FROM applications WHERE id=?').get(id);
const reviews=f=>f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='application_reviewed'").get().n;

test('an application opened before a program pause cannot be inserted or audited after the pause',async t=>{
 const f=await partnerFixture(t),newPartner=await f.add('affiliate','pause-race-partner'),before=f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='application_received'").get().n;
 onceBeforeBatch(f.db,()=>f.db.sqlite.prepare('UPDATE programs SET active=0 WHERE id=?').run(f.program.id));
 await assert.rejects(service(f.db,newPartner).apply({programId:f.program.id}),fails(409));
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications WHERE affiliate_user_id=?').get(newPartner.userId).n,0);assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='application_received'").get().n,before);
});
test('a partner account closing after its approval check cannot be restored by the in-flight decision',async t=>{
 const f=await partnerFixture(t),snapshot=await assertPartnerReadyForApproval(f.db,f.brand,{applicationId:f.pending.id,status:'approved'}),before=reviews(f);
 onceBeforeBatch(f.db,()=>closeAccount(f.db,f.creator,'Closing this test account.'));
 await assert.rejects(service(f.db,f.brand).review({applicationId:f.pending.id,status:'approved'},snapshot),fails(409));
 assert.equal(row(f).status,'suspended');assert.equal(reviews(f),before);
});
test('revoked channel evidence between an approval check and its write leaves the program application pending',async t=>{
 const f=await partnerFixture(t),snapshot=await assertPartnerReadyForApproval(f.db,f.brand,{applicationId:f.pending.id,status:'approved'}),before=reviews(f);
 onceBeforeBatch(f.db,()=>f.db.sqlite.prepare("UPDATE media_properties SET status='revoked',revision=revision+1 WHERE user_id=?").run(f.creator.userId));
 await assert.rejects(service(f.db,f.brand).review({applicationId:f.pending.id,status:'approved'},snapshot),fails(409));assert.equal(row(f).status,'pending');assert.equal(reviews(f),before);
});
test('a closed program owner does not offer old applicants promotion links or a new application',async t=>{
 const f=await partnerFixture(t);await closeAccount(f.db,f.brand,'Closing this test business.');const model=await programInvitation(f.db,f.affiliate,f.program.id);
 assert.equal(model.program.ownerClosed,true);assert.equal(model.stage,'closed');assert.equal(model.referralLink,null);await assert.rejects(service(f.db,f.creator).apply({programId:f.program.id}),fails(409));
});

test('a fresh approval snapshot permits the correct partner and refuses reuse for another application',async t=>{
 const f=await partnerFixture(t),snapshot=await assertPartnerReadyForApproval(f.db,f.brand,{applicationId:f.pending.id,status:'approved'});
 await assert.rejects(service(f.db,f.brand).review({applicationId:f.application.id,status:'approved'},snapshot),fails(400));
 const person=await f.add('affiliate','snapshot-partner'),application=await service(f.db,person).apply({programId:f.program.id});await service(f.db,f.brand).review({applicationId:application.id,status:'approved'},await assertPartnerReadyForApproval(f.db,f.brand,{applicationId:application.id,status:'approved'}));assert.equal(row(f,application.id).status,'approved');
 f.db.sqlite.prepare("UPDATE applications SET status='suspended' WHERE id=?").run(application.id);await assert.rejects(service(f.db,f.brand).review({applicationId:f.pending.id,status:'approved'},{...snapshot,partnerId:person.userId}),fails(409));assert.equal(row(f).status,'pending');
});
