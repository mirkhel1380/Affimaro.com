import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce} from '../lib/woocommerce.ts';
import {gettingStarted} from '../lib/getting-started.ts';

const identity=userId=>({userId,email:userId+'@example.com'});
const status=(result,role,id)=>result[role].steps.find(step=>step.id===id).status;
async function owner(db,id){const s=service(db,identity(id));await s.saveAccount({name:id});await s.createBusiness({name:id+' shop',website:''});return {s,...await s.businessDashboard()};}
async function partner(db,id,program){const s=service(db,identity(id));await s.saveAccount({name:id});await s.saveAffiliate({name:id,channel:'Blog',website:'',bio:''});return {s,...await s.apply({programId:program})};}
async function store(db,id){return (await commerce(db,identity(id)).configure({action:'connect',storeUrl:'https://'+id+'.example'})).connection;}
function verifyStore(db,connection){db.sqlite.prepare('UPDATE store_connections SET last_seen=? WHERE id=?').run(new Date().toISOString(),connection.id);}
function order(db,connection,application){
  const referral=crypto.randomUUID(),id=crypto.randomUUID(),at=new Date().toISOString();
  db.sqlite.prepare('INSERT INTO referrals (id,store_id,application_id,rate_bps,created_at,expires_at) VALUES (?,?,?,1000,?,?)').run(referral,connection.id,application.id,at,'2030-01-01T00:00:00.000Z');
  db.sqlite.prepare("INSERT INTO orders (id,store_id,referral_id,application_id,external_id,revision,currency,decimals,basis,refunded_basis,rate_bps,commission,status,commission_state,needs_review,created_at,received_at) VALUES (?,?,?,?,?,1,'USD',2,10000,0,1000,0,'pending','ineligible',0,?,?)").run(id,connection.id,referral,application.id,id,at,at);
}

