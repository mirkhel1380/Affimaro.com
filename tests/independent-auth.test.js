import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {emailAuth,validateAuthConfig,safeReturnTo,cookieValue,SESSION_COOKIE,FLOW_COOKIE} from '../self-hosted/auth-core.ts';
import {openAuth,sealAuth} from '../self-hosted/auth-seal.ts';
import {authPage} from '../self-hosted/auth-pages.ts';
import {independentFetch,verifiedRequest} from '../self-hosted/bridge.ts';
import {AppError,service} from '../lib/service.ts';

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
    if(path==='/signup')return Response.json(response());
    if(path==='/recover'||path==='/resend')return Response.json({});
    if(path==='/verify'&&body.token!==(state.code||'123456'))return new Response('PRIVATE_CODE_ERROR',{status:403});
    if(path==='/token?grant_type=refresh_token'){state.refreshes++;assert.equal(body.refresh_token,'FIXTURE_REFRESH_TOKEN_'+state.generation);state.generation++;}
    const data=response();return Response.json(state.mutate?state.mutate(data,'token'):data);
  };
  return {db,state,fetcher,api:emailAuth(db,config,fetcher)};
}
const login=f=>f.api.login({email,password},'192.0.2.10');
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
  const sessionCookie=cookie(result.headers.getSetCookie()[0]);const resetPage=await authPage(request('/auth/reset',sessionCookie),f.api,config.origin);assert.equal(resetPage.status,200);assert.match(resetPage.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await resetPage.text();assert.ok(!html.includes('FIXTURE_'));assert.ok(!html.includes('<script'));
  const resetFlowCookie=cookie(resetPage.headers.getSetCookie()[0]),resetFlow=await f.api.flow(request('/',resetFlowCookie));result=await post(f,'reset',resetFlow,sessionCookie+'; '+resetFlowCookie,{password});assert.equal(result.headers.get('location'),'/auth/login?password_changed=1');assert.equal(count(f,'auth_sessions'),0);
  const signed=await login(f),logout=await authPage(request('/auth/logout',cookie(signed.cookie)),f.api,config.origin);assert.equal(logout.status,200);assert.equal(count(f,'auth_sessions'),1);
});
test('the independent entry strips all spoofed identity headers and injects only a verified session',async t=>{
  const f=await fixture(t),env={DB:f.db,APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey};
  const forged={'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@example.com','oai-authenticated-user-full-name':'spoof','oai-authenticated-user-invented':'spoof'};
  assert.equal(verifiedRequest(request('/api/account','',{headers:forged}),null).headers.get('oai-authenticated-user-id'),null);
  let received;const app=async req=>{received=req;return Response.json({id:req.headers.get('oai-authenticated-user-id')});};
  const anonymous=await independentFetch(request('/api/account','',{headers:forged}),env,app,f.fetcher);assert.equal((await anonymous.json()).id,null);assert.ok([...received.headers.keys()].every(key=>!key.startsWith('oai-authenticated-user-')));
  const signed=await login(f),verified=await independentFetch(request('/api/account',cookie(signed.cookie),{headers:forged}),env,app,f.fetcher);assert.equal((await verified.json()).id,signed.user.userId);assert.equal(received.headers.get('oai-authenticated-user-invented'),null);assert.match(verified.headers.get('cache-control'),/no-store/);
  f.state.outage=true;let called=false;const unavailable=await independentFetch(request('/api/account',cookie(signed.cookie)),env,async()=>{called=true;return new Response();},f.fetcher);assert.equal(unavailable.status,503);assert.equal(called,false);assert.ok(!(await unavailable.text()).includes('PRIVATE_'));
  const wrongHost=await independentFetch(new Request('https://other.example/api/account'),env,app,f.fetcher);assert.equal(wrongHost.status,403);
  const missing=await independentFetch(request('/account'),{DB:f.db},app,f.fetcher);assert.equal(missing.status,503);
});
test('separate verified identities remain separate accounts and cannot read another workspace',async t=>{
  const f=await fixture(t),owner=await login(f),workspace=await service(f.db,owner.user).createBusiness({name:'Private owner workspace',website:''});
  f.state.user={...f.state.user,id:otherUid,email:'other@example.com'};const other=await f.api.login({email:'other@example.com',password},'other-ip');assert.notEqual(other.user.userId,owner.user.userId);assert.equal(await service(f.db,other.user).workspace(),null);assert.equal((await service(f.db,owner.user).workspace()).id,workspace.id);
});

test('getting-started routes resolve the verified session and cannot be cached or impersonated',async t=>{
  const f=await fixture(t),signed=await login(f),env={DB:f.db,APP_ORIGIN:config.origin,SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,AUTH_SESSION_ENCRYPTION_KEY:config.encryptionKey};
  const app=async req=>Response.json({id:req.headers.get('oai-authenticated-user-id')});
  for(const path of ['/start','/start?view=affiliate','/start/']){
    const response=await independentFetch(request(path,cookie(signed.cookie)),env,app,f.fetcher);
    assert.equal((await response.json()).id,signed.user.userId);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.match(response.headers.get('vary'),/Cookie/);
  }
  const anonymous=await independentFetch(request('/start','',{headers:{'oai-authenticated-user-id':'victim'}}),env,app,f.fetcher);
  assert.equal((await anonymous.json()).id,null);assert.equal(anonymous.headers.get('cache-control'),'private, no-store');
  f.state.revoked=true;const revoked=await independentFetch(request('/start',cookie(signed.cookie)),env,app,f.fetcher);assert.equal((await revoked.json()).id,null);
});
