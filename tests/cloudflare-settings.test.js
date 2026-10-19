import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cloudflareSettings} from '../self-hosted/cloudflare-settings.mjs';
import {deploymentSettings,verifyCloudflareTarget} from '../self-hosted/preflight.mjs';
import {independentWorkerName} from '../self-hosted/routing.mjs';

test('the independent target selects the owner-supplied Cloudflare account and new D1 without deployment secrets',()=>{
  const selected=cloudflareSettings();
  assert.equal(independentWorkerName,'affimaro-com');
  assert.equal(selected.accountId,'72d03e04f40638313952d19c5739c34d');
  assert.equal(selected.databaseId,'9b4539f6-dd2a-4ce7-85c5-4733f799ed11');
  assert.equal(selected.origin,'https://affimaro.com');assert.equal(selected.ownerOrigin,'https://admin.affimaro.com');assert.equal(selected.legacyOrigin,'https://affimaro-com.m-mirkhel20.workers.dev');assert.equal(selected.routing.workers_dev,true);
  assert.equal(cloudflareSettings({APP_ORIGIN:selected.legacyOrigin}).origin,selected.origin);
  assert.equal(selected.workersSubdomain,'m-mirkhel20');
  assert.throws(()=>deploymentSettings({}),/Missing deployment settings/);
  const ready=deploymentSettings({CLOUDFLARE_API_TOKEN:'FIXTURE_TOKEN',AUTH_SESSION_ENCRYPTION_KEY:'cd'.repeat(32)});
  assert.equal(ready.databaseId,selected.databaseId);assert.equal(ready.origin,selected.origin);
});
test('Cloudflare overrides cannot mix a new account with the selected database or origin',()=>{
  const other={CLOUDFLARE_ACCOUNT_ID:'ac'.repeat(16),CLOUDFLARE_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',APP_ORIGIN:'https://'+independentWorkerName+'.fixture-owner.workers.dev'};
  assert.equal(cloudflareSettings(other).workersSubdomain,'fixture-owner');
  for(const value of [{CLOUDFLARE_ACCOUNT_ID:other.CLOUDFLARE_ACCOUNT_ID},{...other,CLOUDFLARE_D1_DATABASE_ID:undefined},{...other,APP_ORIGIN:undefined},{CLOUDFLARE_ACCOUNT_ID:'wrong'},{CLOUDFLARE_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000000'},{CLOUDFLARE_D1_DATABASE_ID:7},{APP_ORIGIN:''},{APP_ORIGIN:'https://affimaro.m-mirkhel20.workers.dev'}])assert.throws(()=>cloudflareSettings(value));
  const custom=cloudflareSettings({APP_ORIGIN:'https://affimaro.example'});assert.equal(custom.databaseId,cloudflareSettings().databaseId);assert.equal(custom.routing.workers_dev,false);
});
test('migration target checks reject a stale Worker or database even when the account and origin match',()=>{
  const selected=cloudflareSettings(),config={name:independentWorkerName,account_id:selected.accountId,vars:{APP_ORIGIN:selected.origin,OWNER_ORIGIN:selected.ownerOrigin,LEGACY_ORIGIN:selected.legacyOrigin},d1_databases:[{binding:'DB',database_id:selected.databaseId}],...selected.routing};
  verifyCloudflareTarget(config,selected);
  for(const mutate of [c=>c.name='affimaro',c=>c.d1_databases[0].database_id='11111111-1111-4111-8111-111111111111',c=>c.d1_databases.push({binding:'OTHER',database_id:selected.databaseId}),c=>c.d1_databases[0].binding='OTHER']){const wrong=structuredClone(config);mutate(wrong);assert.throws(()=>verifyCloudflareTarget(wrong,selected));}
});
test('the Cloudflare default build command stops before compiling the private native Worker',()=>{
  const result=spawnSync(process.execPath,['scripts/run-framework.mjs','build'],{cwd:new URL('..',import.meta.url),env:{...process.env,WORKERS_CI:'1'},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/npm run build:cloudflare/);assert.match(result.stderr,/npm run deploy:self-hosted/);assert.equal(result.stdout,'');
});
