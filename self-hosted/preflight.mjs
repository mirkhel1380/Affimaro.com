import {supabaseSettings} from './provider-settings.mjs';
import {cloudflareSettings} from './cloudflare-settings.mjs';
import {independentWorkerName} from './routing.mjs';
export function deploymentSettings(values){
  const required=['CLOUDFLARE_API_TOKEN','AUTH_SESSION_ENCRYPTION_KEY'];
  const absent=required.filter(key=>!values[key]);
  if(absent.length)throw new Error('Missing deployment settings: '+absent.join(', ')+'.');
  const hosting=cloudflareSettings(values),provider=supabaseSettings(values);
  if(!/^[a-f0-9]{64}$/.test(values.AUTH_SESSION_ENCRYPTION_KEY))throw new Error('AUTH_SESSION_ENCRYPTION_KEY must be a 64-character lowercase hexadecimal key. Paste the generated key into its Secret value.');
  if(values.PAYMENT_DATA_KEY_V1&&!/^[a-f0-9]{64}$/.test(values.PAYMENT_DATA_KEY_V1))throw new Error('PAYMENT_DATA_KEY_V1 must retain the original payment key. Restore its original value; do not generate a replacement.');
  if(values.PAYMENT_DATA_KEY_V1===values.AUTH_SESSION_ENCRYPTION_KEY)throw new Error('AUTH_SESSION_ENCRYPTION_KEY must be separate from PAYMENT_DATA_KEY_V1. Preserve the original payment key.');
  return {...hosting,...provider};
}
async function boundedSettings(response,message){
  if(!response.ok){await response.body?.cancel();throw new Error(message);}
  const reader=response.body?.getReader();if(!reader)throw new Error(message);
  const chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new Error(message);}chunks.push(Buffer.from(part.value));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error(message);}
}
export async function verifiedEmailSettings(settings,publicKey,fetcher=fetch){
  const value=await boundedSettings(await fetcher(settings.supabaseUrl+'/auth/v1/settings',{headers:{apikey:publicKey},redirect:'error',signal:AbortSignal.timeout(10000)}),'Supabase settings could not be verified.');
  if(value.mailer_autoconfirm!==false||value.external?.email!==true)throw new Error('Enable Supabase email sign-in and email confirmation before deploying.');
}
export async function verifiedWorkersOrigin(settings,apiToken,fetcher=fetch){
  if(!settings.workersSubdomain)return;
  const value=await boundedSettings(await fetcher('https://api.cloudflare.com/client/v4/accounts/'+settings.accountId+'/workers/subdomain',{headers:{Authorization:'Bearer '+apiToken},redirect:'error',signal:AbortSignal.timeout(10000)}),'Cloudflare workers.dev ownership could not be verified.');
  if(value.success!==true||value.result?.subdomain!==settings.workersSubdomain)throw new Error('APP_ORIGIN does not match the selected Cloudflare account workers.dev subdomain.');
}
export async function verifiedD1Database(settings,apiToken,fetcher=fetch){
  let response;
  try{response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+settings.accountId+'/d1/database/'+settings.databaseId+'?fields=uuid',{method:'GET',headers:{Authorization:'Bearer '+apiToken},redirect:'error',signal:AbortSignal.timeout(10000)});}
  catch{throw new Error('Cloudflare D1 could not be reached. Check the deployment token and connection.');}
  const failure=response.ok?'Cloudflare returned an invalid D1 response. Check the selected database.':`Cloudflare D1 check failed (HTTP ${response.status}). Check the deployment token permissions and selected account/database IDs.`;
  let value;try{value=await boundedSettings(response,failure);}catch{throw new Error(failure);}
  if(value?.success!==true||value.result?.uuid!==settings.databaseId)throw new Error('The selected D1 database could not be confirmed in this Cloudflare account.');
}
export function verifyCloudflareTarget(config,settings){
  if(config.name!==independentWorkerName||config.vars?.APP_ORIGIN!==settings.origin||config.account_id!==settings.accountId||config.d1_databases?.length!==1||config.d1_databases[0].binding!=='DB'||config.d1_databases[0].database_id!==settings.databaseId||config.workers_dev!==settings.routing.workers_dev||config.preview_urls!==false||JSON.stringify(config.routes??[])!==JSON.stringify(settings.routing.routes))throw new Error('Rebuild the independent package with these exact deployment settings.');
}
export function verifyBuiltDeployment(config,settings){
  verifyCloudflareTarget(config,settings);
  if(config.vars?.SUPABASE_URL!==settings.supabaseUrl||config.vars?.SUPABASE_PUBLISHABLE_KEY!==settings.publishableKey)throw new Error('Rebuild the independent package with these exact deployment settings.');
}
export function deploymentAuthorization(values){
  if(values.WORKERS_CI==='1'&&values.WORKERS_CI_BRANCH!=='main')throw new Error('Independent deployment from Workers Builds is restricted to the main branch. Use a dry run for previews.');
  if(values.AFFIMARO_DATA_MIGRATION_CONFIRMED!=='true')throw new Error('Complete the documented database/key migration and identity mapping before deployment.');
  if(values.AFFIMARO_AUTH_CONFIGURATION_CONFIRMED!=='true')throw new Error('Confirm Supabase email verification, OTP templates and email delivery before deployment.');
}
