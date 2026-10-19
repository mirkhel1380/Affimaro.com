import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './support/db.js';
import {applicationProfile,seedVerifiedProperties} from './support/application-profiles.js';
import {admissions,requireApprovedAccount,isPlatformAdmin,getAdmission} from '../lib/admissions.ts';
import {admissionGate} from '../lib/admission-gate.ts';
import {service,AppError} from '../lib/service.ts';
import {accountPortal} from '../lib/portal-policy.ts';
import {verifiedAdmissionBootstrap} from '../self-hosted/preflight.mjs';
const identity=userId=>({userId,email:userId+'@example.com'}),fails=n=>e=>e instanceof AppError&&e.status===n;
const count=(db,table)=>db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n;
async function fixture(t,portal='affiliate'){
  const db=database(t),operator=identity('operator'),applicant=identity('applicant');
  await service(db,operator).saveAccount({name:'Affimaro Owner'});await service(db,applicant).saveAccount({name:'New Applicant'});
  db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(operator.userId,new Date().toISOString());
  const api=admissions(db,applicant),owner=admissions(db,operator);const app=await api.start(portal);
  return {db,operator,applicant,api,owner,app,portal};
}
async function submit(f,profile=applicationProfile(f.portal)){const app=await f.api.own();return f.api.submit({revision:app.revision,profile});}
async function approve(f){const app=await f.api.own();seedVerifiedProperties(f.db,f.applicant.userId,app.profile);return f.owner.review({userId:f.applicant.userId,revision:app.revision,decision:'approved',note:'Reviewed and approved.'});}

test('a verified account needs a complete submitted profile and manual review before either portal is provisioned',async t=>{
  for(const portal of ['brand','affiliate']){
    const f=await fixture(t,portal);assert.equal(await accountPortal(f.db,f.applicant.userId),portal);assert.equal((await f.api.own()).status,'draft');
    for(const table of ['workspaces','programs','affiliate_profiles','applications','billing_accounts','payout_requests'])assert.equal(count(f.db,table),0);
    await assert.rejects(requireApprovedAccount(f.db,f.applicant),fails(403));
    const pending=await submit(f);assert.equal(pending.status,'pending');assert.equal(pending.revision,2);assert.equal(count(f.db,'workspaces'),0);assert.equal(count(f.db,'affiliate_profiles'),0);
    await assert.rejects(requireApprovedAccount(f.db,f.applicant),fails(403));
    const approved=await approve(f);assert.equal(approved.status,'approved');assert.equal((await requireApprovedAccount(f.db,f.applicant)).portal,portal);
    assert.equal(count(f.db,'workspaces'),portal==='brand'?1:0);assert.equal(count(f.db,'programs'),portal==='brand'?1:0);assert.equal(count(f.db,'program_rule_revisions'),portal==='brand'?1:0);assert.equal(count(f.db,'affiliate_profiles'),portal==='affiliate'?1:0);
    for(const table of ['applications','store_connections','bank_profiles','payment_connections','billing_accounts','payout_requests'])assert.equal(count(f.db,table),0,'Approval never performs '+table+' work');
    const profile=applicationProfile(portal);if(portal==='brand'){const w=await service(f.db,f.applicant).workspace();assert.equal(w.name,profile.businessName);assert.equal(w.website,profile.primaryUrl);}else{const p=await service(f.db,f.applicant).profile();assert.equal(p.website,profile.primaryUrl);assert.equal(p.bio,profile.description);}
  }
});

test('required audience/contact/strategy fields, public URLs and declarations cannot be skipped or replaced with authority fields',async t=>{
  const f=await fixture(t);
  for(const change of [{country:''},{phone:'x'},{primaryUrl:'javascript:alert(1)'},{primaryUrl:'https://person:secret@example.com'},{description:'short'},{promotionMethods:[]},{audienceCountries:[]},{authorityConfirmed:false},{dataConfirmed:false},{status:'approved'},{user_id:'operator'},{role:'admin'},{businessName:'Wrong role field'}]){
    await assert.rejects(submit(f,{...applicationProfile(),...change}),fails(400));assert.equal((await f.api.own()).status,'draft');
  }
  assert.equal(count(f.db,'platform_review_events'),0);await submit(f);await assert.rejects(submit(f),fails(409));
  await assert.rejects(f.api.start('brand'),fails(403));assert.equal((await f.api.own()).portal,'affiliate');
});

