import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {emailAuth,validateAuthConfig,safeReturnTo,cookieValue,SESSION_COOKIE,FLOW_COOKIE} from '../self-hosted/auth-core.ts';
import {openAuth,sealAuth} from '../self-hosted/auth-seal.ts';
import {authPage} from '../self-hosted/auth-pages.ts';
import {independentFetch,verifiedRequest} from '../self-hosted/bridge.ts';
import {AppError,service} from '../lib/service.ts';
import {accountPortal} from '../lib/portal-policy.ts';

const config={origin:'https://affimaro.example',supabaseUrl:'https://project-fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'df'.repeat(32)};
const uid='11111111-1111-4111-8111-111111111111',otherUid='22222222-2222-4222-8222-222222222222';
const password='Long fixture password 123!',email='owner@example.com',fails=status=>error=>error instanceof AppError&&error.status===status;
const cookie=value=>value.split(';')[0];
const request=(path='/account',cookies='',extra={})=>new Request(config.origin+path,{...extra,headers:{...(cookies?{Cookie:cookies}:{}),...extra.headers}});
async function fixture(t){
  const db=database(t),state={calls:[],user:{id:uid,email,email_confirmed_at:new Date(Date.now()-60000).toISOString(),user_metadata:{display_name:'Owner <Test>'}},outage:false,revoked:false,refreshes:0,expires:3600,generation:0,mutate:null};
  const response=()=>({access_token:'FIXTURE_ACCESS_TOKEN_'+state.generation+'x'.repeat(40),refresh_token:'FIXTURE_REFRESH_TOKEN_'+state.generation,expires_in:state.expires,token_type:'bearer',user:structuredClone(state.user)});
  const fetcher=async(url,init)=>{
    const path=url.slice(config.supabaseUrl.length+'/auth/v1'.length),body=init.body?JSON.parse(init.body):null;state.calls.push({path,method:init.method,headers:init.headers,body});
    assert.ok(url.startsWith(config.supabaseUrl+'/auth/v1/'));assert.equal(init.redirect,'manual');assert.equal(init.headers.apikey,config.publishableKey);assert.ok(init.signal);
    if(state.outage)return new Response('PRIVATE_PROVIDER_ERROR',{status:503});
    if(path==='/settings')return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:state.autoconfirm||false});
    if(path==='/user'&&init.method==='GET'){if(state.revoked)return new Response('PRIVATE_ACCESS_TOKEN',{status:401});return Response.json(state.mutate?state.mutate(structuredClone(state.user),'user'):state.user);}
    if(path==='/user'&&init.method==='PUT'){assert.equal(body.password,password);return Response.json(state.user);}
    if(path.startsWith('/logout?'))return new Response(null,{status:204});
    if(path==='/token?grant_type=password'&&body.password!==password)return new Response('PRIVATE_CREDENTIAL_ERROR',{status:401});
    if(path==='/signup')return Response.json(response());
    if(path==='/recover'||path==='/resend')return Response.json({});
    if(path==='/verify'&&body.token!==(state.code||'123456'))return new Response('PRIVATE_CODE_ERROR',{status:403});
    if(path==='/token?grant_type=refresh_token'){state.refreshes++;assert.equal(body.refresh_token,'FIXTURE_REFRESH_TOKEN_'+state.generation);state.generation++;}
    const data=response();return Response.json(state.mutate?state.mutate(data,'token'):data);
  };
  return {db,state,fetcher,api:emailAuth(db,config,fetcher)};
}
const login=f=>f.api.login({email,password},'192.0.2.10');
function approvedFixture(f,userId,portal='brand'){const at=new Date().toISOString();f.db.sqlite.prepare("INSERT INTO platform_applications(user_id,portal,status,profile_json,created_at,updated_at) VALUES (?,?,'approved','{}',?,?)").run(userId,portal,at,at);}
const session=f=>f.db.sqlite.prepare('SELECT * FROM auth_sessions ORDER BY rowid DESC LIMIT 1').get();
const count=(f,table)=>f.db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
async function post(f,path,flow,cookies,values={}){return authPage(request('/auth/'+path,cookies,{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce:flow.nonce,...values})}),f.api,config.origin);}

test('independent configuration rejects native hosting, redirects and privileged Supabase keys',()=>{
  assert.equal(validateAuthConfig(config).origin,config.origin);
  for(const value of [{origin:'https://affimaro-preview.kindsky66.chatgpt.site'},{origin:'http://affimaro.example'},{supabaseUrl:'https://project-fixture.supabase.co@evil.example'},{supabaseUrl:config.supabaseUrl+'/other'},{publishableKey:'sb_secret_PRIVATE'},{encryptionKey:'short'},{publishableKey:'eyJ.'+btoa(JSON.stringify({role:'service_role'}))+'.fake'}])assert.throws(()=>validateAuthConfig({...config,...value}),fails(503));
  for(const value of ['https://evil.example','//evil.example','/\\evil.example','/auth/reset','/callback','/a\r\nb'])assert.equal(safeReturnTo(value),'/account');
  assert.equal(safeReturnTo('/join/program-1?tab=one'),'/join/program-1?tab=one');
  assert.equal(safeReturnTo('/'+'😊'.repeat(100)),'/account');
});

