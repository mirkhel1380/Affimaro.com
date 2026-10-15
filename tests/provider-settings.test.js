import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseSettings} from '../self-hosted/provider-settings.mjs';
import {deploymentSettings} from '../self-hosted/preflight.mjs';

const override={SUPABASE_URL:'https://fixture-project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FIXTURE_KEY_123456789012'};
test('the independent target uses the selected live project with an active publishable-key format',()=>{
  const selected=supabaseSettings();assert.equal(selected.supabaseUrl,'https://bhxzkrypfxdheyjtxwqp.supabase.co');assert.match(selected.publishableKey,/^sb_publishable_/);
  assert.deepEqual(supabaseSettings({SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:''}),selected);
  const config=deploymentSettings({CLOUDFLARE_API_TOKEN:'FIXTURE_TOKEN',CLOUDFLARE_ACCOUNT_ID:'ac'.repeat(16),CLOUDFLARE_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',APP_ORIGIN:'https://affimaro.example',AUTH_SESSION_ENCRYPTION_KEY:'cd'.repeat(32)});
  assert.equal(config.supabaseUrl,selected.supabaseUrl);assert.equal(config.publishableKey,selected.publishableKey);
});
test('project overrides require a complete URL/key pair rather than mixing two tenants',()=>{
  assert.deepEqual(supabaseSettings(override),{supabaseUrl:override.SUPABASE_URL,publishableKey:override.SUPABASE_PUBLISHABLE_KEY});
  for(const value of [{SUPABASE_URL:override.SUPABASE_URL},{SUPABASE_PUBLISHABLE_KEY:override.SUPABASE_PUBLISHABLE_KEY},{SUPABASE_URL:123}])assert.throws(()=>supabaseSettings(value));
});
test('independent provider settings reject other hosts, redirect URLs and privileged keys',()=>{
  for(const value of [{SUPABASE_URL:'https://evil.example'},{SUPABASE_URL:override.SUPABASE_URL+'/path'},{SUPABASE_URL:override.SUPABASE_URL+'?redirect=1'},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_PRIVATE'},{SUPABASE_PUBLISHABLE_KEY:'eyJ.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.fake'}])assert.throws(()=>supabaseSettings({...override,...value}));
  const legacy='eyJ.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.fake';assert.equal(supabaseSettings({...override,SUPABASE_PUBLISHABLE_KEY:legacy}).publishableKey,legacy);
});
