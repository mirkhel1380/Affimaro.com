import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service} from '../lib/service.ts';
import {nativeEmailConfirmation,nativeConfirmationAccount} from '../self-hosted/native-email-confirmation.ts';

const owner={userId:'legacy-native-owner',email:'owner@example.com'},uid='11111111-1111-4111-8111-111111111111';
const provider={supabaseUrl:'https://fixture-project.supabase.co',publishableKey:'sb_publishable_FIXTURE_KEY_123456789012'};
const access='FIXTURE_PROVIDER_ACCESS_TOKEN_NOT_FOR_BROWSER',refresh='FIXTURE_PROVIDER_REFRESH_NOT_FOR_BROWSER';
function request(body={action:'verify',code:'123456'},headers={},method='POST'){
  return new Request('https://native.example/api/setup/confirm-email',{method,headers:{Origin:'https://native.example','Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
async function fixture(t){
  const db=database(t),s=service(db,owner);await s.saveAccount({name:'Preserved owner'});await s.createBusiness({name:'Preserved workspace',website:''});
  const state={calls:[],policy:{mailer_autoconfirm:false,external:{email:true}},user:{id:uid,email:owner.email,email_confirmed_at:new Date().toISOString()},change:null};
  const fetcher=async(url,init)=>{
    const path=url.replace(provider.supabaseUrl+'/auth/v1',''),body=init.body?JSON.parse(init.body):undefined;state.calls.push({path,init,body});
    assert.equal(init.redirect,'error');assert.equal(init.headers.apikey,provider.publishableKey);
    if(state.change){const changed=state.change(path,init);if(changed)return changed;}
    if(path==='/settings'){assert.equal(init.method,'GET');return Response.json(state.policy);}
    if(path==='/resend'){assert.equal(init.method,'POST');assert.deepEqual(body,{type:'signup',email:owner.email});return Response.json({});}
    if(path==='/verify'){assert.deepEqual(body,{type:'email',email:owner.email,token:'123456'});return Response.json({token_type:'bearer',access_token:access,refresh_token:refresh,user:state.user});}
    if(path==='/user'){assert.equal(init.method,'GET');assert.equal(init.headers.Authorization,'Bearer '+access);return Response.json(state.user);}
    if(path==='/logout?scope=local'){assert.equal(init.method,'POST');assert.equal(init.headers.Authorization,'Bearer '+access);return new Response(null,{status:204});}
    throw new Error('Unexpected provider request');
  };
  return {db,state,options:{native:true,db,user:owner,provider,fetcher}};
}
const count=(db,table)=>db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;

test('setup email verification is native-only and tied to the existing authenticated account email',async t=>{
  const f=await fixture(t);assert.equal((await nativeConfirmationAccount(true,f.db,owner)).email,owner.email);
  for(const change of [{native:false},{user:null},{user:{...owner,userId:'other'}},{user:{...owner,email:'someone-else@example.com'}}]){
    const response=await nativeEmailConfirmation(request(),{...f.options,...change});assert.equal(response.status,404);
  }
  assert.equal(f.state.calls.length,0);assert.equal(count(f.db,'auth_rate_limits'),0);
  const forbiddenDb={prepare(){throw new Error('Independent mode must not read native data');}};
  assert.equal((await nativeEmailConfirmation(request(),{...f.options,native:false,db:forbiddenDb})).status,404);
});
test('setup rejects cross-site requests, invalid codes and client-selected emails before sending anything',async t=>{
  const f=await fixture(t);
  for(const req of [request(undefined,{Origin:'https://foreign.example'}),request(undefined,{'Sec-Fetch-Site':'cross-site'}),request(undefined,{'Content-Type':'text/plain'}),request({action:'verify',code:'123'}),request({action:'verify',code:'123456',email:'victim@example.com'}),request({action:'send',email:'victim@example.com'}),request(undefined,{},'GET')])assert.ok((await nativeEmailConfirmation(req,f.options)).status>=400);
  assert.equal(f.state.calls.length,0);assert.equal(count(f.db,'auth_rate_limits'),0);
});
test('a valid code confirms the provider email without creating app sessions or changing legacy records',async t=>{
  const f=await fixture(t),before=f.db.sqlite.prepare('SELECT * FROM workspaces').all();
  const response=await nativeEmailConfirmation(request(),f.options),text=await response.text();assert.equal(response.status,200);assert.deepEqual(JSON.parse(text),{ok:true,confirmed:true});
  for(const secret of [access,refresh,'123456',uid,owner.email])assert.ok(!text.includes(secret));
  assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(f.state.calls.map(x=>x.path),['/settings','/verify','/user','/logout?scope=local']);
  assert.equal(count(f.db,'accounts'),1);assert.equal(count(f.db,'auth_sessions'),0);assert.equal(count(f.db,'auth_identities'),0);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM workspaces').all(),before);
  assert.ok(!JSON.stringify(f.db.sqlite.prepare('SELECT * FROM auth_rate_limits').all()).includes(owner.email));
});
test('explicit resend targets the authenticated legacy email and cannot create another provider user',async t=>{
  const f=await fixture(t),response=await nativeEmailConfirmation(request({action:'send'}),f.options);
  assert.deepEqual(await response.json(),{ok:true,sent:true});assert.deepEqual(f.state.calls.map(x=>x.path),['/settings','/resend']);
  assert.equal(count(f.db,'accounts'),1);assert.equal(count(f.db,'auth_identities'),0);
});
test('email verification policy fails closed before resending or verifying codes',async t=>{
  for(const policy of [{mailer_autoconfirm:true,external:{email:true}},{mailer_autoconfirm:false,external:{email:false}},{}]){
    const f=await fixture(t);f.state.policy=policy;assert.equal((await nativeEmailConfirmation(request(),f.options)).status,503);assert.deepEqual(f.state.calls.map(x=>x.path),['/settings']);
  }
});
test('wrong, expired and rate-limited codes return fixed messages without echoing provider details',async t=>{
  for(const [status,expected] of [[403,400],[429,429],[500,503]]){
    const f=await fixture(t);f.state.change=path=>path==='/verify'?new Response('FIXTURE_PRIVATE_PROVIDER_DETAIL',{status}):null;
    const response=await nativeEmailConfirmation(request(),f.options);assert.equal(response.status,expected);assert.ok(!(await response.text()).includes('FIXTURE_PRIVATE_PROVIDER_DETAIL'));assert.equal(count(f.db,'auth_sessions'),0);
  }
});
test('a mismatched, unverified or malformed provider identity cannot claim confirmation',async t=>{
  for(const mutate of [u=>u.email='victim@example.com',u=>u.email_confirmed_at=null,u=>u.email_confirmed_at=new Date(Date.now()+60000).toISOString(),u=>u.id='not-a-uuid']){
    const f=await fixture(t);mutate(f.state.user);assert.equal((await nativeEmailConfirmation(request(),f.options)).status,403);assert.equal(f.state.calls.at(-1).path,'/logout?scope=local');
  }
  const f=await fixture(t);f.state.change=path=>path==='/user'?Response.json({...f.state.user,id:'22222222-2222-4222-8222-222222222222'}):null;
  assert.equal((await nativeEmailConfirmation(request(),f.options)).status,403);assert.equal(f.state.calls.at(-1).path,'/logout?scope=local');
});
test('malformed and oversized provider responses fail without reflecting their content',async t=>{
  for(const response of [()=>new Response('PRIVATE_NOT_JSON'),()=>new Response('x'.repeat(262145))]){
    const f=await fixture(t);f.state.change=path=>path==='/settings'?response():null;
    const result=await nativeEmailConfirmation(request(),f.options);assert.equal(result.status,503);assert.ok(!(await result.text()).includes('PRIVATE_NOT_JSON'));
  }
});
test('network failures do not leak request details, and local revocation failure does not undo confirmation',async t=>{
  const f=await fixture(t);f.state.change=path=>{if(path==='/verify')throw new Error('PRIVATE_NETWORK_DETAIL');return null;};
  const denied=await nativeEmailConfirmation(request(),f.options);assert.equal(denied.status,503);assert.ok(!(await denied.text()).includes('PRIVATE_NETWORK_DETAIL'));
  f.state.change=path=>{if(path==='/logout?scope=local')throw new Error('PRIVATE_NETWORK_DETAIL');return null;};
  assert.deepEqual(await (await nativeEmailConfirmation(request(),f.options)).json(),{ok:true,confirmed:true});
});
test('shared limits cap resends and verification attempts across handler calls',async t=>{
  const f=await fixture(t);for(let i=0;i<4;i++)assert.equal((await nativeEmailConfirmation(request({action:'send'}),f.options)).status,200);
  assert.equal((await nativeEmailConfirmation(request({action:'send'}),{...f.options})).status,429);assert.equal(f.state.calls.filter(x=>x.path==='/resend').length,4);
  f.state.change=path=>path==='/verify'?new Response('invalid',{status:403}):null;
  for(let i=0;i<8;i++)assert.equal((await nativeEmailConfirmation(request(),f.options)).status,400);
  assert.equal((await nativeEmailConfirmation(request(),{...f.options})).status,429);assert.equal(f.state.calls.filter(x=>x.path==='/verify').length,8);
});
