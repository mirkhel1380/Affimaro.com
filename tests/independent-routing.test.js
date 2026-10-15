import test from 'node:test';
import assert from 'node:assert/strict';
import {independentRouting,independentWorkerName} from '../self-hosted/routing.mjs';
import {deploymentSettings,verifiedWorkersOrigin,verifyBuiltDeployment,deploymentAuthorization} from '../self-hosted/preflight.mjs';

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
test('deployment refuses a package built for another account, database, origin or routing mode',()=>{
  const config={name:independentWorkerName,account_id:settings.accountId,vars:{APP_ORIGIN:settings.origin,SUPABASE_URL:settings.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:settings.publishableKey},d1_databases:[{binding:'DB',database_id:settings.databaseId}],...settings.routing};
  verifyBuiltDeployment(config,settings);
  for(const mutate of [c=>c.name='native-site',c=>c.account_id='bc'.repeat(16),c=>c.vars.APP_ORIGIN='https://another.example',c=>c.d1_databases[0].database_id='22222222-2222-4222-8222-222222222222',c=>c.workers_dev=false,c=>c.preview_urls=true,c=>c.routes=[{pattern:'another.example',custom_domain:true}]]){const wrong=structuredClone(config);mutate(wrong);assert.throws(()=>verifyBuiltDeployment(wrong,settings));}
});
test('Git-connected deployment requires main and both existing migration and email confirmations',()=>{
  const ready={WORKERS_CI:'1',WORKERS_CI_BRANCH:'main',AFFIMARO_DATA_MIGRATION_CONFIRMED:'true',AFFIMARO_AUTH_CONFIGURATION_CONFIRMED:'true'};deploymentAuthorization(ready);
  for(const change of [{WORKERS_CI_BRANCH:'feature'},{WORKERS_CI_BRANCH:undefined},{AFFIMARO_DATA_MIGRATION_CONFIRMED:'false'},{AFFIMARO_AUTH_CONFIGURATION_CONFIRMED:'false'}])assert.throws(()=>deploymentAuthorization({...ready,...change}));
});
