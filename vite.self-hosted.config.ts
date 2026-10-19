import vinext from 'vinext';
import {defineConfig} from 'vite';
import {supabaseSettings} from './self-hosted/provider-settings.mjs';
import {cloudflareSettings} from './self-hosted/cloudflare-settings.mjs';
import {independentWorkerName} from './self-hosted/routing.mjs';

export default defineConfig(async()=>{
  process.env.CLOUDFLARE_CF_FETCH_ENABLED??='false';
  process.env.WRANGLER_SEND_METRICS??='false';
  process.env.WRANGLER_WRITE_LOGS??='false';
  process.env.WRANGLER_LOG_PATH??='.wrangler/logs';
  process.env.WRANGLER_REGISTRY_PATH??='.wrangler/dev-registry';
  process.env.MINIFLARE_REGISTRY_PATH??='.wrangler/registry';
  const {cloudflare}=await import('@cloudflare/vite-plugin');
  const provider=supabaseSettings(process.env);
  const hosting=cloudflareSettings(process.env);
  return {
    define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},
    build:{outDir:'dist-self-hosted'},
    plugins:[vinext(),cloudflare({
      viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,
      config:{
        name:independentWorkerName,main:'./self-hosted/worker.ts',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],
        ...hosting.routing,account_id:hosting.accountId,
        d1_databases:[{binding:'DB',database_name:'affimaro',database_id:hosting.databaseId,migrations_dir:'./drizzle'}],
        vars:{APP_ORIGIN:hosting.origin,...(hosting.ownerOrigin?{OWNER_ORIGIN:hosting.ownerOrigin}:{}),SUPABASE_URL:provider.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:provider.publishableKey},
      },
    })],
  };
});
