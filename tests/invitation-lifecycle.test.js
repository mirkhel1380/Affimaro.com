import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {discovery} from '../lib/discovery.ts';
import {service,AppError} from '../lib/service.ts';
import {relationshipWorkspace} from '../lib/relationships.ts';
const fails=status=>error=>error instanceof AppError&&error.status===status;
const note='Please review our represented program and decide whether you would like to apply.';
const invitation=(f,id)=>f.db.sqlite.prepare('SELECT * FROM discovery_invitations WHERE id=?').get(id);
const acceptedAudits=f=>f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='program_invitation_accepted'").get().n;
const beforeBatch=(db,operation)=>{const original=db.batch.bind(db);let once=true;db.batch=async statements=>{if(once){once=false;await operation();}return original(statements);};};
function beforeInviteWrite(db,operation){const original=db.prepare.bind(db);let once=true;db.prepare=query=>{const wrap=statement=>({bind(...args){return wrap(statement.bind(...args));},first:()=>statement.first(),all:()=>statement.all(),async run(){if(once&&query.startsWith('INSERT INTO discovery_invitations')){once=false;await operation();}return statement.run();}});return wrap(original(query));};}

test('an older invitation cannot undo a newer declined or suspended program decision',async t=>{
 for(const decision of ['rejected','suspended']){const f=await partnerFixture(t),api=discovery(f.db,f.agency),invite=await api.invite({targetId:f.creator.userId,note}),program=(await service(f.db,f.agency).businessDashboard()).program;f.db.sqlite.prepare('UPDATE discovery_invitations SET created_at=? WHERE id=?').run(new Date(Date.now()-60000).toISOString(),invite.id);const application=await service(f.db,f.creator).apply({programId:program.id});await service(f.db,f.agency).review({applicationId:application.id,status:decision});const before=acceptedAudits(f);
  await assert.rejects(discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(application.id).status,decision);assert.equal(invitation(f,invite.id).status,'pending');assert.equal(acceptedAudits(f),before);
 }
});
test('a program paused before invitation insertion creates neither an invitation nor a misleading quota error',async t=>{
 const f=await partnerFixture(t);beforeInviteWrite(f.db,()=>f.db.sqlite.prepare('UPDATE programs SET active=0 WHERE workspace_id=(SELECT id FROM workspaces WHERE owner_id=?)').run(f.agency.userId));await assert.rejects(discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM discovery_invitations').get().n,0);
});
test('channel evidence revoked during acceptance cannot create a pending application or accepted invitation',async t=>{
 const f=await partnerFixture(t),invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),before=acceptedAudits(f);beforeBatch(f.db,()=>f.db.sqlite.prepare("UPDATE media_properties SET status='revoked',revision=revision+1 WHERE user_id=?").run(f.creator.userId));await assert.rejects(discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'}),fails(409));assert.equal(invitation(f,invite.id).status,'pending');assert.equal((await service(f.db,f.creator).partnerDashboard()).memberships.length,1);assert.equal(acceptedAudits(f),before);
});
test('sender verification changing before invitation insertion cannot create a new invitation',async t=>{
 const f=await partnerFixture(t);beforeInviteWrite(f.db,()=>f.db.sqlite.prepare("UPDATE media_properties SET status='revoked',revision=revision+1 WHERE user_id=?").run(f.agency.userId));await assert.rejects(discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM discovery_invitations').get().n,0);
});
test('invitation history includes its own current program application without leaking another program',async t=>{
 const f=await partnerFixture(t),invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.creator).apply({programId:program.id});await service(f.db,f.agency).review({applicationId:application.id,status:'approved'});const received=(await relationshipWorkspace(f.db,f.creator,{tab:'invitations'})).invitations[0];assert.equal(received.id,invite.id);assert.equal(received.application_id,application.id);assert.equal(received.application_status,'approved');assert.equal(received.program_active,1);assert.equal((await relationshipWorkspace(f.db,f.brand,{tab:'invitations'})).total,0);
});

test('a fresh invitation after a decision reuses the application and only reopens it for review',async t=>{
 for(const status of ['rejected','suspended']){
  const f=await partnerFixture(t),program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.creator).apply({programId:program.id});
  await service(f.db,f.agency).review({applicationId:application.id,status});
  const previous=new Date(Date.now()+1000).toISOString();f.db.sqlite.prepare('UPDATE applications SET updated_at=? WHERE id=?').run(previous,application.id);
  const invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note});assert.ok(invitation(f,invite.id).created_at>previous);
  const result=await discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'});
  assert.equal(result.application.id,application.id);assert.equal(result.application.status,'pending');assert.equal(invitation(f,invite.id).status,'accepted');
  const row=f.db.sqlite.prepare('SELECT * FROM applications WHERE id=?').get(application.id);assert.ok(row.updated_at>invitation(f,invite.id).created_at);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications WHERE program_id=? AND affiliate_user_id=?').get(program.id,f.creator.userId).n,1);
 }
});

