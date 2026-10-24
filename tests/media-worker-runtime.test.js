import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Exercise production fetch in the installed Workers runtime. Node mocks accept
// redirect:'error', which this runtime rejects before contacting the resolver.
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler'));
const {Miniflare}=wranglerRequire('miniflare'),{build}=wranglerRequire('esbuild');
const root=dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
const origin='https://native.example',userId='publisher',otherId='other-publisher';
const edit=property=>({id:property.id,revision:property.revision});

test('production DNS ownership verifies exact evidence in the pinned Workers runtime',async t=>{
  const bundle=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',stdin:{resolveDir:root,loader:'ts',contents:`
    import {mediaProperties} from './lib/media-properties.ts';
    export default {async fetch(request,env){
      const path=new URL(request.url).pathname;
      const user={userId:path==='/foreign'?${JSON.stringify(otherId)}:${JSON.stringify(userId)},email:'fixture@example.com'};
      try{
        const api=mediaProperties(env.DB,user),body=await request.json();
        return Response.json(await (path==='/add'?api.add(body):api.verifyDns(body)));
      }catch(error){return Response.json({ok:false},{status:error.status||500});}
    }};
  `}});
  const calls=[];let mode='exact',property,db,serial=0;
  const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'fixture-media-db'},cf:false,
    outboundService:async request=>{
      const url=new URL(request.url),name='_affimaro-verify.'+new URL(property.url).hostname;
      calls.push({origin:url.origin,path:url.pathname,name:url.searchParams.get('name'),type:url.searchParams.get('type')});
      assert.equal(request.method,'GET');assert.equal(url.origin,'https://cloudflare-dns.com');assert.equal(url.pathname,'/dns-query');
      assert.equal(url.searchParams.get('name'),name);assert.equal(url.searchParams.get('type'),'TXT');
      assert.equal(request.headers.get('accept'),'application/dns-json');assert.equal(request.headers.get('authorization'),null);
      const answer={name:name+'.',type:16,data:JSON.stringify(property.challenge.slice(0,24))+' '+JSON.stringify(property.challenge.slice(24))};
      if(mode==='redirect')return new Response(null,{status:307,headers:{Location:'https://foreign.example/collect'}});
      if(mode==='malformed')return new Response('{not json',{headers:{'Content-Type':'application/dns-json'}});
      if(mode==='oversized')return Response.json({Status:0,padding:'x'.repeat(65537),Answer:[answer]});
      if(mode==='rotate')await db.prepare("UPDATE media_properties SET challenge=?,revision=revision+1,status='unverified',verified_at=NULL WHERE id=?").bind('affimaro-verify='+'9'.repeat(48),property.id).run();
      if(mode==='archive')await db.prepare('UPDATE media_properties SET archived=1,revision=revision+1 WHERE id=?').bind(property.id).run();
      if(mode==='wrong-name')answer.name='_affimaro-verify.foreign.example.';
      if(mode==='wrong-type')answer.type=1;
      if(mode==='wrong-code')answer.data='"affimaro-verify=wrong"';
      return Response.json({Status:mode==='dns-error'?3:0,Answer:mode==='no-answer'?[]:[answer]});
    }});
  t.after(()=>mf.dispose());
  db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY,email TEXT NOT NULL);');
  for(const statement of (await readFile(new URL('../drizzle/0015_cool_vin_gonzales.sql',import.meta.url),'utf8')).split('--> statement-breakpoint')){
    if(statement.trim())await db.prepare(statement.trim()).run();
  }
  for(const id of [userId,otherId])await db.prepare('INSERT INTO accounts VALUES (?,?)').bind(id,id+'@example.com').run();
  const post=(path,body)=>mf.dispatchFetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const saved=()=>db.prepare('SELECT * FROM media_properties WHERE id=?').bind(property.id).first();
  const reviews=async()=>Number((await db.prepare('SELECT count(*) n FROM media_property_reviews WHERE property_id=?').bind(property.id).first()).n);
  async function create(nextMode='exact'){
    calls.length=0;mode=nextMode;
    const response=await post('/add',{kind:'Website',platform:'Website / blog',name:'Fixture publication',url:'https://publisher'+(++serial)+'.example',relationship:'Owner'});
    assert.equal(response.status,200);property=await response.json();assert.equal(property.status,'unverified');return property;
  }
  async function rejected(expectedStatus){
    assert.equal((await post('/verify',edit(property))).status,expectedStatus);
    const row=await saved();assert.equal(row.status,'unverified');assert.equal(row.verified_at,null);assert.equal(await reviews(),0);
  }
  await t.test('the exact current TXT reaches the resolver, verifies once and retains throttle/revision checks',async()=>{
    await create();const response=await post('/verify',edit(property));
    assert.equal(response.status,200,'the real Workers fetch must reach the fixed DNS resolver');
    const verified=await response.json();assert.equal(verified.status,'verified');assert.equal(verified.method,'dns_txt');assert.ok(verified.verified_at);
    assert.equal(verified.revision,property.revision+1);assert.equal(calls.length,1);assert.equal(await reviews(),1);
    assert.equal((await post('/verify',edit(property))).status,409);
    assert.equal((await post('/verify',edit(verified))).status,429);assert.equal(calls.length,1);assert.equal(await reviews(),1);
  });
  await t.test('a resolver redirect fails without contacting its target or recording verification',async()=>{
    await create('redirect');await rejected(503);assert.equal(calls.length,1);assert.equal(calls[0].origin,'https://cloudflare-dns.com');
  });
  await t.test('wrong names, record types, codes and unsuccessful DNS answers cannot prove ownership',async()=>{
    for(const nextMode of ['wrong-name','wrong-type','wrong-code','dns-error','no-answer']){
      await create(nextMode);await rejected(409);assert.equal(calls.length,1);
    }
  });
  await t.test('malformed and oversized DNS responses fail before writing verification',async()=>{
    for(const nextMode of ['malformed','oversized']){await create(nextMode);await rejected(503);assert.equal(calls.length,1);}
  });
  await t.test('a code rotated while the resolver responds cannot verify the old revision',async()=>{
    await create('rotate');await rejected(409);assert.equal(calls.length,1);
    const row=await saved();assert.notEqual(row.challenge,property.challenge);assert.equal(row.revision,property.revision+1);
  });
  await t.test('a property archived during DNS lookup cannot be restored or verified',async()=>{
    await create('archive');await rejected(409);assert.equal(calls.length,1);assert.equal((await saved()).archived,1);
  });
  await t.test('foreign, stale, expired and closed-account checks never contact DNS',async()=>{
    await create();assert.equal((await post('/foreign',edit(property))).status,404);
    assert.equal((await post('/verify',{...edit(property),revision:property.revision+1})).status,409);
    await db.prepare('UPDATE media_properties SET challenge_expires_at=? WHERE id=?').bind('2000-01-01T00:00:00.000Z',property.id).run();
    await rejected(409);
    await db.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').bind(userId,new Date().toISOString()).run();
    await rejected(403);assert.equal(calls.length,0);
  });
});
