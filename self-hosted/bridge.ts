import {AppError} from '../lib/service.ts';
import {emailAuth,validateAuthConfig,type AuthConfig,type AuthUser} from './auth-core.ts';
import {authPage,isAuthPath} from './auth-pages.ts';
import {migrationMaintenance} from './migration.ts';
import {admissionGate} from '../lib/admission-gate.ts';

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
    const config=independentConfig(env),url=new URL(request.url);
    if(url.origin!==config.origin)throw new AppError(403,'Use the configured Affimaro application domain.');
    const paused=migrationMaintenance(request,env);if(paused)return paused;
    const auth=emailAuth(env.DB,config,fetcher);
    if(isAuthPath(url.pathname))return authPage(request,auth,config.origin);
    // Public assets and HMAC-signed store events do not need a browser identity.
    const signedStoreEvent=request.method==='POST'&&['/api/woocommerce/event','/api/custom/event'].includes(url.pathname);
    const accountRoute=/^\/(account|start|workspace|partner|creator|agency|payments|reports|billing|join|migration|application|admin)(\/|$)/.test(url.pathname)||url.pathname.startsWith('/api/')&&!signedStoreEvent;
    const user=accountRoute?await auth.resolve(request):null;
    if(user){const blocked=await admissionGate(request,env.DB,user);if(blocked)return blocked;}
    const response=await application(verifiedRequest(request,user)),headers=new Headers(response.headers);
    if(accountRoute){headers.set('Cache-Control','private, no-store');headers.append('Vary','Cookie');}
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Strict-Transport-Security','max-age=31536000');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'The application is temporarily unavailable.'},{status:error instanceof AppError?error.status:503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
}
