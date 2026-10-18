import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {deploymentSettings,verifiedEmailSettings,verifiedWorkersOrigin,verifiedD1Database,verifiedAdmissionBootstrap,verifyBuiltDeployment,deploymentAuthorization} from '../self-hosted/preflight.mjs';
try{
  const settings=deploymentSettings(process.env),mode=process.argv[2]||'--check';
  if(!['--check','--dry-run','--deploy'].includes(mode))throw new Error('Choose --check, --dry-run or --deploy.');
  await verifiedEmailSettings(settings,settings.publishableKey);
  await verifiedWorkersOrigin(settings,process.env.CLOUDFLARE_API_TOKEN);
  await verifiedD1Database(settings,process.env.CLOUDFLARE_API_TOKEN);
  if(mode==='--check'){console.log('Independent deployment settings passed validation. No changes made.');console.log('Email policy, account subdomain and selected D1 database checked. No site published or data migrated.');process.exit(0);}
  const path='dist-self-hosted/server/wrangler.json',config=JSON.parse(await readFile(path,'utf8'));
  verifyBuiltDeployment(config,settings);
  const run=(args,input)=>{const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--config',path],{stdio:input?['pipe','inherit','inherit']:'inherit',input,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});if(result.status!==0)throw new Error('Cloudflare command did not complete. Review its result before retrying.');};
  if(mode==='--dry-run'){run(['deploy','--dry-run']);process.exit(0);}
  deploymentAuthorization(process.env);
  run(['d1','migrations','apply','DB','--remote']);
  run(['d1','execute','DB','--remote','--file',fileURLToPath(new URL('../self-hosted/admission-bootstrap.sql',import.meta.url))]);
  await verifiedAdmissionBootstrap(settings,process.env.CLOUDFLARE_API_TOKEN);
  console.log('Existing owner review access confirmed. Original workspace and verified identity mapping preserved.');
  // The original payment key is provisioned only by the encrypted migration.
  // Ordinary deployments must never replace it from a CI environment value.
  const secrets={AUTH_SESSION_ENCRYPTION_KEY:process.env.AUTH_SESSION_ENCRYPTION_KEY};
  for(const key of ['AFFIMARO_BILLING_STRIPE_KEY','AFFIMARO_BILLING_ACCOUNT_ID','AFFIMARO_STARTER_PRICE_ID','AFFIMARO_BILLING_MODE','AFFIMARO_BILLING_LIVE_ENABLED','AFFIMARO_BILLING_REQUIRED'])if(process.env[key])secrets[key]=process.env[key];
  // Secret values travel only over stdin, never command-line arguments or files.
  run(['secret','bulk'],JSON.stringify(secrets));
  run(['deploy']);
  console.log('Independent deployment submitted. Verify email, recovery, tenant isolation and store delivery before switching traffic.');
}catch(error){console.error(error instanceof Error?error.message:'Deployment could not be prepared.');process.exit(1);}