test('decisions remain newer than their pending invitation even with a fixed request clock',async t=>{
 const f=await partnerFixture(t),clock=Date.now();t.mock.method(Date,'now',()=>clock);
 const invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.creator).apply({programId:program.id});
 await service(f.db,f.agency).review({applicationId:application.id,status:'rejected'});
 assert.ok(f.db.sqlite.prepare('SELECT updated_at FROM applications WHERE id=?').get(application.id).updated_at>invitation(f,invite.id).created_at);
 const inbox=await relationshipWorkspace(f.db,f.creator,{tab:'invitations'});assert.equal(inbox.invitations[0].superseded,1);
 await assert.rejects(discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'}),fails(409));
});

test('acknowledging an invitation preserves an already pending or approved application',async t=>{
 for(const status of ['pending','approved']){
  const f=await partnerFixture(t),invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.creator).apply({programId:program.id});
  if(status==='approved')await service(f.db,f.agency).review({applicationId:application.id,status});
  const result=await discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'});assert.equal(result.application.id,application.id);assert.equal(result.application.status,status);assert.equal(acceptedAudits(f),1);
  await assert.rejects(discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'}),fails(409));assert.equal(acceptedAudits(f),1);
 }
});

test('an application submitted during invite insertion blocks the stale invite with a conflict',async t=>{
 const f=await partnerFixture(t),program=(await service(f.db,f.agency).businessDashboard()).program;
 beforeInviteWrite(f.db,()=>service(f.db,f.creator).apply({programId:program.id}));
 await assert.rejects(discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM discovery_invitations').get().n,0);
});

test('the real daily invitation limit still returns a quota response',async t=>{
 const f=await partnerFixture(t),program=(await service(f.db,f.agency).businessDashboard()).program,at=new Date().toISOString(),insert=f.db.sqlite.prepare("INSERT INTO discovery_invitations(id,sender_id,recipient_id,program_id,note,status,created_at,updated_at) VALUES(?,?,?,?,?,'declined',?,?)");
 for(let i=0;i<20;i++)insert.run(crypto.randomUUID(),f.agency.userId,f.creator.userId,program.id,note,at,at);
 await assert.rejects(discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),fails(429));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM discovery_invitations').get().n,20);
});

test('an audit failure rolls back both invitation acceptance and the new program application',async t=>{
 const f=await partnerFixture(t),invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note}),before=f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n;
 f.db.sqlite.exec("CREATE TRIGGER fail_invitation_audit BEFORE INSERT ON audit_events WHEN NEW.action='program_invitation_accepted' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
 await assert.rejects(discovery(f.db,f.creator).respond({id:invite.id,decision:'accepted'}),/fixture audit failure/);
 assert.equal(invitation(f,invite.id).status,'pending');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,before);assert.equal(acceptedAudits(f),0);
});