test('only an explicit platform admin can see other profiles, list queues or approve; ordinary brands and affiliates cannot promote themselves',async t=>{
  const f=await fixture(t);await submit(f);
  for(const actor of [f.applicant,identity('other-brand'),identity('other-affiliate')]){
    if(actor.userId!==f.applicant.userId)await service(f.db,actor).saveAccount({name:'Other account'});
    const api=admissions(f.db,actor);
    await assert.rejects(api.queue(),fails(403));await assert.rejects(api.inspect(f.applicant.userId),fails(403));await assert.rejects(api.review({userId:f.applicant.userId,revision:2,decision:'approved',note:''}),fails(403));
  }
  assert.equal((await f.api.own()).status,'pending');assert.equal((await f.owner.queue()).applications.length,1);
  const inspected=await f.owner.inspect(f.applicant.userId);assert.equal(inspected.application.profile.phone,applicationProfile().phone);assert.equal(inspected.account.email,f.applicant.email);
  assert.ok(!JSON.stringify(inspected).includes('transition_id'));assert.ok(!JSON.stringify(inspected).includes('profile_json'));
});

test('requests for information and rejection need a message; applicants can correct and resubmit without opening a portal',async t=>{
  const f=await fixture(t,'brand');let app=await submit(f);
  await assert.rejects(f.owner.review({userId:f.applicant.userId,revision:app.revision,decision:'rejected',note:''}),fails(400));
  await f.owner.review({userId:f.applicant.userId,revision:app.revision,decision:'changes_requested',note:'Please explain your recruitment strategy and website ownership.'});
  app=await f.api.own();assert.equal(app.status,'changes_requested');assert.match(app.review_note,/recruitment/);await assert.rejects(requireApprovedAccount(f.db,f.applicant),fails(403));
  app=await submit(f,{...applicationProfile('brand'),promotionPlan:'We will invite selected software tutorial publishers and provide accurate program details. We will review each partner before sharing live referral links.'});
  assert.equal(app.status,'pending');assert.equal(app.review_note,'');await f.owner.review({userId:f.applicant.userId,revision:app.revision,decision:'rejected',note:'The current business activity is not a suitable fit for this pilot.'});
  assert.equal((await f.api.own()).status,'rejected');assert.equal(count(f.db,'workspaces'),0);await submit(f);await approve(f);assert.equal(count(f.db,'workspaces'),1);
  assert.deepEqual((await f.api.history()).map(x=>x.action).reverse(),['submitted','changes_requested','submitted','rejected','submitted','approved']);
});

test('a stale review or withdrawn application never receives approval or partial provisioning',async t=>{
  const f=await fixture(t,'brand'),pending=await submit(f);const batch=f.db.batch.bind(f.db);let interleave=true;
  f.db.batch=async statements=>{if(interleave){interleave=false;await f.api.edit({revision:pending.revision});}return batch(statements);};
  await assert.rejects(approve(f),fails(409));assert.equal((await f.api.own()).status,'draft');assert.equal(count(f.db,'workspaces'),0);assert.equal(count(f.db,'programs'),0);assert.equal(count(f.db,'platform_review_events'),2);
  const newest=await submit(f);await assert.rejects(f.owner.review({userId:f.applicant.userId,revision:pending.revision,decision:'approved',note:''}),fails(409));
  await approve(f);await assert.rejects(f.owner.review({userId:f.applicant.userId,revision:newest.revision,decision:'approved',note:''}),fails(409));assert.equal(count(f.db,'workspaces'),1);assert.equal(count(f.db,'programs'),1);
});

test('a database failure rolls back approval, reviewer audit and workspace creation together',async t=>{
  const f=await fixture(t,'brand'),pending=await submit(f),events=count(f.db,'platform_review_events');
  f.db.sqlite.exec("CREATE TRIGGER fail_admission_workspace BEFORE INSERT ON workspaces BEGIN SELECT RAISE(ABORT,'fixture write failure'); END;");
  await assert.rejects(approve(f));assert.equal((await f.api.own()).status,'pending');assert.equal((await f.api.own()).revision,pending.revision);assert.equal(count(f.db,'platform_review_events'),events);assert.equal(count(f.db,'workspaces'),0);assert.equal(count(f.db,'programs'),0);
  f.db.sqlite.exec('DROP TRIGGER fail_admission_workspace');await approve(f);assert.equal((await f.api.own()).status,'approved');
});

