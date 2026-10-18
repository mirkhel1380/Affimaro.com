import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {assertSameOrigin,readJson} from '../lib/request.ts';

function user(db,id){return service(db,{userId:id,email:`${id}@example.com`});}
async function business(db,id){const s=user(db,id);await s.saveAccount({name:id+' Owner'});await s.createBusiness({name:id+' Store',website:'https://'+id+'.example'});return s;}
async function affiliate(db,id){const s=user(db,id);await s.saveAccount({name:id+' Partner'});await s.saveAffiliate({name:id+' Partner',channel:'Newsletter',website:'https://'+id+'.example',bio:'A sample audience used only in this isolated test.'});return s;}
const status=expected=>error=>error instanceof AppError&&error.status===expected;

test('database starts empty; account and business survive new service instances without demo data',async t=>{
  const db=database(t);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM accounts').get().n,0);
  const s=await business(db,'alice'),again=user(db,'alice');
  assert.equal((await again.account()).display_name,'alice Owner');
  const saved=await again.businessDashboard();assert.equal(saved.business.name,'alice Store');assert.equal(saved.program.rate_bps,1000);assert.equal(saved.partners.length,0);assert.equal(saved.activity.length,1);
  assert.equal((await s.createBusiness({name:'Another Name',website:''})).id,saved.business.id);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM workspaces').get().n,1);
});
test('profiles derive identity from the server and reject client-supplied owner identifiers',async t=>{
  const db=database(t),alice=user(db,'alice'),bob=user(db,'bob');
  await alice.saveAccount({name:'Alice'});await bob.saveAccount({name:'Bob'});
  await assert.rejects(alice.saveAccount({name:'Pretend Bob',userId:'bob'}),status(400));
  await assert.rejects(alice.createBusiness({name:'Store',website:'',ownerId:'bob'}),status(400));
  assert.equal((await bob.account()).display_name,'Bob');
  assert.throws(()=>service(db,{userId:'',email:''}),status(401));
});
test('workspace creation is atomic when program creation fails',async t=>{
  const db=database(t),s=user(db,'alice');await s.saveAccount({name:'Alice'});
  db.sqlite.exec("CREATE TRIGGER fail_program BEFORE INSERT ON programs BEGIN SELECT RAISE(ABORT,'test failure'); END");
  await assert.rejects(s.createBusiness({name:'Store',website:''}),/test failure/);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM workspaces').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM audit_events').get().n,0);
  db.sqlite.exec('DROP TRIGGER fail_program');await s.createBusiness({name:'Store',website:''});assert.ok(await s.workspace());
});
test('business dashboards and review actions are isolated between two owners',async t=>{
  const db=database(t),alice=await business(db,'alice'),bob=await business(db,'bob'),sam=await affiliate(db,'sam');
  const a=(await alice.businessDashboard()).program,b=(await bob.businessDashboard()).program;
  const application=await sam.apply({programId:a.id});await sam.apply({programId:b.id});
  assert.equal((await alice.businessDashboard()).partners.length,1);assert.equal((await bob.businessDashboard()).partners.length,1);
  await assert.rejects(bob.review({applicationId:application.id,status:'approved'}),status(404));
  await assert.rejects(sam.review({applicationId:application.id,status:'approved'}),status(404));
  await alice.review({applicationId:application.id,status:'approved'});
  const memberships=(await sam.partnerDashboard()).memberships;
  assert.equal(memberships.find(m=>m.program_id===a.id).status,'approved');assert.equal(memberships.find(m=>m.program_id===b.id).status,'pending');
  assert.equal((await user(db,'unknown').partnerDashboard()).memberships.length,0);
});
test('applications are idempotent, paused programs reject new applicants, and owners cannot self-apply',async t=>{
  const db=database(t),owner=await business(db,'owner'),sam=await affiliate(db,'sam');
  const p=(await owner.businessDashboard()).program;
  const first=await sam.apply({programId:p.id});await owner.review({applicationId:first.id,status:'approved'});
  const duplicate=await sam.apply({programId:p.id});assert.equal(duplicate.id,first.id);assert.equal(duplicate.status,'approved');
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM applications').get().n,1);
  await owner.saveProgram({name:'Paused',rate:12.5,windowDays:45,active:false});const other=await affiliate(db,'other');
  await assert.rejects(other.apply({programId:p.id}),status(409));
  await assert.rejects(owner.saveAffiliate({name:'Owner Partner',channel:'Blog',website:'',bio:''}),status(403));
  await owner.saveProgram({name:'Open again',rate:10,windowDays:30,active:true});
  await assert.rejects(owner.apply({programId:p.id}),status(403));
});
test('invalid rules and unsafe URLs cannot mutate saved records; SQL values stay bound',async t=>{
  const db=database(t),s=await business(db,'alice'),before=(await s.businessDashboard()).program;
  for(const input of [{name:'Rules',rate:50.001,windowDays:30,active:true},{name:'Rules',rate:10,windowDays:91,active:true},{name:'Rules',rate:10,windowDays:30,active:true,workspaceId:'other'}])await assert.rejects(s.saveProgram(input),status(400));
  assert.equal((await s.businessDashboard()).program.rate_bps,before.rate_bps);
  await assert.rejects(s.saveAffiliate({name:'Alice',channel:'Blog',website:'javascript:alert(1)',bio:''}),status(400));
  await s.saveAccount({name:"Alice'; DROP TABLE accounts;--"});assert.ok(await s.account());
  await s.saveProgram({name:'Rules',rate:12.35,windowDays:45,active:true});assert.equal((await s.businessDashboard()).program.rate_bps,1235);
});
test('affiliate profile edits affect only the current user',async t=>{
  const db=database(t),alice=await affiliate(db,'alice'),bob=await affiliate(db,'bob');
  await alice.saveAffiliate({name:'Updated Alice',channel:'Blog',website:'',bio:'Changed'});
  assert.equal((await bob.profile()).display_name,'bob Partner');assert.equal((await alice.profile()).display_name,'Updated Alice');
});
test('business edits update only the current owner’s workspace and record an audit event',async t=>{
  const db=database(t),alice=await business(db,'alice'),bob=await business(db,'bob');
  await alice.saveBusiness({name:'Alice New Store',website:'https://new.example'});
  assert.equal((await alice.workspace()).name,'Alice New Store');assert.equal((await bob.workspace()).name,'bob Store');
  assert.equal((await alice.businessDashboard()).activity[0].action,'workspace_updated');
  await assert.rejects(alice.saveBusiness({name:'Bad',website:'',ownerId:'bob'}),status(400));
});
test('cross-site, missing-origin and non-JSON writes are rejected',()=>{
  const url='https://affimaro.example/api/account';
  const request=headers=>new Request(url,{method:'POST',headers,body:'{}'});
  assert.doesNotThrow(()=>assertSameOrigin(request({origin:'https://affimaro.example','content-type':'application/json; charset=utf-8'})));
  assert.throws(()=>assertSameOrigin(request({'content-type':'application/json'})),status(403));
  assert.throws(()=>assertSameOrigin(request({origin:'https://other.example','content-type':'application/json'})),status(403));
  assert.throws(()=>assertSameOrigin(request({origin:'https://affimaro.example','content-type':'text/plain'})),status(415));
  assert.throws(()=>assertSameOrigin(request({origin:'https://affimaro.example','content-type':'application/json','sec-fetch-site':'cross-site'})),status(403));
});
test('JSON bodies are size-limited in bytes and malformed JSON is handled',async()=>{
  const request=body=>new Request('https://affimaro.example/api/account',{method:'POST',body});
  assert.deepEqual(await readJson(request('{"name":"Alice"}')),{name:'Alice'});
  await assert.rejects(readJson(request('{broken')),status(400));
  await assert.rejects(readJson(request(JSON.stringify({name:'a'.repeat(17000)}))),status(413));
  await assert.rejects(readJson(request(JSON.stringify({name:'🌿'.repeat(5000)}))),status(413));
});
