import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {discovery} from '../lib/discovery.ts';
import {relationshipsPath} from '../lib/relationships.ts';
import {portalHome} from '../lib/portal-policy.ts';
import {emailAuth,SESSION_COOKIE} from '../self-hosted/auth-core.ts';
import {authPage} from '../self-hosted/auth-pages.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'partnership-return-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__partnershipReturnDb;delete globalThis.__partnershipReturnUser;});
const bundle=await build({stdin:{contents:"export {RelationshipsView} from './app/relationships-view';export {DiscoveryView} from './app/discover/page';export {BrandPartnershipView} from './app/brand-partnership-view';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'partnership-return-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__partnershipReturnDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__partnershipReturnUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const file=join(temp,'views.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const origin='https://affimaro.example',roles=['brand','agency','affiliate','creator'],programId='11111111-1111-4111-8111-111111111111';
const set=(db,user=null)=>{globalThis.__partnershipReturnDb=db;globalThis.__partnershipReturnUser=user;};
const queryOf=url=>Object.fromEntries(new URL(url,origin).searchParams);
async function redirected(run){try{await run();assert.fail('Expected a protected page redirect');}catch(error){if(typeof error.location==='string')return error.location;throw error;}}
function assertTarget(location,path,query,login){const url=new URL(location,origin);assert.equal(url.pathname,login);const target=url.searchParams.get('return_to');assert.ok(target);assert.equal(new URL(target,origin).pathname,path);assert.deepEqual(queryOf(target),query);return target;}
const relationships=(portal,query)=>views.RelationshipsView({portal,searchParams:Promise.resolve(query)});
const discover=(portal,query)=>views.DiscoveryView({expected:portal,searchParams:Promise.resolve(query)});
const tools=(portal,query)=>views.BrandPartnershipView({portal,params:Promise.resolve({id:programId}),searchParams:Promise.resolve(query)});
const noDb={prepare(){throw new Error('Anonymous page touched private data before sign-in');}};

test('every role retains its invitation status, literal search and page through the actual protected relationship view',async()=>{
 set(noDb);const query={tab:'invitations',invitationStatus:'pending',page:'2',q:'Partner & Co'};
 for(const role of roles)assertTarget(await redirected(()=>relationships(role,query)),relationshipsPath(role),query,'/auth/'+role+'/login');
});

test('four discovery entries and the generic entry preserve shortlist filters through sign-in',async()=>{
 set(noDb);const query={tab:'saved',page:'2',sort:'name',q:'tools & services',industry:'Software & technology',country:'United States',platform:'Website / blog'};
 for(const role of roles)assertTarget(await redirected(()=>discover(role,query)),portalHome(role)+'/discover',query,'/auth/'+role+'/login');
 assertTarget(await redirected(()=>discover(undefined,query)),'/discover',query,'/auth/login');
});

test('affiliate and creator links return directly to the selected coupon or referral-link tab',async()=>{
 set(noDb);for(const role of ['affiliate','creator'])for(const tab of ['coupons','links'])assertTarget(await redirected(()=>tools(role,{tab})),relationshipsPath(role)+'/'+programId,{tab},'/auth/'+role+'/login');
});

test('legacy discovery invitation links hand off their status, search and page to the matching role inbox',async t=>{
 const f=await partnerFixture(t),query={tab:'invitations',invitationStatus:'accepted',q:'Example & program',page:'3'};
 for(const role of roles){set(f.db,f[role]);const url=new URL(await redirected(()=>discover(role,query)),origin);assert.equal(url.pathname,relationshipsPath(role));assert.deepEqual(queryOf(url),query);}
});

test('return paths ignore ambiguous, unknown and control-character fields and stay within the existing auth length limit',async()=>{
 set(noDb);const location=await redirected(()=>relationships('affiliate',{tab:'invitations',invitationStatus:'pending',page:'2',q:['one','two'],type:['brand','agency'],return_to:'https://foreign.example/steal',token:'PRIVATE_QUERY_MARKER',owner:'true'}));
 const target=assertTarget(location,'/partner/brands',{tab:'invitations',invitationStatus:'pending',page:'2'},'/auth/affiliate/login');assert.ok(!location.includes('PRIVATE_QUERY_MARKER'));assert.ok(!location.includes('foreign.example'));
 const large=await redirected(()=>discover('creator',{tab:'saved',page:'2',q:'برند'.repeat(25),industry:'x'.repeat(80),country:'y'.repeat(80),platform:'z'.repeat(80),sort:'name'})),largeTarget=new URL(large,origin).searchParams.get('return_to');
 assert.ok(largeTarget.length<=500);assert.equal(new URL(largeTarget,origin).pathname,'/creator/discover');assert.equal(queryOf(largeTarget).tab,'saved');assert.equal(queryOf(largeTarget).page,'2');
 const clean=new URL(await redirected(()=>relationships('brand',{tab:'pending',q:'name\nheader'})),origin).searchParams.get('return_to');assert.deepEqual(queryOf(clean),{tab:'pending'});assert.equal(new URL(target,origin).origin,origin);
});

test('preserved selections do not bypass saved-role, pending-profile, closed-account or owner guards',async t=>{
 const f=await partnerFixture(t),query={tab:'invitations',invitationStatus:'pending'};
 for(const role of roles){set(f.db,f[role]);const wrong=role==='brand'?'affiliate':'brand';assert.equal(await redirected(()=>relationships(wrong,query)),portalHome(role));}
 set(f.db,f.operator);assert.equal(await redirected(()=>relationships('brand',query)),'/owner');
 f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.affiliate.userId);set(f.db,f.affiliate);
 const pending=new URL(await redirected(()=>relationships('affiliate',query)),origin);assert.equal(pending.pathname,'/application');const target=pending.searchParams.get('return_to');assert.equal(new URL(target,origin).pathname,'/partner/brands');assert.deepEqual(queryOf(target),query);
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.creator.userId,new Date().toISOString());set(f.db,f.creator);assert.equal(await redirected(()=>relationships('creator',query)),'/account-closed');
});

test('actual password login returns all four saved roles to their invitation selection without submitting or approving a partnership',async t=>{
 const f=await partnerFixture(t),newPartner=await f.add('affiliate','invited-affiliate'),note='Please review this represented program and choose whether to apply.';
 await discovery(f.db,f.brand).invite({targetId:newPartner.userId,note});await discovery(f.db,f.agency).invite({targetId:f.creator.userId,note});await discovery(f.db,f.foreignBrand).invite({targetId:f.affiliate.userId,note});
 const before=f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,query={tab:'invitations',invitationStatus:'pending',q:'Example'};
 for(const role of roles){
  set(noDb);const target=assertTarget(await redirected(()=>relationships(role,query)),relationshipsPath(role),query,'/auth/'+role+'/login'),user=f[role],providerId=crypto.randomUUID();
  f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(providerId,user.userId,new Date().toISOString());
  const config={origin,supabaseUrl:'https://partnership-fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'af'.repeat(32)},providerUser={id:providerId,email:user.email,email_confirmed_at:new Date().toISOString()},calls=[];
  const auth=emailAuth(f.db,config,async(url,init)=>{calls.push(url);const path=new URL(url).pathname;assert.equal(new URL(url).origin,config.supabaseUrl);assert.equal(init.redirect,'manual');if(path==='/auth/v1/settings')return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:false});if(path==='/auth/v1/token')return Response.json({access_token:'FIXTURE_ACCESS_TOKEN_12345678901234567890',refresh_token:'FIXTURE_REFRESH_TOKEN_12345678901234567890',expires_in:3600,token_type:'bearer',user:providerUser});assert.equal(path,'/auth/v1/user');return Response.json(providerUser);});
  const request=(path,cookie='',body)=>new Request(origin+path,body?{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}:{headers:{Cookie:cookie}});
  const page=await authPage(request('/auth/'+role+'/login?'+new URLSearchParams({return_to:target})),auth,origin),cookie=page.headers.getSetCookie()[0].split(';')[0],flow=await auth.flow(request('/',cookie));assert.equal(page.status,200);assert.equal(flow.returnTo,target);
  const result=await authPage(request('/auth/'+role+'/login?return_to=https%3A%2F%2Fforeign.example',cookie,{nonce:flow.nonce,email:user.email,password:'Fixture password 123456!'}),auth,origin);
  assert.equal(result.status,303);assert.equal(result.headers.get('Location'),target);assert.equal(calls.length,4);
  const session=result.headers.getSetCookie().find(c=>c.startsWith(SESSION_COOKIE+'='));assert.ok(session);const resolved=await auth.resolve(request(target,session.split(';')[0]));assert.equal(resolved.userId,user.userId);set(f.db,resolved);
  const beforeRead=f.db.sqlite.prepare('SELECT total_changes() n').get().n,html=renderToStaticMarkup(await relationships(role,query));assert.ok(html.includes('Invitations'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,beforeRead);
 }
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,before);assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM discovery_invitations WHERE status='accepted'").get().n,0);
 for(const table of ['billing_accounts','billing_checkouts','payment_connections','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});
