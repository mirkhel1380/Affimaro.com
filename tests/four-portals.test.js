import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './support/db.js';
import {applicationProfile,seedVerifiedProperties} from './support/application-profiles.js';
import {service,AppError} from '../lib/service.ts';
import {admissions,getAdmission} from '../lib/admissions.ts';
import {accountPortal,portalHome,portalFamily} from '../lib/portal-policy.ts';
import {requireAccountPortal} from '../lib/portal-access.ts';
import {admissionGate} from '../lib/admission-gate.ts';
import {audienceTools} from '../lib/audience-tools.ts';
import {planRequests,getPlanRequest} from '../lib/plan-requests.ts';
import {emailAuth,FLOW_COOKIE} from '../self-hosted/auth-core.ts';
import {authPage} from '../self-hosted/auth-pages.ts';
import {renderMarketingDocument} from '../lib/marketing-content.mjs';
import {pricingSection} from '../lib/pricing-catalog.mjs';
const identity=userId=>({userId,email:userId+'@example.com'}),fails=n=>e=>e instanceof AppError&&e.status===n;
async function fixture(t){const db=database(t),owner=identity('owner');await service(db,owner).saveAccount({name:'Owner Account'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,new Date().toISOString());return {db,owner,async add(role,id=role){const user=identity(id);await service(db,user).saveAccount({name:role+' Person'});const api=admissions(db,user);await api.start(role);const pending=await api.submit({revision:1,profile:applicationProfile(role)});seedVerifiedProperties(db,user.userId,applicationProfile(role));await admissions(db,owner).review({userId:id,revision:pending.revision,decision:'approved',note:'Profile reviewed.'});return user;}};}

test('all four admissions preserve exact roles, open different homes and cannot switch to another role in their accounting family',async t=>{const f=await fixture(t);for(const role of ['brand','affiliate','creator','agency']){const user=await f.add(role);assert.equal(await accountPortal(f.db,user.userId),role);assert.equal((await getAdmission(f.db,user.userId)).portal,role);await requireAccountPortal(f.db,user,portalFamily(role));for(const other of ['brand','affiliate','creator','agency'].filter(x=>x!==role)){await assert.rejects(admissions(f.db,user).start(other),fails(403));const response=await admissionGate(new Request('https://affimaro.example'+portalHome(other)),f.db,user);assert.equal(response.status,307);assert.equal(response.headers.get('location'),portalHome(role));}assert.equal(await admissionGate(new Request('https://affimaro.example'+portalHome(role)),f.db,user),null);}assert.equal(new Set(['brand','affiliate','creator','agency'].map(portalHome)).size,4);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_accounts').get().n,0);});

test('creator drafts and agency contacts are private, reject foreign IDs and cannot create cross-account access',async t=>{const f=await fixture(t),creator=await f.add('creator'),other=await f.add('creator','other-creator'),agency=await f.add('agency'),otherAgency=await f.add('agency','other-agency');const c={title:'A real tutorial idea',platform:'YouTube',status:'idea',applicationId:null,url:'',notes:'Private idea'};const saved=await audienceTools(f.db,creator).saveContent(c);assert.equal((await audienceTools(f.db,other).content()).length,0);await assert.rejects(audienceTools(f.db,other).saveContent({...c,id:saved.id}),fails(404));await assert.rejects(audienceTools(f.db,agency).saveContent(c),fails(403));await assert.rejects(audienceTools(f.db,creator).saveContent({...c,status:'published'}),fails(400));await assert.rejects(audienceTools(f.db,creator).saveContent({...c,url:'javascript:alert(1)'}),fails(400));const client={name:'Client company',website:'https://client.example',contact:'Business contact',status:'prospect',notes:'Private notes',authorized:true},record=await audienceTools(f.db,agency).saveClient(client);assert.equal((await audienceTools(f.db,otherAgency).clients()).length,0);await assert.rejects(audienceTools(f.db,otherAgency).saveClient({...client,id:record.id}),fails(404));await assert.rejects(audienceTools(f.db,creator).saveClient(client),fails(403));const workspaces=f.db.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n;await audienceTools(f.db,agency).saveClient({...client,id:record.id,status:'active'});assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,workspaces);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_connections').get().n,0);});

test('approved profiles choose packages without another owner review, selection preserves paid capacity and stale choices fail',async t=>{
 const f=await fixture(t),agency=await f.add('agency'),creator=await f.add('creator'),client={name:'Client company',website:'https://client.example',contact:'',status:'prospect',notes:'',authorized:true};
 for(let i=0;i<5;i++)await audienceTools(f.db,agency).saveClient({...client,name:'Client '+i});
 await assert.rejects(audienceTools(f.db,agency).saveClient(client),fails(409));
 let r=await getPlanRequest(f.db,agency.userId);assert.equal(r.active_plan,null);const revision=r.revision;
 r=await planRequests(f.db,agency).choose({plan:'growth',revision});assert.equal(r.status,'approved');assert.equal(r.active_plan,null);
 await assert.rejects(planRequests(f.db,agency).choose({plan:'business',revision}),fails(409));
 await assert.rejects(planRequests(f.db,creator).choose({plan:'business',revision:0}),fails(403));
 await assert.rejects(audienceTools(f.db,agency).saveClient(client),fails(409));
 const draft={userId:'draft-brand',email:'draft@example.com'};await service(f.db,draft).saveAccount({name:'Draft brand'});await admissions(f.db,draft).start('brand');
 await assert.rejects(planRequests(f.db,draft).choose({plan:'starter',revision:0}),fails(403));
 for(const table of ['billing_accounts','billing_checkouts','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});

test('creator content can attach only its own approved partnership, never another creator or a pending application',async t=>{const f=await fixture(t),brand=await f.add('brand'),creator=await f.add('creator'),other=await f.add('creator','other-creator'),program=(await service(f.db,brand).businessDashboard()).program;const own=await service(f.db,creator).apply({programId:program.id}),foreign=await service(f.db,other).apply({programId:program.id}),data={title:'Tutorial for a partner',platform:'YouTube',status:'draft',applicationId:own.id,url:'',notes:''};await assert.rejects(audienceTools(f.db,creator).saveContent(data),fails(403));await service(f.db,brand).review({applicationId:own.id,status:'approved'});await service(f.db,brand).review({applicationId:foreign.id,status:'approved'});const saved=await audienceTools(f.db,creator).saveContent(data);assert.equal(saved.application_id,own.id);await assert.rejects(audienceTools(f.db,creator).saveContent({...data,applicationId:foreign.id}),fails(403));await service(f.db,creator).saveAffiliate({name:'Creator profile',channel:'Content creator',website:'https://creator.example',bio:'Creator channel'});assert.equal(await accountPortal(f.db,creator.userId),'creator');});

test('four real authentication journeys seal the selected role and package through signup and verification without trusting provider role metadata',async t=>{
 for(const portal of ['brand','affiliate','creator','agency']){
 const db=database(t),config={origin:'https://affimaro.example',supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'bc'.repeat(32)},user={id:crypto.randomUUID(),email:portal+'@example.com',email_confirmed_at:new Date().toISOString(),user_metadata:{display_name:'New '+portal,role:'admin'}},tokens={access_token:'token_access_fixture_1234567890',refresh_token:'token_refresh_fixture_1234567890',expires_in:3600,token_type:'bearer',user};
 const provider=async(url,init)=>Response.json(url.endsWith('/settings')?{mailer_autoconfirm:false,external:{email:true},disable_signup:false}:url.endsWith('/user')?user:url.endsWith('/signup')?{}:tokens),api=emailAuth(db,config,provider),initial=await authPage(new Request(config.origin+'/auth/'+portal+'/signup?plan=growth'),api,config.origin),html=await initial.text();assert.equal(initial.status,200);assert.match(html,new RegExp('Create your '+portal+' account'));assert.ok(html.includes('data-portal="'+portal+'"'));const cookie=initial.headers.get('set-cookie').split(';')[0],flow=await api.flow(new Request(config.origin,{headers:{Cookie:cookie}})),fields={nonce:flow.nonce,name:'New Person',email:user.email,password:'Fixture-passphrase-123456',...(['brand','agency'].includes(portal)?{businessName:'Represented Brand'}:{channel:'Content creator'})};
 const signup=await authPage(new Request(config.origin+'/auth/'+portal+'/signup',{method:'POST',headers:{Origin:config.origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)}),api,config.origin);assert.equal(signup.status,303);assert.equal(signup.headers.get('location'),'/auth/'+portal+'/verify');const nextCookie=signup.headers.get('set-cookie').split(';')[0],verifiedFlow=await api.flow(new Request(config.origin,{headers:{Cookie:nextCookie}}));assert.equal(verifiedFlow.portal,portal);assert.equal(verifiedFlow.onboarding?.plan,['brand','agency'].includes(portal)?'growth':undefined);
 const verified=await authPage(new Request(config.origin+'/auth/'+portal+'/verify',{method:'POST',headers:{Origin:config.origin,Cookie:nextCookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce:verifiedFlow.nonce,code:'123456'})}),api,config.origin);assert.equal(verified.status,303);const row=db.sqlite.prepare('SELECT user_id FROM auth_identities WHERE provider_id=?').get(user.id),application=await getAdmission(db,row.user_id);assert.equal(application.portal,portal);assert.equal(application.status,'draft');assert.equal(await accountPortal(db,row.user_id),portal);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM platform_admins').get().n,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM workspaces').get().n,0);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM affiliate_profiles').get().n,0);
 const wrong=portal==='creator'?'affiliate':'creator';await assert.rejects(api.login({email:user.email,password:'Fixture-passphrase-123456'},'fixture-ip',null,wrong),fails(403));
 }
});

test('pricing, role menus, signup choices and guides stay connected and the dark creator card has readable white text',()=>{const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8'),css=readFileSync(new URL('../public/marketing.css',import.meta.url),'utf8');for(const path of ['/login','/get-started']){const html=renderMarketingDocument(path,sprite,{plan:'growth'});for(const role of ['brand','affiliate','creator','agency'])assert.ok(html.includes('/auth/'+role+'/'+(path==='/login'?'login':'signup')));assert.match(html,/plan=growth/);assert.match(html,/Creator and affiliate accounts are free/);}for(const role of ['creators','agencies'])for(const path of ['/'+role,'/demo/'+role]){const html=renderMarketingDocument(path,sprite);assert.ok(html);assert.ok(!html.includes('use the dedicated affiliate portal'));}assert.match(css,/\.marketing-page \.m-audience-paths>article:nth-child\(2\) h3,[\s\S]*color:#fff;opacity:1/);const rgb=[0x25,0x4c,0x3e].map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});assert.ok(1.05/(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]+.05)>7);});

test('approved-partner capacity is enforced and selecting an upgrade alone never opens the next place',async t=>{const f=await fixture(t),brand=await f.add('brand'),program=(await service(f.db,brand).businessDashboard()).program,at='2026-01-01T00:00:00.000Z',ids=[];for(let i=0;i<101;i++){const u='quota-partner-'+i,id=crypto.randomUUID();f.db.sqlite.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(u,u+'@example.com',u,at);f.db.sqlite.prepare('INSERT INTO affiliate_profiles VALUES (?,?,?,?,?,?)').run(u,u,'Blog','https://publisher.example','',at);f.db.sqlite.prepare('INSERT INTO applications VALUES (?,?,?,?,?,?)').run(id,program.id,u,'pending',at,at);ids.push(id);}for(const applicationId of ids.slice(0,100))await service(f.db,brand).review({applicationId,status:'approved'});const events=f.db.sqlite.prepare('SELECT count(*) n FROM audit_events').get().n;await assert.rejects(service(f.db,brand).review({applicationId:ids[100],status:'approved'}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM audit_events').get().n,events);let r=await getPlanRequest(f.db,brand.userId);r=await planRequests(f.db,brand).choose({plan:'growth',revision:r.revision});await assert.rejects(service(f.db,brand).review({applicationId:ids[100],status:'approved'}),fails(409));assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM applications WHERE status='approved'").get().n,100);});


test('the four-way sign-in choice preserves an invitation and rejects external continuation URLs',()=>{const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8'),path='/join/'+crypto.randomUUID(),html=renderMarketingDocument('/login',sprite,{returnTo:path});for(const role of ['brand','affiliate','creator','agency'])assert.ok(html.includes('/auth/'+role+'/login?return_to='+encodeURIComponent(path)));const bad=renderMarketingDocument('/login',sprite,{returnTo:'https://attacker.example/steal'});assert.ok(!bad.includes('attacker.example'));});

test('pricing has dedicated free affiliate and creator cards whose signup links never select a paid package',()=>{
 const html=pricingSection();
 for(const role of ['affiliate','creator']){
  const card=html.match(new RegExp('<article data-account-type="'+role+'"[\\s\\S]*?<\\/article>'))?.[0];
  assert.ok(card,'Dedicated free '+role+' card');assert.match(card,/>Free</);assert.ok(!/\$|plan=|\/billing/.test(card));
  assert.ok(card.includes('href="/auth/'+role+'/signup"'));
 }
 assert.match(html,/Monthly plans for brands &amp; agencies/);
 for(const role of ['brand','agency']){const plans=pricingSection(role);assert.ok(plans.includes('data-pricing-role="'+role+'"'));for(const plan of ['starter','growth','business']){const href=plans.match(new RegExp('href="(/auth/'+role+'/signup\\?plan='+plan+'[^"]*)"'))?.[1];assert.ok(href);const url=new URL(href.replaceAll('&amp;','&'),'https://affimaro.example');assert.equal(url.searchParams.get('plan'),plan);assert.equal(url.searchParams.get('return_to'),(role==='agency'?'/agency/billing':'/billing')+'?plan='+plan);}}
 assert.ok(!pricingSection('brand').includes('Private client directory:'));assert.ok(pricingSection('agency').includes('Private client directory: up to 25 records'));assert.ok(pricingSection('agency').includes('Client records do not connect additional stores.'));assert.ok(pricingSection('invalid').includes('data-pricing-role="brand"'));
});

test('choosing a free account drops a subscription continuation but preserves an actual program invitation',()=>{
 const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8');
 for(const kind of ['login','get-started'])for(const target of ['/billing?plan=growth','/agency/billing?plan=growth']){
  const html=renderMarketingDocument('/'+kind,sprite,{plan:'growth',returnTo:target}),choices=html.match(/<div class="m-audience-paths">[\s\S]*?<\/section>/)?.[0];assert.ok(choices);
  for(const role of ['affiliate','creator']){
   const href=choices.match(new RegExp('href="(/auth/'+role+'/'+(kind==='login'?'login':'signup')+'[^\"]*)"'))?.[1];assert.ok(href);
   const url=new URL(href.replaceAll('&amp;','&'),'https://affimaro.example');assert.equal(url.searchParams.has('plan'),false);assert.equal(url.searchParams.get('return_to'),portalHome(role));
  }
  assert.match(html,/Free · no subscription/);
 }
});

test('free registration ignores old paid return links and explicitly shows no subscription or card requirement',async t=>{
 const config={origin:'https://affimaro.example',supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'bc'.repeat(32)};
 for(const role of ['affiliate','creator'])for(const target of ['/billing?plan=starter','/agency/billing?plan=business']){
  let calls=0;const api=emailAuth(database(t),config,async()=>{calls++;throw new Error('No provider call on signup GET');});
  const response=await authPage(new Request(config.origin+'/auth/'+role+'/signup?plan=starter&return_to='+encodeURIComponent(target)),api,config.origin),html=await response.text();
  assert.equal(response.status,200);assert.match(html,new RegExp('Free '+role+' account'));assert.match(html,/No subscription or card required/);assert.ok(!/\$19|Selected package|name="businessName"/.test(html));
  const cookie=response.headers.get('set-cookie').split(';')[0],flow=await api.flow(new Request(config.origin,{headers:{Cookie:cookie}}));assert.equal(flow.returnTo,portalHome(role));assert.equal(flow.plan,undefined);assert.equal(calls,0);
 }
});
