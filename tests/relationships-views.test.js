import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {service} from '../lib/service.ts';
import {partnerResources} from '../lib/partner-resources.ts';
import {referralRedirect} from '../lib/link-clicks.ts';
import {discovery} from '../lib/discovery.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'relationship-view-tests-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__relationshipDb;delete globalThis.__relationshipUser;});
const out=await build({stdin:{contents:"export {POST as discoveryAction} from './app/api/discovery/route';export {DiscoveryView} from './app/discover/page';export {ProgramInvitationCard} from './app/program-invitation-card';export {DiscoveryButton} from './app/discover/actions';export {PartnerApplicationView} from './app/partner-application-view';export {PATCH as reviewApplication} from './app/api/applications/route';export {RelationshipsView} from './app/relationships-view';export {ProgramResourcesView} from './app/program-resources-view';export {BrandPartnershipView} from './app/brand-partnership-view';export {ClicksView} from './app/clicks-view';export {SettingsView} from './app/settings/view';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'relationship-fixture',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,k){return k==='DB'?globalThis.__relationshipDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__relationshipUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});const file=join(temp,'views.mjs');writeFileSync(file,out.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
test('real four-role partnership pages expose status and invitation tabs while keeping their own portal permissions',async t=>{const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;for(const role of ['brand','affiliate','creator','agency']){globalThis.__relationshipUser=f[role];for(const tab of ['all','approved','pending','invitations','rejected','suspended']){const html=renderToStaticMarkup(await views.RelationshipsView({portal:role,searchParams:Promise.resolve({tab})}));assert.match(html,new RegExp('data-portal="'+role+'"'));assert.match(html,/My (partners|brands)/);assert.match(html,/Pending/);assert.match(html,/Approved/);assert.match(html,/Invitations|invitations/);assert.match(html,/href="\/(partner|creator|workspace|agency)\/clicks/);}}globalThis.__relationshipUser=f.affiliate;await assert.rejects(views.RelationshipsView({portal:'brand',searchParams:Promise.resolve({})}),e=>typeof e.location==='string');});
test('approved brand pages expose scoped assets, coupon codes, referral links and clicks; pending partners cannot view them',async t=>{const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;await partnerResources(f.db,f.brand).addAsset({kind:'text',title:'Brand-approved copy',body:'Promotional copy with a clear affiliate disclosure.'});await partnerResources(f.db,f.brand).addCoupon({code:'APPROVED10',title:'Partner coupon',terms:'Store terms apply. Excludes sale items.'});globalThis.__relationshipUser=f.affiliate;for(const tab of ['assets','coupons','links']){const html=renderToStaticMarkup(await views.BrandPartnershipView({portal:'affiliate',params:Promise.resolve({id:f.application.id}),searchParams:Promise.resolve({tab})}));for(const label of ['Assets','Coupon codes','Referral links','Clicks'])assert.ok(html.includes(label));assert.ok(!html.includes('signing_key'));}globalThis.__relationshipUser=f.creator;await assert.rejects(views.BrandPartnershipView({portal:'creator',params:Promise.resolve({id:f.application.id}),searchParams:Promise.resolve({})}),e=>e.notFound===true);globalThis.__relationshipUser=f.brand;const manage=renderToStaticMarkup(await views.ProgramResourcesView({portal:'brand',searchParams:Promise.resolve({tab:'coupons'})}));assert.match(manage,/Publish a store coupon/);assert.match(manage,/APPROVED10/);});
test('the real click report renders recorded source and UTC time without storing or exposing raw IPs or referrer queries',async t=>{const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;await referralRedirect(f.db,new Request('https://affimaro.example/r/'+f.application.id,{headers:{'User-Agent':'Mozilla Mobile','Referer':'https://newsletter.example/private?secret=NO_EXPOSE'}}),f.application.id);globalThis.__relationshipUser=f.affiliate;const html=renderToStaticMarkup(await views.ClicksView({portal:'affiliate',searchParams:Promise.resolve({})}));assert.match(html,/newsletter.example/);assert.match(html,/Time \(UTC\)/);assert.match(html,/Raw|raw events/);assert.match(html,/Clicks over time/);assert.match(html,/Clicks by source/);assert.match(html,/View daily values/);assert.match(html,/type="range"/);assert.ok(!html.includes('NO_EXPOSE'));});

test('all four real settings portals render every section and preserve role permissions and closure confirmation',async t=>{const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;for(const portal of ['brand','affiliate','creator','agency']){globalThis.__relationshipUser=f[portal];for(const tab of ['profile','appearance','reports','notifications','privacy','security','tools','data']){const html=renderToStaticMarkup(await views.SettingsView({portal,searchParams:Promise.resolve({tab})}));assert.match(html,/Settings sections/);assert.match(html,new RegExp('data-portal="'+portal+'"'));assert.ok(!html.includes('token_hash')&&!html.includes('encrypted_tokens'));if(tab==='appearance')for(const word of ['Light','Dark','Use device setting'])assert.ok(html.includes(word));if(tab==='tools'&&['affiliate','creator'].includes(portal)){assert.match(html,/accounts are free/);assert.ok(!html.includes('href="/billing"'));}if(tab==='data')assert.match(html,/href="\/account\/close"/);if(tab==='security')assert.ok(html.includes('/auth/'+portal+'/recover'));}}globalThis.__relationshipUser=f.creator;await assert.rejects(views.SettingsView({portal:'agency',searchParams:Promise.resolve({})}),e=>typeof e.location==='string');});


test('brand and agency application details expose review controls and deny foreign or wrong-role requests',async t=>{
 const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;globalThis.__relationshipUser=f.brand;
 const html=renderToStaticMarkup(await views.PartnerApplicationView({portal:'brand',params:Promise.resolve({id:f.pending.id})}));
 for(const text of ['Creator profile','Promotion strategy','Websites &amp; channels','Approve partner','Decline application','YouTube'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('+1 202')&&!html.includes('creator@example.com'));
 const list=renderToStaticMarkup(await views.RelationshipsView({portal:'brand',searchParams:Promise.resolve({tab:'pending'})}));assert.ok(list.includes('href="/workspace/partners/'+f.pending.id+'"'));assert.ok(list.includes('Review application'));
 globalThis.__relationshipUser=f.foreignBrand;await assert.rejects(views.PartnerApplicationView({portal:'brand',params:Promise.resolve({id:f.pending.id})}),e=>e.notFound===true);
 globalThis.__relationshipUser=f.creator;await assert.rejects(views.PartnerApplicationView({portal:'brand',params:Promise.resolve({id:f.pending.id})}),e=>typeof e.location==='string');
 globalThis.__relationshipUser=f.agency;const program=(await service(f.db,f.agency).businessDashboard()).program,agencyApplication=await service(f.db,f.creator).apply({programId:program.id});const agencyHtml=renderToStaticMarkup(await views.PartnerApplicationView({portal:'agency',params:Promise.resolve({id:agencyApplication.id})}));assert.ok(agencyHtml.includes('data-portal="agency"'));assert.ok(agencyHtml.includes('href="/agency/partners?tab=pending"'));assert.ok(agencyHtml.includes('Creator profile'));
 globalThis.__relationshipUser=f.brand;f.db.sqlite.prepare("UPDATE media_properties SET status='revoked' WHERE user_id='creator'").run();
 const blocked=renderToStaticMarkup(await views.PartnerApplicationView({portal:'brand',params:Promise.resolve({id:f.pending.id})}));assert.ok(!blocked.includes('Approve partner'));assert.ok(blocked.includes('Channel verification needs attention'));assert.ok(blocked.includes('Decline application'));
});

test('the review API rejects stale applicant evidence before attempting subscription access and still permits a decline',async t=>{
 const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;globalThis.__relationshipUser=f.brand;
 const request=status=>new Request('https://affimaro.example/api/applications',{method:'PATCH',headers:{Origin:'https://affimaro.example','Content-Type':'application/json'},body:JSON.stringify({applicationId:f.pending.id,status})});
 f.db.sqlite.prepare("UPDATE media_properties SET status='revoked' WHERE user_id='creator'").run();
 let response=await views.reviewApplication(request('approved'));assert.equal(response.status,409);const denied=await response.json();assert.match(denied.error,/current channel verification/);
 assert.equal(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(f.pending.id).status,'pending');
 response=await views.reviewApplication(request('rejected'));assert.equal(response.status,200);assert.equal(f.db.sqlite.prepare('SELECT status FROM applications WHERE id=?').get(f.pending.id).status,'rejected');
});

const invitationNote='Please review our program and apply if it is a good fit for your audience.';
const inbox=portal=>views.RelationshipsView({portal,searchParams:Promise.resolve({tab:'invitations',invitationStatus:'all'})}).then(renderToStaticMarkup);
const discoveryRequest=(body,origin='https://affimaro.example')=>new Request('https://affimaro.example/api/discovery',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const respond=id=>({action:'respond',data:{id,decision:'accepted'}});

test('all four invitation inboxes show the current application and send acceptance to the program',async t=>{
 const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;
 const recipient=await f.add('affiliate','new-affiliate');
 for(const [business,partner,user] of [['brand','affiliate',recipient],['agency','creator',f.creator]]){
  const invite=await discovery(f.db,f[business]).invite({targetId:user.userId,note:invitationNote});
  globalThis.__relationshipUser=f[business];let html=await inbox(business);assert.ok(html.includes('Not submitted'));assert.ok(html.includes('Withdraw invitation'));assert.ok(!html.includes('Accept invitation &amp; apply'));
  globalThis.__relationshipUser=user;html=await inbox(partner);assert.ok(html.includes('Accept invitation &amp; apply'));assert.ok(html.includes('Decline invitation'));
  const row=(await import('../lib/relationships.ts').then(m=>m.relationshipWorkspace(f.db,user,{tab:'invitations'}))).invitations[0],card=views.ProgramInvitationCard({invitation:row,portal:partner,ownershipReady:true});
  const components=[];function visit(n){if(!n||typeof n!=='object')return;if(n.type===views.DiscoveryButton)components.push(n.props);const children=n.props?.children;for(const child of Array.isArray(children)?children:[children]){if(Array.isArray(child))child.forEach(visit);else visit(child);}}visit(card);
  assert.equal(components.find(c=>c.data.decision==='accepted').successPath,'/join/'+row.program_id);
  const response=await views.discoveryAction(discoveryRequest(respond(invite.id)));assert.equal(response.status,200);const result=await response.json();assert.equal(result.data.application.status,'pending');
  html=await inbox(partner);assert.ok(html.includes('waiting for the business'));assert.ok(!html.includes('Accept invitation &amp; apply'));
  await service(f.db,f[business]).review({applicationId:result.data.application.id,status:'approved'});
  html=await inbox(partner);assert.ok(html.includes('Open partnership tools'));assert.ok(html.includes('href="/'+(partner==='affiliate'?'partner':'creator')+'/brands/'+result.data.application.id+'"'));
  globalThis.__relationshipUser=f[business];html=await inbox(business);assert.ok(html.includes('View partner profile'));assert.ok(html.includes('href="/'+(business==='brand'?'workspace':'agency')+'/partners/'+result.data.application.id+'"'));
  await service(f.db,f[business]).review({applicationId:result.data.application.id,status:'suspended'});globalThis.__relationshipUser=user;html=await inbox(partner);assert.ok(html.includes('currently suspended'));assert.ok(!html.includes('Open partnership tools'));
 }
});

test('invitation pages explain superseded decisions, verification repair, paused programs and closed accounts',async t=>{
 const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;globalThis.__relationshipUser=f.creator;
 const invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note:invitationNote}),program=(await service(f.db,f.agency).businessDashboard()).program;
 f.db.sqlite.prepare("UPDATE media_properties SET status='revoked' WHERE user_id=?").run(f.creator.userId);
 let html=await inbox('creator');assert.ok(html.includes('Manage websites &amp; channels'));assert.ok(!html.includes('Accept invitation &amp; apply'));assert.ok(html.includes('Decline invitation'));
 f.db.sqlite.prepare("UPDATE media_properties SET status='verified' WHERE user_id=?").run(f.creator.userId);f.db.sqlite.prepare('UPDATE programs SET active=0 WHERE id=?').run(program.id);
 html=await inbox('creator');assert.ok(html.includes('Applications are paused'));assert.ok(!html.includes('Accept invitation &amp; apply'));
 f.db.sqlite.prepare('UPDATE programs SET active=1 WHERE id=?').run(program.id);const application=await service(f.db,f.creator).apply({programId:program.id});await service(f.db,f.agency).review({applicationId:application.id,status:'rejected'});
 html=await inbox('creator');assert.ok(html.includes('A new invitation is required'));assert.ok(!html.includes('Accept invitation &amp; apply'));assert.ok(html.includes('View your application'));
 globalThis.__relationshipUser=f.agency;html=await inbox('agency');assert.ok(html.includes('Withdraw it and send a new invitation'));assert.ok(html.includes('Withdraw invitation'));
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES(?,?)').run(f.creator.userId,new Date().toISOString());html=await inbox('agency');assert.ok(html.includes('This account is closed'));assert.ok(!html.includes('Withdraw invitation'));assert.ok(!html.includes('/join/'+program.id));
});

test('legacy discovery invitation links resolve to the dedicated inbox in each role',async t=>{
 const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;
 for(const [portal,path] of [['brand','/workspace/partners'],['agency','/agency/partners'],['affiliate','/partner/brands'],['creator','/creator/brands']]){
  globalThis.__relationshipUser=f[portal];await assert.rejects(views.DiscoveryView({expected:portal,searchParams:Promise.resolve({tab:'invitations',q:'My program',invitationStatus:'accepted'})}),e=>e.location===path+'?tab=invitations&q=My+program&invitationStatus=accepted');
  const html=renderToStaticMarkup(await views.DiscoveryView({expected:portal,searchParams:Promise.resolve({})}));assert.ok(html.includes('href="'+path+'?tab=invitations"'));
 }
});

test('the invitation API denies anonymous, cross-origin, foreign actors and forged state without writes',async t=>{
 const f=await partnerFixture(t);globalThis.__relationshipDb=f.db;const invite=await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note:invitationNote});
 const counts=()=>JSON.stringify(['applications','discovery_invitations','audit_events','billing_accounts','payout_requests'].map(table=>f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n)),before=counts();
 globalThis.__relationshipUser=null;assert.equal((await views.discoveryAction(discoveryRequest(respond(invite.id)))).status,401);
 globalThis.__relationshipUser=f.creator;assert.equal((await views.discoveryAction(discoveryRequest(respond(invite.id),'https://foreign.example'))).status,403);
 assert.equal((await views.discoveryAction(discoveryRequest({action:'respond',data:{id:invite.id,decision:'accepted',application_status:'approved'}}))).status,400);
 globalThis.__relationshipUser=f.affiliate;assert.equal((await views.discoveryAction(discoveryRequest(respond(invite.id)))).status,404);
 globalThis.__relationshipUser=f.agency;assert.equal((await views.discoveryAction(discoveryRequest(respond(invite.id)))).status,404);
 globalThis.__relationshipUser=f.creator;assert.equal((await views.discoveryAction(discoveryRequest({action:'respond',data:{id:invite.id,decision:'withdrawn'}}))).status,404);
 assert.equal((await views.discoveryAction(discoveryRequest({action:'invite',data:{targetId:f.affiliate.userId,note:invitationNote}}))).status,403);
 assert.equal(counts(),before);assert.equal(f.db.sqlite.prepare('SELECT status FROM discovery_invitations WHERE id=?').get(invite.id).status,'pending');
});
