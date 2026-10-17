import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Use the installed Wrangler toolchain: Node fetch accepts redirect modes that
// the pinned Workers runtime rejects, so injected Node mocks cannot catch this.
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler'));
const {Miniflare}=wranglerRequire('miniflare'),{build}=wranglerRequire('esbuild');
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const origin='https://native.example',email='owner@example.com';
const provider={supabaseUrl:'https://fixture-project.supabase.co',publishableKey:'sb_publishable_FIXTURE_KEY_123456789012'};
const access='FIXTURE_PROVIDER_ACCESS_TOKEN_NOT_FOR_BROWSER';

test('production Auth handlers send, verify and reject redirects in the pinned Workers runtime',async t=>{
  const bundle=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',stdin:{resolveDir:root,loader:'ts',contents:`
    import {nativeEmailConfirmation} from './self-hosted/native-email-confirmation.ts';
    import {emailAuth} from './self-hosted/auth-core.ts';
    const user={userId:'legacy-owner',email:${JSON.stringify(email)}};
    const provider=${JSON.stringify(provider)};
    export default {async fetch(request,env){
      if(new URL(request.url).pathname==='/independent'){
        try{
          await emailAuth(env.DB,{origin:${JSON.stringify(origin)},...provider,encryptionKey:'df'.repeat(32)}).recover({email:user.email},'192.0.2.10');
          return Response.json({ok:true});
        }catch(error){return Response.json({ok:false},{status:error.status||500});}
      }
      return nativeEmailConfirmation(request,{native:true,db:env.DB,user,provider});
    }};
  `}});
  const calls=[];let redirectPath=null;
  const user={id:'11111111-1111-4111-8111-111111111111',email,email_confirmed_at:new Date().toISOString()};
  const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'fixture-auth-db'},cf:false,
    outboundService:async request=>{
      const url=new URL(request.url),path=url.pathname.slice('/auth/v1'.length),body=request.method==='POST'?await request.json().catch(()=>null):null;
      calls.push({host:url.origin,path,method:request.method,body,authorization:request.headers.get('authorization')});
      assert.equal(url.origin,provider.supabaseUrl);assert.equal(request.headers.get('apikey'),provider.publishableKey);
      if(path===redirectPath)return new Response(null,{status:307,headers:{Location:'https://foreign.example/collect'}});
      if(path==='/settings')return Response.json({mailer_autoconfirm:false,external:{email:true}});
      if(path==='/resend'){assert.deepEqual(body,{type:'signup',email});return Response.json({});}
      if(path==='/verify'){assert.deepEqual(body,{type:'email',email,token:'12345678'});return Response.json({token_type:'bearer',access_token:access,user});}
      if(path==='/user'){assert.equal(request.headers.get('authorization'),'Bearer '+access);return Response.json(user);}
      if(path==='/logout'){assert.equal(url.search,'?scope=local');return new Response(null,{status:204});}
      if(path==='/recover'){assert.deepEqual(body,{email});return Response.json({});}
      assert.fail('Unexpected provider request');
    }});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL); CREATE TABLE auth_rate_limits (id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);');
  await db.prepare('INSERT INTO accounts VALUES (?,?)').bind('legacy-owner',email).run();
  async function post(path,body){return mf.dispatchFetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
  await t.test('resend reaches the provider once',async()=>{
    assert.deepEqual(await (await post('/native',{action:'send'})).json(),{ok:true,sent:true});
    assert.deepEqual(calls.map(x=>x.path),['/settings','/resend']);
  });
  await t.test('code verification checks identity and locally revokes the temporary session',async()=>{
    calls.length=0;const response=await post('/native',{action:'verify',code:'12345678'});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,confirmed:true});assert.equal(response.headers.get('set-cookie'),null);
    assert.deepEqual(calls.map(x=>x.path),['/settings','/verify','/user','/logout']);
  });
  await t.test('native redirects never forward API keys or codes, and are not retried',async()=>{
    calls.length=0;redirectPath='/verify';
    assert.equal((await post('/native',{action:'verify',code:'12345678'})).status,503);
    assert.deepEqual(calls.map(x=>x.path),['/settings','/verify']);assert.ok(calls.every(x=>x.host===provider.supabaseUrl));
  });
  await t.test('independent Auth also runs without forwarding credentials on a redirect',async()=>{
    calls.length=0;redirectPath=null;assert.deepEqual(await (await post('/independent',{})).json(),{ok:true});
    assert.deepEqual(calls.map(x=>x.path),['/recover']);
    calls.length=0;redirectPath='/recover';assert.equal((await post('/independent',{})).status,503);
    assert.deepEqual(calls.map(x=>x.path),['/recover']);assert.ok(calls.every(x=>x.host===provider.supabaseUrl));
  });
});
