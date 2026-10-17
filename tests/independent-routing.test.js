import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {independentRouting,independentWorkerName} from '../self-hosted/routing.mjs';
import {deploymentSettings,verifiedWorkersOrigin,verifiedD1Database,verifyBuiltDeployment,deploymentAuthorization} from '../self-hosted/preflight.mjs';

const env={CLOUDFLARE_API_TOKEN:'FIXTURE_DEPLOY_TOKEN',CLOUDFLARE_ACCOUNT_ID:'ac'.repeat(16),CLOUDFLARE_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',APP_ORIGIN:'https://'+independentWorkerName+'.fixture-owner.workers.dev',AUTH_SESSION_ENCRYPTION_KEY:'cd'.repeat(32)};
const settings=deploymentSettings(env);

test('workers.dev uses only the selected Worker hostname and keeps version previews disabled',()=>{
  const route=independentRouting(env.APP_ORIGIN+'/');assert.equal(route.origin,env.APP_ORIGIN);assert.equal(route.workersSubdomain,'fixture-owner');assert.deepEqual(route.config,{workers_dev:true,preview_urls:false,routes:[]});
  for(const origin of ['https://workers.dev','https://fixture-owner.workers.dev','https://other.fixture-owner.workers.dev',`https://preview.${independentWorkerName}.fixture-owner.workers.dev`,`https://${independentWorkerName}.-bad.workers.dev`,`https://${independentWorkerName}.owner.workers.dev/path`,`https://${independentWorkerName}.owner.workers.dev?x=1`,`https://${independentWorkerName}.owner.workers.dev.`,'https://affimaro-preview.kindsky66.chatgpt.site'])assert.throws(()=>independentRouting(origin));
});
test('a custom domain has one exact route and no workers.dev alias; an unconfigured build has no public route',()=>{
  const route=independentRouting('https://affimaro.example');assert.equal(route.workersSubdomain,null);assert.deepEqual(route.config,{workers_dev:false,preview_urls:false,routes:[{pattern:'affimaro.example',custom_domain:true}]});
  assert.deepEqual(independentRouting().config,{workers_dev:false,preview_urls:false,routes:[]});assert.throws(()=>deploymentSettings({...env,APP_ORIGIN:''}));
});
test('workers.dev preflight verifies the account subdomain with a bounded read-only request',async()=>{
  let calls=0;const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/workers/subdomain');assert.equal(init.headers.Authorization,'Bearer '+env.CLOUDFLARE_API_TOKEN);assert.equal(init.method,undefined);assert.equal(init.body,undefined);assert.equal(init.redirect,'error');return Response.json({success:true,result:{subdomain:'fixture-owner'}});};
  await verifiedWorkersOrigin(settings,env.CLOUDFLARE_API_TOKEN,fetcher);assert.equal(calls,1);
  await verifiedWorkersOrigin(deploymentSettings({...env,APP_ORIGIN:'https://affimaro.example'}),env.CLOUDFLARE_API_TOKEN,fetcher);assert.equal(calls,1);
  for(const response of [Response.json({success:true,result:{subdomain:'another-owner'}}),Response.json({success:false}),new Response('denied',{status:403}),new Response('x'.repeat(65537)),new Response('not JSON')])await assert.rejects(verifiedWorkersOrigin(settings,env.CLOUDFLARE_API_TOKEN,async()=>response));
});
test('D1 preflight confirms the exact database under the selected account using only metadata GET',async()=>{
  let calls=0;
  await verifiedD1Database(settings,env.CLOUDFLARE_API_TOKEN,async(url,init)=>{
    calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+settings.accountId+'/d1/database/'+settings.databaseId+'?fields=uuid');
    assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(init.redirect,'error');assert.ok(init.signal instanceof AbortSignal);assert.equal(init.headers.Authorization,'Bearer '+env.CLOUDFLARE_API_TOKEN);
    return Response.json({success:true,result:{uuid:settings.databaseId}});
  });
  assert.equal(calls,1);
});
test('D1 preflight rejects denied access, redirects and untrusted or oversized metadata without leaking details',async()=>{
  const detail='FIXTURE_PRIVATE_PROVIDER_DETAIL';
  for(const reply of [()=>new Response(detail,{status:403}),()=>new Response(null,{status:302,headers:{Location:'https://foreign.example/'+detail}}),()=>new Response('x'.repeat(65537)),()=>new Response(detail),()=>Response.json(null),()=>Response.json({success:false,result:{uuid:settings.databaseId}}),()=>Response.json({success:true,result:{uuid:'22222222-2222-4222-8222-222222222222'}}),()=>{throw new Error(detail); }]){
    let calls=0;await assert.rejects(verifiedD1Database(settings,env.CLOUDFLARE_API_TOKEN,async()=>{calls++;return reply();}),e=>!e.message.includes(detail));assert.equal(calls,1);
  }
});
test('invalid key diagnostics name the setting without reflecting its value or changing payment-key rules',()=>{
  for(const value of ['FIXTURE_PRIVATE_POWERSHELL_COMMAND','x'.repeat(64),'ab'.repeat(31),'ab'.repeat(32)+'\n'])assert.throws(()=>deploymentSettings({...env,AUTH_SESSION_ENCRYPTION_KEY:value}),e=>e.message.includes('AUTH_SESSION_ENCRYPTION_KEY')&&!e.message.includes(value));
  assert.throws(()=>deploymentSettings({...env,PAYMENT_DATA_KEY_V1:'FIXTURE_INVALID_PAYMENT_KEY'}),e=>e.message.includes('PAYMENT_DATA_KEY_V1')&&!e.message.includes('FIXTURE_INVALID_PAYMENT_KEY'));
  assert.throws(()=>deploymentSettings({...env,PAYMENT_DATA_KEY_V1:env.AUTH_SESSION_ENCRYPTION_KEY}),e=>e.message.includes('separate'));
});
test('the connection-check command works before migration and cannot invoke deployment or database writes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'affimaro-check-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const preload=join(directory,'provider-fixture.mjs');
  await writeFile(preload,`
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import {syncBuiltinESMExports} from 'node:module';
    childProcess.spawnSync=()=>{throw new Error('Connection checks must never invoke Wrangler');};syncBuiltinESMExports();
    let calls=0;
    globalThis.fetch=async(url,init)=>{
      calls++;assert.ok(!init.method||init.method==='GET');assert.equal(init.body,undefined);assert.equal(init.redirect,'error');
      if(calls===1){assert.equal(url,process.env.SUPABASE_URL+'/auth/v1/settings');assert.equal(init.headers.apikey,process.env.SUPABASE_PUBLISHABLE_KEY);return Response.json({mailer_autoconfirm:false,external:{email:true}});}
      assert.equal(init.headers.Authorization,'Bearer '+process.env.CLOUDFLARE_API_TOKEN);
      if(calls===2){assert.ok(url.endsWith('/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/subdomain'));return Response.json({success:true,result:{subdomain:'fixture-owner'}});}
      assert.equal(calls,3);assert.ok(url.endsWith('/d1/database/'+process.env.CLOUDFLARE_D1_DATABASE_ID+'?fields=uuid'));return Response.json({success:true,result:{uuid:process.env.CLOUDFLARE_D1_DATABASE_ID}});
    };
    process.on('exit',()=>assert.equal(calls,3));
  `);
  const result=spawnSync(process.execPath,['--import',preload,'scripts/deploy-self-hosted.mjs','--check'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{...process.env,...env,SUPABASE_URL:'https://fixture-project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FIXTURE_KEY_123456789012',AFFIMARO_DATA_MIGRATION_CONFIRMED:'false',AFFIMARO_AUTH_CONFIGURATION_CONFIRMED:'false'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/No site published or data migrated/);assert.ok(!result.stdout.includes(env.CLOUDFLARE_API_TOKEN));
});
test('deployment refuses a package built for another account, database, origin or routing mode',()=>{
  const config={name:independentWorkerName,account_id:settings.accountId,vars:{APP_ORIGIN:settings.origin,SUPABASE_URL:settings.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:settings.publishableKey},d1_databases:[{binding:'DB',database_id:settings.databaseId}],...settings.routing};
  verifyBuiltDeployment(config,settings);
  for(const mutate of [c=>c.name='native-site',c=>c.account_id='bc'.repeat(16),c=>c.vars.APP_ORIGIN='https://another.example',c=>c.d1_databases[0].database_id='22222222-2222-4222-8222-222222222222',c=>c.workers_dev=false,c=>c.preview_urls=true,c=>c.routes=[{pattern:'another.example',custom_domain:true}]]){const wrong=structuredClone(config);mutate(wrong);assert.throws(()=>verifyBuiltDeployment(wrong,settings));}
});
test('Git-connected deployment requires main and both existing migration and email confirmations',()=>{
  const ready={WORKERS_CI:'1',WORKERS_CI_BRANCH:'main',AFFIMARO_DATA_MIGRATION_CONFIRMED:'true',AFFIMARO_AUTH_CONFIGURATION_CONFIRMED:'true'};deploymentAuthorization(ready);
  for(const change of [{WORKERS_CI_BRANCH:'feature'},{WORKERS_CI_BRANCH:undefined},{AFFIMARO_DATA_MIGRATION_CONFIRMED:'false'},{AFFIMARO_AUTH_CONFIGURATION_CONFIRMED:'false'}])assert.throws(()=>deploymentAuthorization({...ready,...change}));
});
