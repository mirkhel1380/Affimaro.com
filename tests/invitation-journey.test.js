import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement,isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce} from '../lib/woocommerce.ts';
import {programInvitation} from '../lib/program-invitation.ts';

// Compile the real TSX view for isolated server rendering without a preview.
// Its unused Next dispatch imports have no role in this pure presentation test.
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');
mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'affimaro-invitation-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const output=await build({stdin:{contents:"export {Shell} from './app/ui'; export {InvitationView} from './app/join/invitation-view'; export {ApiForm,ActionButton,CopyButton} from './app/forms';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'unused-dispatch-imports',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},args=>({path:args.path,external:true,sideEffects:false}));}}]});
const filename=join(temp,'view.mjs');writeFileSync(filename,output.outputFiles[0].contents);
const {Shell,InvitationView,ApiForm,ActionButton,CopyButton}=await import(pathToFileURL(filename).href);
const clientComponents=new Set([ApiForm,ActionButton,CopyButton]);
function instances(node,type,result=[]){
  if(Array.isArray(node)){for(const child of node)instances(child,type,result);return result;}
  if(!isValidElement(node))return result;
  if(node.type===type)result.push(node.props);
  else if(typeof node.type==='function'&&!clientComponents.has(node.type))instances(node.type(node.props),type,result);
  else instances(node.props.children,type,result);
  return result;
}
const identity=userId=>({userId,email:userId+'@example.com'}),fails=n=>error=>error instanceof AppError&&error.status===n;
const profile={name:'Example Partner',channel:'Blog',website:'https://partner.example',bio:'A newsletter about tools.'};
async function fixture(t){
  const db=database(t),owner=service(db,identity('owner')),partner=service(db,identity('partner'));
  await owner.saveAccount({name:'Owner'});await owner.createBusiness({name:'Example Business',website:'https://business.example'});
  const program=(await owner.businessDashboard()).program;
  return {db,owner,partner,program,model:()=>programInvitation(db,identity('partner'),program.id)};
}
async function view(f,extra={}){
  const model=await f.model(),element=createElement(InvitationView,{invitation:model,user:{email:'partner@example.com',fullName:'New Partner'},independent:true,...extra});
  return {model,element,html:renderToStaticMarkup(element)};
}
async function apply(f){await f.partner.saveAccount({name:'Partner'});await f.partner.saveAffiliate(profile);return f.partner.apply({programId:f.program.id});}
async function verify(f,platform='woocommerce'){
  const configured=await commerce(f.db,identity('owner')).configure({action:'connect',platform:platform==='shopify'?'woocommerce':platform,storeUrl:'https://store.example/shop'});
  f.db.sqlite.prepare('UPDATE store_connections SET last_seen=?,platform=? WHERE id=?').run(new Date().toISOString(),platform,configured.connection.id);
  return configured;
}

test('real dashboard shells expose only their matching portal navigation',()=>{
  for(const portal of ['brand','affiliate']){
    const html=renderToStaticMarkup(createElement(Shell,{portal,name:'Example',email:'example@example.com',active:'account'},'Saved account'));
    assert.match(html,new RegExp('data-portal="'+portal+'"'));
    assert.match(html,new RegExp(portal==='brand'?'BRAND PORTAL':'AFFILIATE PORTAL'));
    assert.ok(!html.includes('role-select'));assert.ok(!html.includes('Switch role'));
    if(portal==='brand'){
      assert.match(html,/href="\/workspace"/);assert.match(html,/href="\/billing"/);assert.ok(!html.includes('href="/partner"'));assert.ok(!html.includes('?view=affiliate'));
    }else{
      assert.match(html,/href="\/partner"/);assert.ok(!html.includes('href="/workspace"'));assert.ok(!html.includes('href="/billing"'));assert.ok(!html.includes('?view=business'));
    }
  }
});