test('the separate owner host exposes its own login, rejects customer pages and never replays owner POSTs across hosts',async t=>{
 const f=await fixture(t),ownerOrigin='https://admin.affimaro.example',env={DB:f.db,APP_ORIGIN:config.origin,OWNER_ORIGIN:ownerOrigin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey};
 const app=async()=>{throw new Error('No application dispatch expected');};
 const page=await independentFetch(new Request(ownerOrigin+'/auth/owner/login'),env,app,f.fetcher),html=await page.text();assert.equal(page.status,200);assert.match(html,/data-portal="owner"/);assert.ok(!/Create an account|Selected package/.test(html));assert.match(page.headers.get('set-cookie'),/; HttpOnly; Secure; SameSite=Lax/);assert.ok(!page.headers.get('set-cookie').includes('Domain='));assert.match(page.headers.get('X-Robots-Tag'),/noindex/);
 const ownerAuth=emailAuth(f.db,{...config,origin:ownerOrigin},f.fetcher),flowCookie=cookie(page.headers.get('set-cookie'));assert.ok(await ownerAuth.flow(new Request(ownerOrigin,{headers:{Cookie:flowCookie}})));assert.equal(await f.api.flow(request('/',flowCookie)),null);
 for(const path of ['/pricing','/auth/affiliate/signup','/creator','/api/billing/webhook'])assert.equal((await independentFetch(new Request(ownerOrigin+path),env,app,f.fetcher)).status,404);
 assert.equal((await independentFetch(new Request(ownerOrigin+'/auth/owner/signup'),env,app,f.fetcher)).status,404);
 const moved=await independentFetch(request('/owner/users?role=affiliate'),env,app,f.fetcher);assert.equal(moved.headers.get('location'),ownerOrigin+'/owner/users?role=affiliate');
 for(const path of ['/auth/owner/login','/api/admin/applications'])assert.equal((await independentFetch(request(path,'',{method:'POST'}),env,app,f.fetcher)).status,403);
 assert.equal(f.state.calls.length,0);
});

