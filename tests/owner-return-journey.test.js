import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {queueFixture,seedApplicant} from './support/admission-queue.js';
import {seedVerifiedProperties,applicationProfile} from './support/application-profiles.js';
import {emailAuth,SESSION_COOKIE} from '../self-hosted/auth-core.ts';
import {authPage} from '../self-hosted/auth-pages.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'owner-return-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__ownerReturnDb;delete globalThis.__ownerReturnUser;});
const bundle=await build({stdin:{contents:"export {default as Applications} from './app/owner/applications/page';export {default as LegacyApplications} from './app/admin/applications/page';export {default as Verifications} from './app/owner/verifications/page';export {default as Users} from './app/owner/users/page';export {default as Records} from './app/owner/data/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'owner-return-fixture',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__ownerReturnDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__ownerReturnUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const file=join(temp,'views.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const origin='https://affimaro.example',noDb={prepare(){throw new Error('Anonymous owner page touched private data');}},selected='selected-applicant';
const set=(db,user=null)=>{globalThis.__ownerReturnDb=db;globalThis.__ownerReturnUser=user;};
const render=(view,query={})=>views[view]({searchParams:Promise.resolve(query)});
const html=async(view,query={})=>renderToStaticMarkup(await render(view,query));
const queryOf=value=>Object.fromEntries(new URL(value,origin).searchParams);
async function redirected(run){try{await run();assert.fail('Expected protected redirect');}catch(error){if(typeof error.location==='string')return error.location;throw error;}}
function targetOf(location,path,query){const login=new URL(location,origin);assert.equal(login.pathname,'/auth/owner/login');const target=login.searchParams.get('return_to');assert.equal(new URL(target,origin).pathname,path);assert.deepEqual(queryOf(target),query);assert.ok(target.length<=500);return target;}
const cases=[
 ['Applications','/owner/applications',{applicant:selected,status:'changes_requested',portal:'creator',page:'3',q:'Name & company'}],
 ['Verifications','/owner/verifications',{applicant:selected,status:'review_pending',portal:'agency',page:'2',q:'Property & channel'}],
 ['Users','/owner/users',{user:selected,role:'creator',page:'2',q:'Name & company'}],
 ['Records','/owner/data',{table:'orders',review:'required',page:'2',q:'Order & company'}],
];

for(const [view,path,query] of cases)test(`owner ${view} retains selected record and filters through its actual sign-in guard`,async()=>{
 set(noDb);targetOf(await redirected(()=>render(view,query)),path,query);
});

test('the legacy application page keeps the canonical owner review destination and selection',async()=>{
 set(noDb);const query=cases[0][2];targetOf(await redirected(()=>render('LegacyApplications',query)),'/owner/applications',query);
});

test('owner destinations omit arrays, control characters and authority fields and prioritize selections inside the Auth budget',async()=>{
 set(noDb);
 for(const [view,path,query] of cases){const expected={...query};delete expected.q;
  const location=await redirected(()=>render(view,{...query,q:['one','two'],return_to:'https://foreign.example',token:'PRIVATE_QUERY',owner:'true',workspace_id:'PRIVATE_QUERY'}));targetOf(location,path,expected);assert.ok(!location.includes('PRIVATE_QUERY'));assert.ok(!location.includes('foreign.example'));
  targetOf(await redirected(()=>render(view,{...query,q:'name\nheader'})),path,expected);
  const large=new URL(await redirected(()=>render(view,{...query,q:'ژ'.repeat(120)})),origin).searchParams.get('return_to');assert.ok(large.length<=500);for(const [key,value] of Object.entries(expected))assert.equal(queryOf(large)[key],value);
 }
});

test('malformed selected account values render recoverable filters instead of reaching a raw database binding',async t=>{
 const f=await queueFixture(t);seedApplicant(f,selected);set(f.db,f.owner);const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 for(const user of [[selected,'other'],'','   ','x'.repeat(201),'name\nheader']){const page=await html('Users',{user});assert.ok(page.includes('Check your account filters'));assert.ok(page.includes('Reset account filters'));}
 for(const query of [{q:['one','two']},{role:['creator','agency']},{page:['1','2']}])assert.ok((await html('Users',query)).includes('Check your account filters'));
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
});

test('opening a directory account and returning keeps the current search, role and effective page',async t=>{
 const f=await queueFixture(t);for(let i=0;i<55;i++)seedApplicant(f,'account-'+String(i).padStart(3,'0'),'creator',{name:'Target account '+i});set(f.db,f.owner);
 const query={q:'target',role:'creator',page:'2'},page=await html('Users',query),links=[...page.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')),selectedLink=links.find(link=>new URL(link,origin).pathname==='/owner/users'&&new URL(link,origin).searchParams.has('user'));
 assert.ok(selectedLink);const target=queryOf(selectedLink);for(const [key,value] of Object.entries(query))assert.equal(target[key],value);
 const detail=await html('Users',target),back=[...detail.matchAll(/href="([^"]+)"[^>]*>All accounts<\/a>/g)][0]?.[1].replaceAll('&amp;','&');assert.ok(back);assert.equal(new URL(back,origin).pathname,'/owner/users');assert.deepEqual(queryOf(back),query);
 assert.ok((await html('Users',queryOf(back))).includes('51–55 of 55 records'));
});

test('opening an operational account returns to the same finite dataset, search and effective page',async t=>{
 const f=await queueFixture(t),agency='agency-account';seedApplicant(f,agency,'agency',{status:'approved'});set(f.db,f.owner);
 for(let i=0;i<53;i++)f.db.sqlite.prepare('INSERT INTO agency_clients(id,user_id,name,website,contact,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),agency,'Target client '+i,'https://client.example','Business contact','prospect','Private fixture notes',new Date(2026,0,1,i).toISOString(),new Date(2026,0,1,i).toISOString());
 const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,page=await html('Records',{table:'clients',q:'Target',page:'9999'}),links=[...page.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')),selectedLink=links.find(link=>new URL(link,origin).pathname==='/owner/users'&&queryOf(link).source==='clients');
 assert.ok(selectedLink);const target=queryOf(selectedLink);assert.deepEqual(target,{user:agency,source:'clients',page:'2',q:'target'});
 const detail=await html('Users',target),back=[...detail.matchAll(/href="([^"]+)"[^>]*>Back to records<\/a>/g)][0]?.[1].replaceAll('&amp;','&');assert.ok(back);assert.equal(new URL(back,origin).pathname,'/owner/data');assert.deepEqual(queryOf(back),{table:'clients',page:'2',q:'target'});assert.ok((await html('Records',queryOf(back))).includes('51–53 of 53 records'));
 const orderDetail=await html('Users',{user:agency,source:'orders',review:'required',page:'3',q:'order & company'}),orderBack=[...orderDetail.matchAll(/href="([^"]+)"[^>]*>Back to records<\/a>/g)][0]?.[1].replaceAll('&amp;','&');assert.deepEqual(queryOf(orderBack),{table:'orders',review:'required',page:'3',q:'order & company'});
 for(const source of ['https://foreign.example','users','../orders',['clients','orders']])assert.ok((await html('Users',{user:agency,source})).includes('Check your account filters'));
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
});

test('navigation context never grants a member, closed owner or revoked owner access',async t=>{
 const f=await queueFixture(t),member=seedApplicant(f,'member','creator',{status:'approved'});
 for(const identity of [member,{...f.owner,userId:'ungranted-owner'}]){set(f.db,identity);for(const [view,,query] of cases)await assert.rejects(render(view,query),e=>e.status===403);}
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.owner.userId,new Date().toISOString());set(f.db,f.owner);for(const [view,,query] of cases)assert.equal(await redirected(()=>render(view,query)),'/account-closed');
 f.db.sqlite.prepare('DELETE FROM account_closures WHERE user_id=?').run(f.owner.userId);f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);for(const [view,,query] of cases)await assert.rejects(render(view,query),e=>e.status===403);
});

test('selected owner views keep existing query validation and read operational records without writes or provider access',async t=>{
 const f=await queueFixture(t);seedApplicant(f,selected,'creator');seedVerifiedProperties(f.db,selected,applicationProfile('creator'));set(f.db,f.owner);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected provider request');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 for(const [view,query,text] of [['Applications',{applicant:selected,status:'pending'},'Creator application'],['Verifications',{applicant:selected,status:'all'},'Reviewing one applicant'],['Users',{user:selected},'ACCOUNT DETAILS'],['Records',{table:'orders',review:'required'},'Sales &amp; commissions']]){const page=await html(view,query);assert.ok(page.includes(text),text);assert.ok(!page.includes('PRIVATE_QUERY'));}
 assert.ok((await html('Applications',{status:['pending','approved']})).includes('Check your application filters'));assert.ok((await html('Verifications',{status:['all','verified']})).includes('Check your property filters'));assert.ok((await html('Records',{table:'orders',review:['clear','required']})).includes('Check your record filters'));
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
});

test('actual owner password login returns to selected application, evidence and dataset without approving or changing records',async t=>{
 const f=await queueFixture(t);seedApplicant(f,selected,'creator');seedVerifiedProperties(f.db,selected,applicationProfile('creator'));const providerId=crypto.randomUUID();f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(providerId,f.owner.userId,new Date().toISOString());
 const config={origin,supabaseUrl:'https://owner-return-fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'ed'.repeat(32)},providerUser={id:providerId,email:f.owner.email,email_confirmed_at:new Date().toISOString()},calls=[];
 const auth=emailAuth(f.db,config,async(url,init)=>{assert.equal(new URL(url).origin,config.supabaseUrl);assert.equal(init.redirect,'manual');const path=new URL(url).pathname;calls.push(path);if(path==='/auth/v1/settings')return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:false});if(path==='/auth/v1/token')return Response.json({access_token:'FIXTURE_ACCESS_TOKEN_12345678901234567890',refresh_token:'FIXTURE_REFRESH_TOKEN_12345678901234567890',expires_in:3600,token_type:'bearer',user:providerUser});assert.equal(path,'/auth/v1/user');return Response.json(providerUser);});
 const request=(path,cookie='',body)=>new Request(origin+path,body?{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}:{headers:{Cookie:cookie}});
 for(const [view,path,query] of [cases[0],['Verifications','/owner/verifications',{applicant:selected,status:'all',portal:'creator',page:'2',q:'Publisher'}],cases[2],cases[3]]){
  set(noDb);const target=targetOf(await redirected(()=>render(view,query)),path,query),page=await authPage(request('/auth/owner/login?'+new URLSearchParams({return_to:target})),auth,origin),cookie=page.headers.getSetCookie()[0].split(';')[0],flow=await auth.flow(request('/',cookie));assert.equal(flow.ownerOnly,true);assert.equal(flow.returnTo,target);
  const signed=await authPage(request('/auth/owner/login?return_to=https%3A%2F%2Fforeign.example',cookie,{nonce:flow.nonce,email:f.owner.email,password:'Fixture password 123456!'}),auth,origin);assert.equal(signed.status,303);assert.equal(signed.headers.get('Location'),target);
  const session=signed.headers.getSetCookie().find(c=>c.startsWith(SESSION_COOKIE+'='));assert.ok(session);const user=await auth.resolve(request(target,session.split(';')[0]));assert.equal(user.userId,f.owner.userId);set(f.db,user);const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;assert.ok((await html(view,queryOf(target))).includes('Owner control'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
 }
 assert.equal(calls.length,20);assert.equal(f.db.sqlite.prepare('SELECT status FROM platform_applications WHERE user_id=?').get(selected).status,'pending');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM platform_review_events').get().n,0);for(const table of ['billing_accounts','billing_checkouts','payment_connections','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});
