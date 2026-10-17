import {z} from 'zod';
import {AppError} from '../lib/service.ts';
import {assertSameOrigin,readJson} from '../lib/request.ts';
import {supabaseSettings} from './provider-settings.mjs';

type Identity={userId:string;email:string};
type Options={native:boolean;db:D1Database;user:Identity|null;provider:{supabaseUrl:string;publishableKey:string};fetcher?:typeof fetch};
const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('send')}).strict(),
  z.object({action:z.literal('verify'),code:z.string().trim().regex(/^[0-9]{6,10}$/)}).strict(),
]);
const providerUser=z.object({id:z.string().uuid(),email:z.string().email(),email_confirmed_at:z.string().datetime({offset:true})});
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});

export async function nativeConfirmationAccount(native:boolean,db:D1Database,user:Identity|null){
  if(!native||!user)throw new AppError(404,'This page could not be found.');
  const account=await db.prepare('SELECT id,email FROM accounts WHERE id=?').bind(user.userId).first<{id:string;email:string}>();
  if(!account||account.email.toLowerCase()!==user.email.toLowerCase())throw new AppError(404,'This page could not be found.');
  return {id:account.id,email:account.email.toLowerCase()};
}

async function rate(db:D1Database,userId:string,action:'send'|'verify'){
  const now=Math.floor(Date.now()/1000),seconds=action==='send'?3600:900,window=Math.floor(now/seconds);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`native-email-confirmation/${action}/${userId}/${window}`));
  const id=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT INTO auth_rate_limits (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').bind(id,(window+1)*seconds).run();
  const counter=await db.prepare('SELECT count FROM auth_rate_limits WHERE id=?').bind(id).first<{count:number}>();
  if(!counter||counter.count>(action==='send'?4:8))throw new AppError(429,'Too many attempts. Wait a while before trying again.');
  await db.prepare('DELETE FROM auth_rate_limits WHERE id IN (SELECT id FROM auth_rate_limits WHERE expires_at<? LIMIT 100)').bind(now).run();
}

async function boundedJson(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new AppError(503,'The verification response could not be read. Please try again.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>262144){await reader.cancel();throw new AppError(503,'The verification response could not be checked. Please try again.');}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new AppError(503,'The verification response could not be checked. Please try again.');}
}

function confirmationClient(options:Pick<Options,'provider'|'fetcher'>){
  const provider=supabaseSettings({SUPABASE_URL:options.provider.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:options.provider.publishableKey}),fetcher=options.fetcher??fetch;
  async function remote(path:string,method:'GET'|'POST',body?:unknown,token?:string){
    let response:Response;
    // Workerd supports manual redirects; reject non-2xx below without forwarding credentials.
    try{response=await fetcher(provider.supabaseUrl+'/auth/v1'+path,{method,redirect:'manual',signal:AbortSignal.timeout(10000),headers:{apikey:provider.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch{throw new AppError(503,'Could not connect. Please try again.');}
    if(!response.ok){await response.body?.cancel();if(response.status===429)throw new AppError(429,'Please wait a while before trying again.');if(response.status>=500||response.status<400)throw new AppError(503,'Verification is temporarily unavailable. Please try again.');throw new AppError(400,'The code is incorrect or has expired. Request a new code.');}
    return boundedJson(response);
  }
  async function policy(){
    const result=z.object({mailer_autoconfirm:z.literal(false),external:z.object({email:z.literal(true)})}).safeParse(await remote('/settings','GET'));
    if(!result.success)throw new AppError(503,'Email verification settings need to be checked.');
  }
  async function revoke(token:string){
    try{
      const response=await fetcher(provider.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{apikey:provider.publishableKey,Authorization:'Bearer '+token}});
      await response.body?.cancel();
    }catch{/* Verification is complete; no provider credentials are retained. */}
  }
  return {remote,policy,revoke};
}

// Read-only provider reachability, protected by the owner-private Sites boundary.
// No account lookup, email send, code submission or session is involved.
export async function nativeConfirmationStatus(options:Pick<Options,'native'|'provider'|'fetcher'>){
  if(!options.native)return json({ok:false},404);
  try{await confirmationClient(options).policy();return json({ok:true});}
  catch{return json({ok:false},503);}
}

export async function nativeEmailConfirmation(request:Request,options:Options){
  try{
    const account=await nativeConfirmationAccount(options.native,options.db,options.user);
    if(request.method!=='POST')throw new AppError(405,'Use the form on this page.');
    assertSameOrigin(request);
    const parsed=input.safeParse(await readJson(request));if(!parsed.success)throw new AppError(400,'The email code must contain 6–10 digits.');
    const value=parsed.data,client=confirmationClient(options),remote=client.remote;
    await rate(options.db,account.id,value.action);
    await client.policy();
    if(value.action==='send'){
      // A resend confirms an existing provider account; it cannot create a user.
      await remote('/resend','POST',{type:'signup',email:account.email});
      return json({ok:true,sent:true});
    }
    const raw=await remote('/verify','POST',{type:'email',email:account.email,token:value.code});
    const token=z.object({access_token:z.string().min(20).max(10000),token_type:z.literal('bearer'),user:providerUser}).safeParse(raw);
    // Credentials from this one-time verification never become an app session.
    const access=z.object({access_token:z.string().min(20).max(10000)}).safeParse(raw);
    try{
      if(!token.success)throw new AppError(403,'Email verification could not be checked. Please try again.');
      const checked=providerUser.safeParse(await remote('/user','GET',undefined,token.data.access_token));
      if(!checked.success||checked.data.id!==token.data.user.id||checked.data.email.toLowerCase()!==account.email||token.data.user.email.toLowerCase()!==account.email||Date.parse(checked.data.email_confirmed_at)>Date.now()+5000||Date.parse(token.data.user.email_confirmed_at)>Date.now()+5000)throw new AppError(403,'This account’s email could not be verified.');
      return json({ok:true,confirmed:true});
    }finally{
      if(access.success)await client.revoke(access.data.access_token);
    }
  }catch(error){return json({ok:false,error:error instanceof AppError?error.message:'Verification could not be completed. Please try again.'},error instanceof AppError?error.status:503);}
}
