import {supabaseSettings} from './provider-settings.mjs';
export function deploymentSettings(values){
  const required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_D1_DATABASE_ID','APP_ORIGIN','AUTH_SESSION_ENCRYPTION_KEY'];
  const absent=required.filter(key=>!values[key]);
  if(absent.length)throw new Error('Missing deployment settings: '+absent.join(', ')+'.');
  const origin=new URL(values.APP_ORIGIN),provider=supabaseSettings(values);
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.port||origin.username||origin.password||origin.search||origin.hash||origin.hostname.endsWith('.chatgpt.site')||origin.hostname.endsWith('.invalid'))throw new Error('APP_ORIGIN must be your independent HTTPS domain.');
  if(!/^[a-f0-9]{32}$/i.test(values.CLOUDFLARE_ACCOUNT_ID)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.CLOUDFLARE_D1_DATABASE_ID)||/^00000000-/.test(values.CLOUDFLARE_D1_DATABASE_ID))throw new Error('Use the real Cloudflare account and D1 database IDs.');
  if(!/^[a-f0-9]{64}$/.test(values.AUTH_SESSION_ENCRYPTION_KEY)||(values.PAYMENT_DATA_KEY_V1&&(!/^[a-f0-9]{64}$/.test(values.PAYMENT_DATA_KEY_V1)||values.AUTH_SESSION_ENCRYPTION_KEY===values.PAYMENT_DATA_KEY_V1)))throw new Error('Use separate 32-byte authentication and payment keys; preserve the existing payment key.');
  return {origin:origin.origin,...provider,databaseId:values.CLOUDFLARE_D1_DATABASE_ID};
}
export async function verifiedEmailSettings(settings,publicKey,fetcher=fetch){
  const response=await fetcher(settings.supabaseUrl+'/auth/v1/settings',{headers:{apikey:publicKey},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok){await response.body?.cancel();throw new Error('Supabase settings could not be verified.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Supabase settings could not be verified.');
  const chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new Error('Supabase settings could not be verified.');}chunks.push(Buffer.from(part.value));}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(value.mailer_autoconfirm!==false||value.external?.email!==true)throw new Error('Enable Supabase email sign-in and email confirmation before deploying.');
}