test('invitation keeps account and affiliate profile setup on its own canonical application path',async t=>{
  const f=await fixture(t),path='/join/'+f.program.id;
  let result=await view(f);assert.equal(result.model.stage,'account');
  let forms=instances(result.element,ApiForm);assert.equal(forms.length,1);assert.equal(forms[0].endpoint,'/api/account');assert.equal(forms[0].redirectTo,path);
  assert.equal(instances(result.element,ActionButton).length,0);assert.match(result.html,/Saving your account does not send an application/);
  await f.partner.saveAccount({name:'Partner'});result=await view(f);assert.equal(result.model.stage,'profile');
  forms=instances(result.element,ApiForm);assert.equal(forms.length,1);assert.equal(forms[0].endpoint,'/api/affiliate');assert.equal(forms[0].redirectTo,path);
  assert.deepEqual(forms[0].fields.map(field=>field.name),['name','channel','website','bio']);assert.match(result.html,/Save profile and continue/);
  assert.equal(instances(result.element,ActionButton).length,0);assert.ok(!result.html.includes('return to this application link'));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,0);
});

test('saving or editing a profile never applies; the separate application action is explicit and duplicate-safe',async t=>{
  const f=await fixture(t);await f.partner.saveAccount({name:'Partner'});await f.partner.saveAffiliate(profile);
  let result=await view(f);assert.equal(result.model.stage,'apply');assert.equal(result.model.completed,2);
  const [action]=instances(result.element,ActionButton);assert.deepEqual(action.body,{programId:f.program.id});assert.equal(action.method,'POST');assert.equal(action.returnTo,result.model.path);
  const [edit]=instances(result.element,ApiForm);assert.equal(edit.redirectTo,result.model.path);assert.match(result.html,/does not require a business subscription/);
  await f.partner.saveAffiliate({...profile,bio:'Updated audience'});assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,0);
  const application=await f.partner.apply(action.body);result=await view(f);assert.equal(result.model.stage,'pending');assert.equal(result.model.completed,3);
  assert.equal(instances(result.element,ActionButton).length,0);assert.equal(instances(result.element,ApiForm).length,0);assert.match(result.html,/business is reviewing your application/);
  assert.equal((await f.partner.apply(action.body)).id,application.id);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,1);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_accounts').get().n,0);
});

test('business owners cannot apply to themselves and see the correct invitation sharing guidance',async t=>{
  const f=await fixture(t),model=await programInvitation(f.db,identity('owner'),f.program.id);
  const render=independent=>createElement(InvitationView,{invitation:model,user:{email:'owner@example.com',fullName:null},independent});
  assert.equal(model.stage,'owner');assert.equal(instances(render(true),ApiForm).length,0);assert.equal(instances(render(true),ActionButton).length,0);
  assert.equal(instances(render(true),CopyButton)[0].path,model.path);assert.match(renderToStaticMarkup(render(true)),/sign in with their own account/);assert.match(renderToStaticMarkup(render(false)),/access to this private pilot/);
  await assert.rejects(f.owner.saveAffiliate(profile),fails(403));await assert.rejects(f.owner.apply({programId:f.program.id}),fails(403));
});

test('paused programs have no setup or Apply controls, while existing application status remains visible',async t=>{
  const f=await fixture(t);await f.owner.saveProgram({name:'Paused program',rate:10,windowDays:30,active:false});
  let result=await view(f);assert.equal(result.model.stage,'closed');assert.equal(instances(result.element,ApiForm).length,0);assert.equal(instances(result.element,ActionButton).length,0);assert.match(result.html,/Return to this same invitation/);
  await f.owner.saveProgram({name:'Open program',rate:10,windowDays:30,active:true});await apply(f);
  await f.owner.saveProgram({name:'Paused again',rate:10,windowDays:30,active:false});result=await view(f);assert.equal(result.model.stage,'pending');assert.equal(result.model.program.active,0);
});

test('approved invitation links match the affiliate portal for WooCommerce, Shopify and custom websites',async t=>{
  for(const platform of ['woocommerce','shopify','custom']){
    const f=await fixture(t),application=await apply(f);await verify(f,platform);await f.owner.review({applicationId:application.id,status:'approved'});
    const result=await view(f),portal=await commerce(f.db,identity('partner')).partnerTracking();
    assert.equal(result.model.stage,'approved');assert.equal(result.model.referralPlatform,platform);assert.equal(result.model.referralLink,portal.links[0].url);
    assert.equal(instances(result.element,CopyButton)[0].path,portal.links[0].url);assert.match(result.html,/Your referral link is ready/);assert.ok(!result.html.includes('still to be built'));
    assert.equal(instances(result.element,ActionButton).length,0);assert.equal(instances(result.element,ApiForm).length,0);
  }
});

