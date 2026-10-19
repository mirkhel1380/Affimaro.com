import {AppError} from '../lib/service.ts';
import {emailAuth,validateAuthConfig,type AuthConfig,type AuthUser} from './auth-core.ts';
import {authPage,isAuthPath} from './auth-pages.ts';
import {migrationMaintenance} from './migration.ts';
import {admissionGate} from '../lib/admission-gate.ts';
import {legacyRouting,legacyHostRoute} from './legacy-routing.mjs';
import {ownerRouting,ownerHostRoute,ownerAsset} from './owner-routing.mjs';
import {requirePlatformAdmin} from '../lib/admissions.ts';

type Bindings=Record<string,unknown>&{DB:D1Database};
export function independentConfig(env:Bindings):AuthConfig{
  const value=(key:string)=>typeof env[key]==='string'?env[key] as string:'';
  return validateAuthConfig({origin:value('APP_ORIGIN'),supabaseUrl:value('SUPABASE_URL'),publishableKey:value('SUPABASE_PUBLISHABLE_KEY'),encryptionKey:value('AUTH_SESSION_ENCRYPTION_KEY')});
}
export function verifiedRequest(request:Request,user:AuthUser|null){
  const headers=new Headers(request.headers);
  for(const key of [...headers.keys()])if(key.toLowerCase().startsWith('oai-authenticated-user-'))headers.delete(key);
  if(user){headers.set('oai-authenticated-user-id',user.userId);headers.set('oai-authenticated-user-email',user.email);if(user.fullName){headers.set('oai-authenticated-user-full-name',encodeURIComponent(user.fullName));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');}}
  return new Request(request,{headers});
}
export async function independentFetch(request:Request,env:Bindings,application:(request:Request)=>Promise<Response>,fetcher:typeof fetch=fetch){
  try{
    const publicConfig=independentConfig(env),url=new URL(request.url),owner=ownerRouting(publicConfig.origin,typeof env.OWNER_ORIGIN==='string'?env.OWNER_ORIGIN:undefined),ownerHost=!!owner.origin&&url.origin===owner.origin;
    const legacy=legacyRouting(publicConfig.origin,typeof env.LEGACY_ORIGIN==='string'?env.LEGACY_ORIGIN:undefined),legacyHost=!!legacy.origin&&url.origin===legacy.origin;
    if(url.origin!==publicConfig.origin&&!ownerHost&&!legacyHost)throw new AppError(403,'Use the configured Affimaro application domain.');
    const moved=legacyHostRoute(request,publicConfig.origin,owner.origin,legacy.origin);if(moved)return moved;
    const destination=ownerHostRoute(request,publicConfig.origin,owner.origin);if(destination)return destination;
    const config=ownerHost?{...publicConfig,origin:owner.origin!}:publicConfig;
    const paused=migrationMaintenance(request,env);if(paused)return paused;
    const auth=emailAuth(env.DB,config,fetcher);
    if(isAuthPath(url.pathname)){const response=await authPage(request,auth,config.origin);if(ownerHost)response.headers.set('X-Robots-Tag','noindex, nofollow');return response;}
    // Public assets and HMAC-signed store events do not need a browser identity.
    const signedStoreEvent=request.method==='POST'&&['/api/woocommerce/event','/api/custom/event'].includes(url.pathname);
    const signedBillingEvent=request.method==='POST'&&url.pathname==='/api/billing/webhook';
    const accountRoute=/^\/(account|start|get-started|workspace|partner|creator|agency|payments|reports|billing|join|migration|application|admin|owner)(\/|$)/.test(url.pathname)||url.pathname.startsWith('/api/')&&!signedStoreEvent&&!signedBillingEvent;
    const user=accountRoute?await auth.resolve(request):null;
    if(ownerHost&&!ownerAsset(url.pathname)){
      if(!user){if(url.pathname.startsWith('/api/'))throw new AppError(401,'Sign in to the owner portal.');return new Response(null,{status:307,headers:{Location:'/auth/owner/login?return_to='+encodeURIComponent(url.pathname+url.search),'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});}
      await requirePlatformAdmin(env.DB,user);
    }
    if(user){const blocked=await admissionGate(request,env.DB,user);if(blocked)return blocked;}
    const response=await application(verifiedRequest(request,user)),headers=new Headers(response.headers);
    if(accountRoute){headers.set('Cache-Control','private, no-store');headers.append('Vary','Cookie');}
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Strict-Transport-Security','max-age=31536000');
    if(ownerHost)headers.set('X-Robots-Tag','noindex, nofollow');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'The application is temporarily unavailable.'},{status:error instanceof AppError?error.status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
}
