import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {database} from './support/db.js';
import {applicationProfile,seedVerifiedProperties} from './support/application-profiles.js';
import {service,AppError} from '../lib/service.ts';
import {admissions} from '../lib/admissions.ts';
import {mediaProperties,mediaPropertiesFor,profileVerificationSummary,reviewMediaProperty} from '../lib/media-properties.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'affimaro-ownership-freshness-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const output=await build({stdin:{contents:"export {MediaManager} from './app/application/media-manager';export {ApplicationForm} from './app/application/application-form';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'});
const filename=join(temp,'views.mjs');writeFileSync(filename,output.outputFiles[0].contents);const {MediaManager,ApplicationForm}=await import(pathToFileURL(filename).href);
const day=86400000,iso=days=>new Date(Date.now()+days*day).toISOString();
const property=changes=>({id:crypto.randomUUID(),user_id:'applicant',kind:'Website',platform:'Website / blog',name:'My publication',url:'https://publisher.example',relationship:'Owner',description:'',audience:'',language:'English',challenge:'affimaro-verify='+'1'.repeat(48),challenge_expires_at:iso(1),method:'dns_txt',status:'verified',proof_url:'',review_note:'',verified_at:iso(-1),last_checked_at:null,revision:2,archived:0,created_at:iso(-200),updated_at:iso(-1),...changes});
const render=properties=>renderToStaticMarkup(createElement(MediaManager,{properties}));
const fails=status=>error=>error instanceof AppError&&error.status===status;

test('old or missing ownership evidence is visibly out of date and offers a fresh code instead of claiming verification',()=>{
 for(const verified_at of [iso(-181),null,'invalid']){
  const p=property({verified_at}),html=render([p]);
  assert.match(html,/0 \/ 1 verified/);assert.match(html,/Verification out of date/);assert.match(html,/Generate a fresh code/);
  assert.ok(!html.includes('Control verified'));assert.ok(!html.includes('Check DNS ownership'));assert.ok(!html.includes('Submit ownership proof'));
  assert.ok(!html.includes(p.challenge),'stale evidence must not present an old code as actionable');
 }
});

test('current ownership stays verified after the original code expires and is not offered an unnecessary reset',()=>{
 const html=render([property({verified_at:iso(-20),challenge_expires_at:iso(-6)})]);
 assert.match(html,/1 \/ 1 verified/);assert.match(html,/Control verified/);
 assert.ok(!html.includes('Generate a fresh code'));assert.ok(!html.includes('Code expired'));assert.ok(!html.includes('Check DNS ownership'));
});

test('expired unverified codes explain renewal and a renewed code restores the appropriate DNS or public-proof controls',()=>{
 for(const kind of ['Website','Social media']){
  const p=property({kind,status:'unverified',verified_at:null,challenge_expires_at:iso(-1)}),expired=render([p]);
  assert.match(expired,/Code expired/);assert.match(expired,/Generate a fresh code/);assert.match(expired,/code has expired/i);
  assert.ok(!expired.includes('Check DNS ownership'));assert.ok(!expired.includes('Submit ownership proof'));assert.ok(!expired.includes(p.challenge));
  const renewed=render([{...p,challenge_expires_at:iso(14),challenge:'affimaro-verify='+'2'.repeat(48),revision:3}]);
  assert.match(renewed,/Submit ownership proof/);assert.equal(renewed.includes('Check DNS ownership'),kind==='Website');assert.ok(!renewed.includes('Generate a fresh code'));
 }
 const revoked=render([property({status:'revoked',verified_at:null})]);
 assert.match(revoked,/Verification was revoked/);assert.match(revoked,/Generate a fresh code/);
 assert.ok(!revoked.includes('Check DNS ownership'));assert.ok(!revoked.includes('Submit ownership proof'));
});

test('all four professional forms count only current evidence in both Channels and final review',()=>{
 const properties=[property({verified_at:iso(-181)}),property({url:'https://second.example'})];
 for(const portal of ['brand','affiliate','creator','agency']){
  const html=renderToStaticMarkup(createElement(ApplicationForm,{portal,revision:4,profile:applicationProfile(portal),properties,resumeChannels:true}));
  assert.match(html,/1 \/ 2 properties verified/);assert.match(html,/1 verified properties ·/);assert.ok(!html.includes('2 verified properties ·'));
 }
});

test('each role renews stale evidence through real services and still needs separate explicit owner profile approval',async t=>{
 for(const portal of ['brand','affiliate','creator','agency']){
  const db=database(t),applicant={userId:'applicant',email:'applicant@example.com'},owner={userId:'owner',email:'owner@example.com'};
  for(const user of [applicant,owner])await service(db,user).saveAccount({name:user.userId+' name'});
  db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,new Date().toISOString());
  const api=admissions(db,applicant),profile=applicationProfile(portal);await api.start(portal);const application=await api.submit({revision:1,profile});
  seedVerifiedProperties(db,applicant.userId,profile);let p=(await mediaPropertiesFor(db,applicant.userId))[0];
  db.sqlite.prepare('UPDATE media_properties SET verified_at=? WHERE id=?').run(iso(-181),p.id);
  assert.equal(profileVerificationSummary(await mediaPropertiesFor(db,applicant.userId),profile).ready,false);
  const decision={userId:applicant.userId,revision:application.revision,decision:'approved',note:''};
  await assert.rejects(admissions(db,owner).review(decision),fails(409));
  const original=p,properties=mediaProperties(db,applicant);p=await properties.renew({id:p.id,revision:p.revision});
  assert.notEqual(p.challenge,original.challenge);assert.equal(p.status,'unverified');assert.equal(p.verified_at,null);
  await assert.rejects(properties.renew({id:original.id,revision:original.revision}),fails(409));
  assert.equal(profileVerificationSummary(await mediaPropertiesFor(db,applicant.userId),profile).ready,false);
  if(portal==='brand'||portal==='agency'){
   const current=p;let lookups=0;
   p=await mediaProperties(db,applicant,async()=>{lookups++;return Response.json({Status:0,Answer:[{name:'_affimaro-verify.'+new URL(current.url).hostname+'.',type:16,data:JSON.stringify(current.challenge)}]});}).verifyDns({id:p.id,revision:p.revision});
   assert.equal(lookups,1);
  }else{
   p=await properties.requestReview({id:p.id,revision:p.revision,proofUrl:p.url,note:'The new code is visible on my exact claimed public property.'});
   const proof={id:p.id,revision:p.revision,decision:'verified',observedCode:p.challenge,evidenceChecked:true,note:'The new code and authorized management have been checked.'};
   await assert.rejects(reviewMediaProperty(db,owner,{...proof,observedCode:original.challenge}),fails(409));
   p=await reviewMediaProperty(db,owner,proof);
  }
  assert.equal(p.status,'verified');assert.equal(profileVerificationSummary(await mediaPropertiesFor(db,applicant.userId),profile).ready,true);
  assert.equal((await api.own()).status,'pending','renewed ownership cannot approve the professional profile');
  assert.equal((await admissions(db,owner).review(decision)).status,'approved');
  for(const table of ['billing_accounts','billing_checkouts','payment_connections','payout_requests'])assert.equal(db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
 }
});