test('verification, store pause, program pause and applicant decisions control current referral availability',async t=>{
  const f=await fixture(t),application=await apply(f);await f.owner.review({applicationId:application.id,status:'approved'});
  let result=await view(f);assert.equal(result.model.referralLink,null);assert.match(result.html,/activate and verify/);
  const configured=await verify(f,'custom');result=await view(f);assert.ok(result.model.referralLink);
  await commerce(f.db,identity('owner')).configure({action:'disconnect',platform:'custom'});assert.equal((await f.model()).referralLink,null);
  await commerce(f.db,identity('owner')).configure({action:'resume',platform:'custom'});assert.ok((await f.model()).referralLink);
  await f.owner.saveProgram({name:'Paused program',rate:10,windowDays:30,active:false});result=await view(f);assert.equal(result.model.referralLink,null);assert.match(result.html,/business has paused this program/);
  await f.owner.saveProgram({name:'Open program',rate:10,windowDays:30,active:true});
  f.db.sqlite.prepare('UPDATE store_connections SET last_seen=NULL WHERE id=?').run(configured.connection.id);assert.equal((await f.model()).referralLink,null);
  for(const state of ['suspended','rejected']){await f.owner.review({applicationId:application.id,status:state});result=await view(f);assert.equal(result.model.stage,state);assert.equal(result.model.referralLink,null);assert.equal(instances(result.element,ActionButton).length,0);assert.equal(instances(result.element,ApiForm).length,0);}
});

test('another applicant or business cannot supply approval, verification or a referral link to this invitation',async t=>{
  const f=await fixture(t),application=await apply(f),other=service(f.db,identity('other-owner'));
  await f.owner.review({applicationId:application.id,status:'approved'});await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other business',website:''});
  const otherProgram=(await other.businessDashboard()).program,otherApplication=await f.partner.apply({programId:otherProgram.id});await other.review({applicationId:otherApplication.id,status:'approved'});
  const connection=await commerce(f.db,identity('other-owner')).configure({action:'connect',storeUrl:'https://other.example'});f.db.sqlite.prepare('UPDATE store_connections SET last_seen=? WHERE id=?').run(new Date().toISOString(),connection.connection.id);
  const model=await f.model();assert.equal(model.program.application.id,application.id);assert.equal(model.referralLink,null);assert.ok(!JSON.stringify(model).includes(otherApplication.id));
  const stranger=await programInvitation(f.db,identity('stranger'),f.program.id);assert.equal(stranger.program.application,null);assert.equal(stranger.referralLink,null);assert.equal(stranger.stage,'account');assert.ok(!JSON.stringify(stranger).includes(application.id));
});

test('reading an invitation is read-only, omits financial secrets and safely renders untrusted program text',async t=>{
  const f=await fixture(t),application=await apply(f);await f.owner.review({applicationId:application.id,status:'approved'});await verify(f);
  await f.owner.saveBusiness({name:'<script>alert(1)</script>',website:'https://business.example'});
  const queries=[],readOnly={prepare(query){assert.match(query.trim(),/^SELECT\b/i);assert.ok(!/signing_key|encrypted_|bank_profiles|payment_connections|billing_accounts|payout_requests|\borders\b/i.test(query));queries.push(query);return f.db.prepare(query);}};
  const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,model=await programInvitation(readOnly,identity('partner'),f.program.id);
  assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.ok(queries.length>0);assert.ok(!('owner_id' in model.program));
  const html=renderToStaticMarkup(createElement(InvitationView,{invitation:model,user:{email:'partner@example.com',fullName:null},independent:true}));
  assert.ok(!html.includes('<script>alert'));assert.match(html,/&lt;script&gt;/);
  for(const id of ['not-a-program',"' OR 1=1 --",crypto.randomUUID()])await assert.rejects(programInvitation(f.db,identity('partner'),id),fails(404));
});