test('pending/declined accounts can open their application but no private pages, exports or writes; only the owner enters review',async t=>{
  const f=await fixture(t),request=(path,method='GET')=>new Request('https://affimaro.example'+path,{method});
  for(const status of ['draft','pending','changes_requested','rejected']){
    f.db.sqlite.prepare('UPDATE platform_applications SET status=?').run(status);
    for(const path of ['/workspace','/partner','/account','/start','/payments?view=affiliate','/reports','/billing']){const blocked=await admissionGate(request(path),f.db,f.applicant);assert.equal(blocked.status,307);assert.match(blocked.headers.get('location'),/^\/application\?return_to=/);assert.match(blocked.headers.get('cache-control'),/no-store/);}
    for(const [path,method] of [['/api/account','POST'],['/api/business','POST'],['/api/affiliate','POST'],['/api/applications','POST'],['/api/reports/export','GET'],['/api/payments/export','GET'],['/workspace','POST']])assert.equal((await admissionGate(request(path,method),f.db,f.applicant)).status,403);
    assert.equal(await admissionGate(request('/application'),f.db,f.applicant),null);assert.equal(await admissionGate(request('/api/application','POST'),f.db,f.applicant),null);
    assert.equal((await admissionGate(request('/admin/applications'),f.db,f.applicant)).status,403);assert.equal((await admissionGate(request('/api/admin/applications','POST'),f.db,f.applicant)).status,403);
    assert.equal(await admissionGate(request('/admin/applications'),f.db,f.operator),null);
  }
  f.db.sqlite.prepare("UPDATE platform_applications SET status='approved'").run();assert.equal(await admissionGate(request('/partner'),f.db,f.applicant),null);
});

test('bootstrap grants only the established owner mapping, preserves original data, and never changes later review decisions',async t=>{
  const db=database(t),ownerId='sRqRHPT8wXYPGznd4Is1WagNk0865sViN9Ol8JZ3HBU0cBVOsDYjzR',providerId='0bc66b4f-f700-443b-ad8c-1967b4189c43',owner=service(db,identity(ownerId)),other=service(db,{userId:'similar-email',email:identity(ownerId).email});
  await owner.saveAccount({name:'Original Owner'});const w=await owner.createBusiness({name:'Original Brand',website:'https://original.example'}),p=(await owner.businessDashboard()).program;
  db.sqlite.prepare("INSERT INTO affiliate_profiles VALUES (?,'Historical profile','Other',NULL,'Preserved',?)").run(ownerId,new Date().toISOString());db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(providerId,ownerId,new Date().toISOString());
  await other.saveAccount({name:'Same-looking Owner'});await other.createBusiness({name:'Another Brand',website:''});
  const sql=readFileSync(new URL('../self-hosted/admission-bootstrap.sql',import.meta.url),'utf8');db.sqlite.exec(sql);
  assert.equal(await isPlatformAdmin(db,ownerId),true);assert.equal(await isPlatformAdmin(db,'similar-email'),false);assert.equal((await getAdmission(db,ownerId)).status,'approved');assert.equal((await getAdmission(db,'similar-email')).status,'draft');
  assert.equal((await owner.workspace()).id,w.id);assert.equal((await owner.businessDashboard()).program.id,p.id);assert.equal(count(db,'affiliate_profiles'),1);assert.equal(count(db,'billing_accounts'),0);assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  db.sqlite.prepare("UPDATE platform_applications SET status='rejected',review_note='Owner decision preserved' WHERE user_id='similar-email'").run();db.sqlite.exec(sql);assert.equal((await getAdmission(db,'similar-email')).status,'rejected');assert.equal(count(db,'platform_admins'),1);assert.equal(count(db,'workspaces'),2);
  const settings={accountId:'trusted-account',databaseId:'trusted-database'},fetcher=async(url,init)=>{assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/trusted-account/d1/database/trusted-database/query');assert.equal(init.headers.Authorization,'Bearer FIXTURE_DEPLOY_TOKEN');assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.match(body.sql,/^SELECT EXISTS/);return Response.json({success:true,result:[{success:true,results:db.sqlite.prepare(body.sql).all(...body.params)}]});};
  await verifiedAdmissionBootstrap(settings,'FIXTURE_DEPLOY_TOKEN',fetcher);
  db.sqlite.prepare("UPDATE platform_applications SET status='draft' WHERE user_id=?").run(ownerId);await assert.rejects(verifiedAdmissionBootstrap(settings,'FIXTURE_DEPLOY_TOKEN',fetcher),/review access could not be confirmed/);
});