test('a fresh account has actionable steps without creating a workspace, subscription or payment',async t=>{
  const db=database(t);let result=await gettingStarted(db,identity('new-user'));
  assert.equal(result.business.completed,0);assert.equal(result.affiliate.completed,0);assert.equal(result.business.next.href,'/account');assert.equal(result.affiliate.next.href,'/account');
  await service(db,identity('new-user')).saveAccount({name:'New user'});result=await gettingStarted(db,identity('new-user'));
  assert.equal(result.business.completed,1);assert.equal(result.business.next.href,'/workspace');assert.equal(result.affiliate.completed,1);assert.equal(result.affiliate.next.href,'/partner');
  for(const table of ['workspaces','billing_accounts','payout_requests'])assert.equal(db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
  await assert.rejects(gettingStarted(db,{userId:'',email:''}),error=>error instanceof AppError&&error.status===401);
});

test('business progress distinguishes starting rules, a saved connection, signed verification and an actual attributed order',async t=>{
  const db=database(t),business=await owner(db,'owner-one');let result=await gettingStarted(db,identity('owner-one'));
  assert.equal(result.business.completed,2);assert.equal(status(result,'business','program'),'todo');
  await business.s.saveProgram({name:'Reviewed program',rate:12.5,windowDays:30,active:true});const connection=await store(db,'owner-one');
  result=await gettingStarted(db,identity('owner-one'));assert.equal(status(result,'business','program'),'complete');assert.equal(status(result,'business','store'),'todo');assert.equal(status(result,'business','order'),'todo');
  verifyStore(db,connection);const application=await partner(db,'partner-one',business.program.id);await business.s.review({applicationId:application.id,status:'approved'});
  result=await gettingStarted(db,identity('owner-one'));assert.equal(result.business.completed,5);assert.equal(result.business.next.id,'order');
  order(db,connection,application);result=await gettingStarted(db,identity('owner-one'));assert.equal(result.business.completed,6);assert.equal(result.business.next,null);
  await business.s.saveProgram({name:'Reviewed program',rate:12.5,windowDays:30,active:false});await commerce(db,identity('owner-one')).configure({action:'disconnect'});
  result=await gettingStarted(db,identity('owner-one'));assert.equal(status(result,'business','program'),'todo');assert.equal(status(result,'business','store'),'todo');assert.equal(status(result,'business','order'),'complete');assert.equal(result.business.completed,4);
  assert.match(result.business.steps.find(step=>step.id==='order').detail,/status, commission and refund/);
});

test('another business’s setup and another affiliate’s orders cannot complete the current user’s steps',async t=>{
  const db=database(t),a=await owner(db,'owner-one'),b=await owner(db,'owner-two'),p1=await partner(db,'partner-one',a.program.id),p2=await partner(db,'partner-two',b.program.id);
  await b.s.saveProgram({name:'Other private program',rate:10,windowDays:30,active:true});await b.s.review({applicationId:p2.id,status:'approved'});
  const connection=await store(db,'owner-two');verifyStore(db,connection);order(db,connection,p2);
  db.sqlite.prepare('UPDATE store_connections SET signing_key=? WHERE id=?').run('PRIVATE_SIGNING_KEY_MUST_NOT_APPEAR',connection.id);
  const first=await gettingStarted(db,identity('owner-one')),second=await gettingStarted(db,identity('partner-one'));
  assert.equal(first.business.completed,2);assert.equal(first.programId,a.program.id);assert.equal(status(first,'business','partner'),'todo');assert.equal(status(first,'business','order'),'todo');
  assert.equal(status(second,'affiliate','order'),'todo');assert.equal(status(second,'affiliate','link'),'waiting');assert.ok(!JSON.stringify(first).includes('owner-two'));assert.ok(!JSON.stringify(second).includes('partner-two'));
  const other=await gettingStarted(db,identity('owner-two'));assert.ok(!JSON.stringify(other).includes('PRIVATE_SIGNING_KEY'));assert.equal(status(other,'business','order'),'complete');
  assert.equal(p1.status,'pending');
});

test('affiliate referral readiness follows current approval, program and verified store eligibility',async t=>{
  const db=database(t),business=await owner(db,'owner-one'),application=await partner(db,'partner-one',business.program.id);
  let result=await gettingStarted(db,identity('partner-one'));assert.equal(result.affiliate.completed,3);assert.equal(result.affiliate.next.id,'link');assert.equal(result.affiliate.next.status,'waiting');
  await business.s.review({applicationId:application.id,status:'approved'});const connection=await store(db,'owner-one');
  result=await gettingStarted(db,identity('partner-one'));assert.equal(status(result,'affiliate','link'),'waiting');
  verifyStore(db,connection);result=await gettingStarted(db,identity('partner-one'));assert.equal(result.affiliate.completed,4);assert.equal(result.affiliate.next.id,'order');
  order(db,connection,application);result=await gettingStarted(db,identity('partner-one'));assert.equal(result.affiliate.completed,5);assert.equal(result.affiliate.next,null);
  await business.s.saveProgram({name:'Paused program',rate:10,windowDays:30,active:false});result=await gettingStarted(db,identity('partner-one'));assert.equal(status(result,'affiliate','link'),'waiting');
  await business.s.review({applicationId:application.id,status:'suspended'});result=await gettingStarted(db,identity('partner-one'));assert.equal(status(result,'affiliate','link'),'todo');assert.equal(status(result,'affiliate','application'),'complete');
});

test('loading either guide executes only reads and never retrieves store or financial secrets',async t=>{
  const db=database(t);await owner(db,'owner-one');const queries=[];
  const readOnly={prepare(query){assert.match(query.trim(),/^SELECT\b/i);assert.ok(!/signing_key|encrypted_|bank_profiles|payment_connections|billing_accounts|payout_requests/i.test(query));queries.push(query);return db.prepare(query);}};
  const before=db.sqlite.prepare('SELECT total_changes() n').get().n;
  const result=await gettingStarted(readOnly,identity('owner-one'));assert.equal(result.business.completed,2);assert.equal(db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.ok(queries.length>0);
});