test('the owner hostname requires the stored owner grant for every private page and API',async t=>{
 const f=await fixture(t),ownerOrigin='https://admin.affimaro.example',env={DB:f.db,APP_ORIGIN:config.origin,OWNER_ORIGIN:ownerOrigin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey},signed=await login(f);
 let calls=0;const app=async req=>{calls++;return Response.json({id:req.headers.get('oai-authenticated-user-id')});},req=(path,cookies='')=>new Request(ownerOrigin+path,{headers:{Cookie:cookies,'oai-authenticated-user-id':'forged-owner'}});
 const anonymous=await independentFetch(req('/owner'),env,app,f.fetcher);assert.equal(anonymous.status,307);assert.equal(anonymous.headers.get('location'),'/auth/owner/login?return_to=%2Fowner');assert.equal((await independentFetch(req('/api/admin/applications'),env,app,f.fetcher)).status,401);
 assert.equal((await independentFetch(req('/owner',cookie(signed.cookie)),env,app,f.fetcher)).status,403);assert.equal(calls,0);
 f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(signed.user.userId,new Date().toISOString());
 const ownerAuth=emailAuth(f.db,{...config,origin:ownerOrigin},f.fetcher),ownerSession=await ownerAuth.login({email,password},'owner-host-fixture',null,undefined,true);
 for(const path of ['/owner','/api/admin/applications']){const response=await independentFetch(req(path,cookie(ownerSession.cookie)),env,app,f.fetcher);assert.equal(response.status,200);assert.equal((await response.json()).id,signed.user.userId);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);}
 assert.equal(calls,2);f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(signed.user.userId);assert.equal((await independentFetch(req('/owner',cookie(ownerSession.cookie)),env,app,f.fetcher)).status,403);assert.equal(calls,2);
});
test('sessions use opaque secure cookies, hashed database tokens and separately encrypted provider credentials',async t=>{
  const f=await fixture(t),signed=await login(f),row=session(f);
  assert.match(signed.cookie,/^__Host-affimaro_session=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  const token=cookie(signed.cookie).split('=')[1];assert.notEqual(row.token_hash,token);assert.equal(row.user_id,signed.user.userId);assert.equal(count(f,'auth_identities'),1);
  assert.ok(!JSON.stringify(row).includes('FIXTURE_'));assert.ok(!JSON.stringify(row).includes(password));assert.ok(!signed.cookie.includes('FIXTURE'));
  assert.match(row.encrypted_tokens,/^a1\./);const tokens=await openAuth(row.encrypted_tokens,config.encryptionKey,'auth-session/'+row.id);assert.match(tokens.refresh_token,/^FIXTURE_REFRESH_TOKEN/);
  await assert.rejects(openAuth(row.encrypted_tokens,config.encryptionKey,'auth-session/other'));
  assert.equal((await f.api.resolve(request('/account',cookie(signed.cookie)))).userId,row.user_id);
  assert.equal(f.state.calls.filter(x=>x.path==='/user'&&x.method==='GET').length,2);
  assert.equal(cookieValue(request('/account',`${cookie(signed.cookie)}; ${cookie(signed.cookie)}`),SESSION_COOKIE),null);
});
test('unverified, mismatched provider identities and unexpected client ownership fields cannot create accounts',async t=>{
  const f=await fixture(t);await assert.rejects(f.api.login({email,password,userId:'victim'},'one'),fails(400));assert.equal(f.state.calls.length,0);
  f.state.user.email_confirmed_at=null;await assert.rejects(login(f),fails(403));assert.equal(count(f,'accounts'),0);
  f.state.user.email_confirmed_at=new Date().toISOString();f.state.mutate=(value,kind)=>kind==='token'?{...value,user:{...value.user,id:otherUid}}:value;await assert.rejects(login(f),fails(403));
  f.state.mutate=null;f.state.user.email='someone-else@example.com';await assert.rejects(login(f),fails(403));assert.equal(count(f,'accounts'),0);
});
test('legacy accounts require an explicit verified provider mapping and keep original workspace identifiers',async t=>{
  const f=await fixture(t),legacy=service(f.db,{userId:'legacy-native-id',email});await legacy.saveAccount({name:'Legacy owner'});const workspace=await legacy.createBusiness({name:'Existing workspace',website:''});
  await assert.rejects(login(f),fails(409));assert.equal(count(f,'accounts'),1);assert.equal(count(f,'auth_sessions'),0);
  f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(uid,'legacy-native-id',new Date().toISOString());
  const signed=await login(f);assert.equal(signed.user.userId,'legacy-native-id');assert.equal((await service(f.db,signed.user).workspace()).id,workspace.id);assert.equal(count(f,'accounts'),1);
});
test('signup never signs in before email verification even if the provider returns a session',async t=>{
  const f=await fixture(t);await assert.rejects(f.api.signup({email,password:'weak',name:'Owner'},'one'),fails(400));assert.equal(f.state.calls.length,0);
  await f.api.signup({email,password,name:'Owner'},'one');assert.equal(count(f,'auth_sessions'),0);assert.equal(count(f,'accounts'),0);
  const next=await f.api.newFlow('verify-signup','/workspace',email),flow=await f.api.flow(request('/auth/verify',cookie(next.cookie)));
  await assert.rejects(f.api.verify(flow,{code:'000000'},'one'),fails(401));const signed=await f.api.verify(flow,{code:'123456'},'one');assert.ok(await f.api.resolve(request('/account',cookie(signed.cookie))));
  assert.equal(f.state.calls.find(x=>x.path==='/verify').body.type,'signup');
});
test('flow cookies are authenticated, expire, and retain only a safe return path',async t=>{
  const f=await fixture(t),next=await f.api.newFlow('login','//evil.example'),flow=await f.api.flow(request('/',cookie(next.cookie)));
  assert.equal(flow.returnTo,'/account');assert.match(flow.nonce,/^[a-f0-9]{64}$/);assert.equal(await f.api.flow(request('/',cookie(next.cookie)+'f')),null);
  const expired=await sealAuth({...flow,expires:1},config.encryptionKey,'auth-flow/'+config.origin);assert.equal(await f.api.flow(request('/',FLOW_COOKIE+'='+expired)),null);
});
test('email verification accepts longer provider codes without lowering the provider policy',async t=>{
  const f=await fixture(t),next=await f.api.newFlow('verify-signup','/account',email);f.state.code='12345678';
  for(const code of ['12345','12345678901','1234abcd','123 45678'])await assert.rejects(f.api.verify(next.flow,{code},'one'),fails(400));assert.equal(f.state.calls.length,0);
  await assert.rejects(f.api.verify(next.flow,{code:'123456'},'one'),fails(401));
  const signed=await f.api.verify(next.flow,{code:' 12345678 '},'one');assert.ok(await f.api.resolve(request('/account',cookie(signed.cookie))));assert.equal(f.state.calls.findLast(x=>x.path==='/verify').body.token,'12345678');
});
test('recovery sessions cannot open the application and password reset revokes all local sessions',async t=>{
  const f=await fixture(t),signed=await login(f);await assert.rejects(f.api.reset(request('/auth/reset',cookie(signed.cookie)),{password}),fails(403));
  const next=await f.api.newFlow('verify-recovery','/workspace',email),recovered=await f.api.verify(next.flow,{code:'123456'},'one'),req=request('/auth/reset',cookie(recovered.cookie));
  assert.equal(await f.api.resolve(req),null);assert.equal(await f.api.canReset(req),true);assert.equal(count(f,'auth_sessions'),2);
  const cleared=await f.api.reset(req,{password});assert.match(cleared,/Max-Age=0/);assert.equal(count(f,'auth_sessions'),0);assert.ok(f.state.calls.some(x=>x.path==='/logout?scope=global'));
});

test('all four account types recover through their own forms and return to their own sign-in',async t=>{
 for(const portal of ['brand','affiliate','creator','agency']){
  const f=await fixture(t),signed=await login(f),home={brand:'/workspace',affiliate:'/partner',creator:'/creator',agency:'/agency'}[portal];
  f.db.sqlite.prepare('INSERT INTO account_portals (user_id,portal,created_at) VALUES (?,?,?)').run(signed.user.userId,portal,new Date().toISOString());approvedFixture(f,signed.user.userId,['brand','agency'].includes(portal)?'brand':'affiliate');
  const next=await f.api.newFlow('recover',home,undefined,portal);let result=await post(f,portal+'/recover',next.flow,cookie(next.cookie),{email});assert.equal(result.headers.get('location'),'/auth/'+portal+'/verify');
  const verifyCookie=cookie(result.headers.getSetCookie()[0]),flow=await f.api.flow(request('/',verifyCookie));result=await post(f,portal+'/verify',flow,verifyCookie,{code:'123456'});assert.equal(result.headers.get('location'),'/auth/'+portal+'/reset');
  const recoveryCookie=cookie(result.headers.getSetCookie()[0]);assert.equal(await f.api.resolve(request(home,recoveryCookie)),null);
  const page=await authPage(request('/auth/'+portal+'/reset',recoveryCookie),f.api,config.origin),html=await page.text();assert.match(html,new RegExp('data-portal="'+portal+'"'));assert.ok(!html.includes('FIXTURE_'));const resetCookie=cookie(page.headers.getSetCookie()[0]),resetFlow=await f.api.flow(request('/',resetCookie));
  result=await post(f,portal+'/reset',resetFlow,recoveryCookie+'; '+resetCookie,{password});assert.equal(result.headers.get('location'),'/auth/'+portal+'/login?password_changed=1');assert.equal(count(f,'auth_sessions'),0);assert.equal(await f.api.resolve(request(home,cookie(signed.cookie))),null);assert.equal(await accountPortal(f.db,signed.user.userId),portal);
 }
});
test('provider revocation removes local sessions; provider outages fail closed without losing retryable sessions',async t=>{
  const f=await fixture(t),signed=await login(f),req=request('/account',cookie(signed.cookie));f.state.outage=true;await assert.rejects(f.api.resolve(req),fails(503));assert.equal(count(f,'auth_sessions'),1);
  f.state.outage=false;f.state.revoked=true;assert.equal(await f.api.resolve(req),null);assert.equal(count(f,'auth_sessions'),0);
});
test('logout clears local authority even when Supabase is unavailable',async t=>{
  const f=await fixture(t),signed=await login(f);f.state.outage=true;const result=await f.api.logout(request('/auth/logout',cookie(signed.cookie)));assert.match(result,/Max-Age=0/);assert.equal(count(f,'auth_sessions'),0);
});
test('refresh rotates encrypted credentials under a lease and verifies the resulting identity',async t=>{
  const f=await fixture(t);f.state.expires=30;const signed=await login(f);f.state.expires=3600;const user=await f.api.resolve(request('/account',cookie(signed.cookie))),row=session(f),tokens=await openAuth(row.encrypted_tokens,config.encryptionKey,'auth-session/'+row.id);
  assert.equal(user.userId,row.user_id);assert.equal(f.state.refreshes,1);assert.equal(tokens.refresh_token,'FIXTURE_REFRESH_TOKEN_1');assert.equal(row.lease_id,null);
  await f.api.resolve(request('/account',cookie(signed.cookie)));assert.equal(f.state.refreshes,1);
});
test('an active refresh lease prevents duplicate refreshes when the old access token has expired',async t=>{
  const f=await fixture(t),signed=await login(f),row=session(f),tokens=await openAuth(row.encrypted_tokens,config.encryptionKey,'auth-session/'+row.id);tokens.expires_at=1;
  f.db.sqlite.prepare('UPDATE auth_sessions SET encrypted_tokens=?,lease_id=?,lease_until=? WHERE id=?').run(await sealAuth(tokens,config.encryptionKey,'auth-session/'+row.id),'another-request',Math.floor(Date.now()/1000)+30,row.id);
  await assert.rejects(f.api.resolve(request('/account',cookie(signed.cookie))),fails(503));assert.equal(f.state.refreshes,0);assert.equal(count(f,'auth_sessions'),1);
});
test('authentication throttles are shared, salted and contain no raw email or IP address',async t=>{
  const f=await fixture(t);f.state.mutate=()=>({invalid:'response'});
  for(let i=0;i<8;i++)await assert.rejects(login(f));await assert.rejects(login(f),fails(429));assert.equal(f.state.calls.filter(x=>x.path==='/token?grant_type=password').length,8);
  const rows=f.db.sqlite.prepare('SELECT * FROM auth_rate_limits').all();assert.equal(rows.length,2);assert.ok(rows.every(x=>/^[a-f0-9]{64}$/.test(x.id)));assert.ok(!JSON.stringify(rows).includes(email));assert.ok(!JSON.stringify(rows).includes('192.0.2.10'));
});
test('provider auto-confirm cannot silently bypass verified-email policy',async t=>{
  const f=await fixture(t);f.state.autoconfirm=true;await assert.rejects(login(f),fails(503));await assert.rejects(f.api.signup({email,password,name:'Owner'},'other-ip'),fails(503));assert.ok(f.state.calls.every(x=>x.path==='/settings'));assert.equal(count(f,'auth_sessions'),0);assert.equal(count(f,'accounts'),0);
});
test('HTML sign-in navigation preserves Origin and keeps referrers on the application domain',async t=>{
  const f=await fixture(t),page=await authPage(request('/auth/login?return_to=%2Fworkspace'),f.api,config.origin);
  const cookies=cookie(page.headers.getSetCookie()[0]),flow=await f.api.flow(request('/auth/login',cookies));
  // Fetch's append-a-request-origin-header algorithm sends Origin: null for
  // non-CORS HTML form navigation under Referrer-Policy: no-referrer.
  const origin=page.headers.get('referrer-policy')==='no-referrer'?'null':config.origin;
  const result=await authPage(request('/auth/login',cookies,{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'navigate','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce:flow.nonce,email,password})}),f.api,config.origin);
  assert.equal(result.status,303,'A same-origin HTML form must reach sign-in with the policy served by its page.');
  assert.equal(result.headers.get('location'),'/workspace');
  assert.equal(page.headers.get('referrer-policy'),'same-origin');
  assert.equal(result.headers.get('referrer-policy'),'same-origin');
});
test('forms enforce same-origin CSRF, purpose binding, unique fields, method and size limits',async t=>{
  const f=await fixture(t),next=await f.api.newFlow('login','/workspace'),cookies=cookie(next.cookie);
  for(const extra of [{headers:{Origin:'https://evil.example'}},{headers:{Origin:'null'}},{headers:{Origin:config.origin,'sec-fetch-site':'cross-site'}},{nonce:'wrong'},{extra:'unexpected'},{body:'nonce='+next.flow.nonce+'&nonce='+next.flow.nonce},{body:'nonce='+next.flow.nonce+'&password='+'a'.repeat(9000)}]){
    const headers={Origin:config.origin,'Content-Type':'application/x-www-form-urlencoded',...extra.headers},body=extra.body||new URLSearchParams({nonce:extra.nonce||next.flow.nonce,email,password,...(extra.extra?{unknown:extra.extra}:{})});
    const result=await authPage(request('/auth/login',cookies,{method:'POST',headers,body}),f.api,config.origin);assert.ok([400,403,413].includes(result.status));assert.equal(f.state.calls.length,0);
  }
  assert.equal((await post(f,'signup',next.flow,cookies,{email,password,name:'Owner'})).status,403);
  const method=await authPage(request('/auth/login','',{method:'DELETE'}),f.api,config.origin);assert.equal(method.status,405);
  const success=await post(f,'login',next.flow,cookies,{email,password});assert.equal(success.status,303);assert.equal(success.headers.get('location'),'/workspace');assert.match(success.headers.get('set-cookie'),/HttpOnly/);
});
test('full form recovery flow keeps tokens off URLs and pages and requires POST to sign out',async t=>{
  const f=await fixture(t),next=await f.api.newFlow('recover','/workspace');let result=await post(f,'recover',next.flow,cookie(next.cookie),{email});assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/auth/verify');
  const flowCookie=cookie(result.headers.getSetCookie()[0]),flow=await f.api.flow(request('/',flowCookie));result=await post(f,'verify',flow,flowCookie,{code:'123456'});assert.equal(result.headers.get('location'),'/auth/reset');
  const sessionCookie=cookie(result.headers.getSetCookie()[0]);const resetPage=await authPage(request('/auth/reset',sessionCookie),f.api,config.origin);assert.equal(resetPage.status,200);assert.match(resetPage.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await resetPage.text();assert.ok(!html.includes('FIXTURE_'));assert.match(html,/<script src="\/auth-form.js" defer><\/script>/);assert.ok(!/<script(?! src=)/.test(html));assert.match(resetPage.headers.get('content-security-policy'),/script-src 'self'/);
  const resetFlowCookie=cookie(resetPage.headers.getSetCookie()[0]),resetFlow=await f.api.flow(request('/',resetFlowCookie));result=await post(f,'reset',resetFlow,sessionCookie+'; '+resetFlowCookie,{password});assert.equal(result.headers.get('location'),'/auth/login?password_changed=1');assert.equal(count(f,'auth_sessions'),0);
  const signed=await login(f),logout=await authPage(request('/auth/logout',cookie(signed.cookie)),f.api,config.origin);assert.equal(logout.status,200);assert.equal(count(f,'auth_sessions'),1);
});
test('the independent entry strips all spoofed identity headers and injects only a verified session',async t=>{
  const f=await fixture(t),env={DB:f.db,APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey};
  const forged={'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@example.com','oai-authenticated-user-full-name':'spoof','oai-authenticated-user-invented':'spoof'};
  assert.equal(verifiedRequest(request('/api/account','',{headers:forged}),null).headers.get('oai-authenticated-user-id'),null);
  let received;const app=async req=>{received=req;return Response.json({id:req.headers.get('oai-authenticated-user-id')});};
  const anonymous=await independentFetch(request('/api/account','',{headers:forged}),env,app,f.fetcher);assert.equal((await anonymous.json()).id,null);assert.ok([...received.headers.keys()].every(key=>!key.startsWith('oai-authenticated-user-')));
  const signed=await login(f);approvedFixture(f,signed.user.userId);const verified=await independentFetch(request('/api/account',cookie(signed.cookie),{headers:forged}),env,app,f.fetcher);assert.equal((await verified.json()).id,signed.user.userId);assert.equal(received.headers.get('oai-authenticated-user-invented'),null);assert.match(verified.headers.get('cache-control'),/no-store/);
  f.state.outage=true;let called=false;const unavailable=await independentFetch(request('/api/account',cookie(signed.cookie)),env,async()=>{called=true;return new Response();},f.fetcher);assert.equal(unavailable.status,503);assert.equal(called,false);assert.ok(!(await unavailable.text()).includes('PRIVATE_'));
  const wrongHost=await independentFetch(new Request('https://other.example/api/account'),env,app,f.fetcher);assert.equal(wrongHost.status,403);
  const missing=await independentFetch(request('/account'),{DB:f.db},app,f.fetcher);assert.equal(missing.status,503);
});
test('separate verified identities remain separate accounts and cannot read another workspace',async t=>{
  const f=await fixture(t),owner=await login(f),workspace=await service(f.db,owner.user).createBusiness({name:'Private owner workspace',website:''});
  f.state.user={...f.state.user,id:otherUid,email:'other@example.com'};const other=await f.api.login({email:'other@example.com',password},'other-ip');assert.notEqual(other.user.userId,owner.user.userId);assert.equal(await service(f.db,other.user).workspace(),null);assert.equal((await service(f.db,owner.user).workspace()).id,workspace.id);
});

test('only exact POST store-event paths bypass browser sessions, and maintenance still blocks them',async t=>{
  const f=await fixture(t),signed=await login(f),cookies=cookie(signed.cookie),env={DB:f.db,APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey};
  f.state.outage=true;const before=f.state.calls.length;
  const machine=async req=>{assert.equal(req.headers.get('oai-authenticated-user-id'),null);return Response.json({reached:true});};
  for(const path of ['/api/custom/event','/api/woocommerce/event','/api/billing/webhook']){
    const response=await independentFetch(request(path,cookies,{method:'POST',headers:{'oai-authenticated-user-id':'spoof'}}),env,machine,f.fetcher);
    assert.equal(response.status,200);assert.equal(f.state.calls.length,before);
    const paused=await independentFetch(request(path,cookies,{method:'POST'}),{...env,AFFIMARO_MIGRATION_MAINTENANCE:'true'},async()=>{throw new Error('The paused application must not run.');},f.fetcher);assert.equal(paused.status,503);
  }
  for(const [path,method] of [['/api/billing/webhook','GET'],['/api/billing/webhook/extra','POST'],['/api/custom/event','GET'],['/api/custom/manage','POST'],['/api/custom/event/extra','POST'],['/api/woocommerce/manage','POST'],['/api/store','POST']]){
    const response=await independentFetch(request(path,cookies,{method}),env,async()=>{throw new Error('A browser API must verify its session first.');},f.fetcher);assert.equal(response.status,503);
  }
});

test('getting-started routes resolve the verified session and cannot be cached or impersonated',async t=>{
  const f=await fixture(t),signed=await login(f),env={DB:f.db,APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey};
  approvedFixture(f,signed.user.userId);
  const app=async req=>Response.json({id:req.headers.get('oai-authenticated-user-id')});
  for(const path of ['/get-started?plan=starter','/start','/start?view=affiliate','/start/']){
    const response=await independentFetch(request(path,cookie(signed.cookie)),env,app,f.fetcher);
    assert.equal((await response.json()).id,signed.user.userId);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('vary'),/Cookie/);
  }
  const anonymous=await independentFetch(request('/start','',{headers:{'oai-authenticated-user-id':'victim'}}),env,app,f.fetcher);
  assert.equal((await anonymous.json()).id,null);assert.equal(anonymous.headers.get('cache-control'),'private, no-store');
  f.state.revoked=true;const revoked=await independentFetch(request('/start',cookie(signed.cookie)),env,app,f.fetcher);assert.equal((await revoked.json()).id,null);
});

test('separate signup binds the portal through verification and creates an unapproved application without an active workspace',async t=>{
  for(const portal of ['brand','affiliate']){
    const f=await fixture(t),page=await authPage(request('/auth/'+portal+'/signup'),f.api,config.origin),html=await page.text();
    assert.equal(page.status,200);assert.ok(html.includes('data-portal="'+portal+'"'));assert.ok(html.includes('action="/auth/'+portal+'/signup"'));
    assert.equal(html.includes('name="businessName"'),portal==='brand');assert.equal(html.includes('name="channel"'),portal==='affiliate');
    const cookies=cookie(page.headers.getSetCookie()[0]),flow=await f.api.flow(request('/',cookies));assert.equal(flow.portal,portal);
    const values={email,password,name:'Test Registrant',...(portal==='brand'?{businessName:'Registered Example Brand'}:{channel:'Newsletter'})};
    const submitted=await post(f,portal+'/signup',flow,cookies,values);assert.equal(submitted.status,303);assert.equal(submitted.headers.get('location'),'/auth/'+portal+'/verify');
    assert.equal(count(f,'accounts'),0);assert.equal(count(f,'workspaces'),0);assert.equal(count(f,'affiliate_profiles'),0);
    const verificationCookie=cookie(submitted.headers.getSetCookie()[0]),verificationFlow=await f.api.flow(request('/',verificationCookie));
    assert.equal(verificationFlow.portal,portal);assert.equal(verificationFlow.onboarding.name,values.name);assert.ok(!JSON.stringify(verificationFlow).includes(password));
    const verified=await post(f,portal+'/verify',verificationFlow,verificationCookie,{code:'123456'});assert.equal(verified.status,303);assert.equal(verified.headers.get('location'),portal==='brand'?'/workspace':'/partner');
    const signed=await f.api.resolve(request('/account',cookie(verified.headers.getSetCookie()[0])));assert.equal(await accountPortal(f.db,signed.userId),portal);
    assert.equal(count(f,'workspaces'),0);assert.equal(count(f,'affiliate_profiles'),0);const admission=f.db.sqlite.prepare('SELECT portal,status FROM platform_applications WHERE user_id=?').get(signed.userId);assert.equal(admission.portal,portal);assert.equal(admission.status,'draft');assert.equal(count(f,'applications'),0);assert.equal(count(f,'payout_requests'),0);assert.equal(count(f,'billing_accounts'),0);
  }
});

test('portal flow cannot be changed through the form path, extra fields or editable provider metadata',async t=>{
  const f=await fixture(t),next=await f.api.newFlow('signup','/partner',undefined,'affiliate'),cookies=cookie(next.cookie);
  const wrong=await post(f,'brand/signup',next.flow,cookies,{email,password,name:'Applicant',businessName:'Wrong brand'});assert.equal(wrong.status,403);assert.equal(f.state.calls.length,0);
  const extra=await post(f,'affiliate/signup',next.flow,cookies,{email,password,name:'Applicant',channel:'Blog',portal:'brand'});assert.equal(extra.status,400);assert.equal(f.state.calls.length,0);
  const signed=await login(f);await service(f.db,signed.user).saveAffiliate({name:'Affiliate User',channel:'Blog',website:'',bio:''});
  f.state.user.user_metadata={display_name:'Changed name',role:'brand',portal:'brand'};
  const before=count(f,'auth_sessions');await assert.rejects(f.api.login({email,password},'brand-attempt',null,'brand'),fails(403));
  assert.equal(count(f,'auth_sessions'),before);assert.equal(await accountPortal(f.db,signed.user.userId),'affiliate');assert.ok(await f.api.resolve(request('/partner',cookie(signed.cookie))));
  await f.api.login({email,password},'affiliate-attempt',null,'affiliate');assert.equal(count(f,'workspaces'),0);
});

test('legacy dual records keep the original brand identity and reject affiliate sign-in without replacing the working session',async t=>{
  const f=await fixture(t),legacy=service(f.db,{userId:'original-legacy-owner',email});await legacy.saveAccount({name:'Original Owner'});
  const workspace=await legacy.createBusiness({name:'Original Brand',website:''});
  f.db.sqlite.prepare("INSERT INTO affiliate_profiles(user_id,display_name,channel,website,bio,created_at) VALUES (?,'Original affiliate profile','Other',NULL,'',?)").run('original-legacy-owner',new Date().toISOString());
  f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(uid,'original-legacy-owner',new Date().toISOString());
  const signed=await f.api.login({email,password},'brand',null,'brand');assert.equal(signed.user.userId,'original-legacy-owner');assert.equal(await accountPortal(f.db,signed.user.userId),'brand');
  const before=count(f,'auth_sessions');await assert.rejects(f.api.login({email,password},'wrong-portal',cookie(signed.cookie).split('=')[1],'affiliate'),fails(403));
  assert.equal(count(f,'auth_sessions'),before);assert.equal((await f.api.resolve(request('/workspace',cookie(signed.cookie)))).userId,'original-legacy-owner');
  assert.equal((await legacy.workspace()).id,workspace.id);assert.equal(count(f,'accounts'),1);assert.equal(count(f,'affiliate_profiles'),1);
});

test('owner sign-in has no public signup and requires an existing mapped platform grant before creating a session',async t=>{
 const f=await fixture(t);f.state.user.user_metadata.role='owner';
 const page=await authPage(request('/auth/owner/login?return_to=%2Fworkspace'),f.api,config.origin),html=await page.text(),flowCookie=cookie(page.headers.getSetCookie()[0]),flow=await f.api.flow(request('/',flowCookie));
 assert.equal(page.status,200);assert.match(html,/data-portal="owner"/);assert.match(html,/owner control panel/);assert.ok(!html.includes('Create an account'));assert.ok(!html.includes('Choose a different account type'));assert.equal(flow.ownerOnly,true);assert.equal(flow.returnTo,'/owner');
 const denied=await post(f,'owner/login',flow,flowCookie,{email,password});assert.equal(denied.status,403);assert.equal(count(f,'accounts'),0);assert.equal(count(f,'auth_sessions'),0);assert.equal(count(f,'platform_admins'),0);
 for(const method of ['GET','POST'])assert.equal((await authPage(request('/auth/owner/signup','',{method}),f.api,config.origin)).status,404);
 const original=await login(f);await assert.rejects(f.api.login({email,password},'owner-entry',undefined,undefined,true),fails(403));
 const business=await service(f.db,original.user).createBusiness({name:'Preserved workspace',website:''});f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(original.user.userId,new Date().toISOString());
 const granted=await f.api.login({email,password},'owner-entry',undefined,undefined,true);assert.equal(granted.user.userId,original.user.userId);assert.equal(count(f,'accounts'),1);assert.equal((await service(f.db,granted.user).workspace()).id,business.id);
});
test('owner login and recovery flows cannot be submitted through customer auth paths or promoted through form fields',async t=>{
 const f=await fixture(t),owner=await f.api.newFlow('login','/owner',undefined,undefined,undefined,undefined,true),regular=await f.api.newFlow('login','/account');
 const calls=f.state.calls.length;
 assert.equal((await post(f,'login',owner.flow,cookie(owner.cookie),{email,password})).status,403);
 assert.equal((await post(f,'owner/login',regular.flow,cookie(regular.cookie),{email,password})).status,403);
 assert.equal((await post(f,'owner/login',owner.flow,cookie(owner.cookie),{email,password,ownerOnly:'true'})).status,400);
 assert.equal(f.state.calls.length,calls);assert.equal(count(f,'accounts'),0);
});
test('the full owner recovery flow stays inside owner auth and rechecks the grant before password changes',async t=>{
 const f=await fixture(t),signed=await login(f);f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(signed.user.userId,new Date().toISOString());
 const start=await authPage(request('/auth/owner/recover'),f.api,config.origin),startCookie=cookie(start.headers.getSetCookie()[0]),startFlow=await f.api.flow(request('/',startCookie));
 let result=await post(f,'owner/recover',startFlow,startCookie,{email});assert.equal(result.headers.get('location'),'/auth/owner/verify');
 const verifyCookie=cookie(result.headers.getSetCookie()[0]),verifyFlow=await f.api.flow(request('/',verifyCookie));assert.equal(verifyFlow.ownerOnly,true);
 result=await post(f,'owner/verify',verifyFlow,verifyCookie,{code:'123456'});assert.equal(result.headers.get('location'),'/auth/owner/reset');
 const resetSession=cookie(result.headers.getSetCookie()[0]),reset=await authPage(request('/auth/owner/reset',resetSession),f.api,config.origin),resetCookie=cookie(reset.headers.getSetCookie()[0]),resetFlow=await f.api.flow(request('/',resetCookie));assert.equal(resetFlow.ownerOnly,true);
 f.db.sqlite.prepare('DELETE FROM platform_admins').run();result=await post(f,'owner/reset',resetFlow,resetCookie+'; '+resetSession,{password});assert.equal(result.status,403);
 f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(signed.user.userId,new Date().toISOString());result=await post(f,'owner/reset',resetFlow,resetCookie+'; '+resetSession,{password});assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/auth/owner/login?password_changed=1');assert.equal(count(f,'auth_sessions'),0);
});

test('closing an account requires its current session, fresh matching identity, current password and explicit confirmation',async t=>{
 const f=await fixture(t),first=await login(f),second=await login(f),local=first.user.userId,req=request('/api/account-closure',cookie(first.cookie)),value={password,confirmation:'CLOSE',acknowledged:true,reason:'No longer using Affimaro.'};
 await assert.rejects(f.api.closeAccount(request('/api/account-closure'),value),fails(401));await assert.rejects(f.api.closeAccount(req,{...value,password:'Wrong password'}),fails(401));await assert.rejects(f.api.closeAccount(req,{...value,confirmation:'close'}),fails(400));
 f.state.mutate=(raw,kind)=>kind==='user'?{...raw,id:otherUid}:raw;await assert.rejects(f.api.closeAccount(req,value),fails(401));assert.equal(count(f,'account_closures'),0);f.state.mutate=null;
 const result=await f.api.closeAccount(request('/api/account-closure',cookie(second.cookie)),value);assert.equal(result.closed,true);assert.equal(count(f,'auth_sessions'),0);assert.equal(count(f,'accounts'),1);assert.equal(count(f,'auth_identities'),1);assert.equal(f.db.sqlite.prepare('SELECT user_id FROM account_closures').get().user_id,local);assert.ok(f.state.calls.some(c=>c.path==='/logout?scope=global'));
 assert.equal(await f.api.resolve(req),null);await assert.rejects(login(f),fails(403));assert.equal(count(f,'auth_sessions'),0);
});
test('the independent closure endpoint checks same-origin requests and clears both host-only cookies after success',async t=>{
 const f=await fixture(t),signed=await login(f),env={DB:f.db,APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey},body=JSON.stringify({password,confirmation:'CLOSE',acknowledged:true,reason:''});const app=async()=>{throw new Error('Closure must remain inside the auth boundary.');};
 const send=origin=>independentFetch(request('/api/account-closure',cookie(signed.cookie),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body}),env,app,f.fetcher);
 assert.equal((await send('https://evil.example')).status,403);assert.equal(count(f,'account_closures'),0);const r=await send(config.origin);assert.equal(r.status,200);const cookies=r.headers.get('set-cookie');assert.ok(cookies.includes(SESSION_COOKIE+'=;'));assert.ok(cookies.includes(FLOW_COOKIE+'=;'));assert.ok(!cookies.includes('Domain='));assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('the platform owner is protected from the closure endpoint and a retained tombstone rejects stale sessions before token refresh',async t=>{
 const f=await fixture(t),signed=await login(f),local=signed.user.userId;f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(local,new Date().toISOString());await assert.rejects(f.api.closeAccount(request('/api/account-closure',cookie(signed.cookie)),{password,confirmation:'CLOSE',acknowledged:true,reason:''}),fails(403));assert.equal(count(f,'account_closures'),0);f.db.sqlite.prepare('DELETE FROM platform_admins').run();f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run(local,'fixture closure',new Date().toISOString());const before=f.state.calls.length;assert.equal(await f.api.resolve(request('/account',cookie(signed.cookie))),null);assert.equal(f.state.calls.length,before);assert.equal(count(f,'auth_sessions'),0);
});
