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
  if(!counter||counter.count>(action==='send'?4:8))throw new AppError(429,'تلاش‌ها زیاد شد. کمی صبر کن و دوباره کوشش کو.');
  await db.prepare('DELETE FROM auth_rate_limits WHERE id IN (SELECT id FROM auth_rate_limits WHERE expires_at<? LIMIT 100)').bind(now).run();
}

async function boundedJson(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new AppError(503,'پاسخ تأیید دریافت نشد. دوباره کوشش کو.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>262144){await reader.cancel();throw new AppError(503,'پاسخ تأیید قابل بررسی نبود.');}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new AppError(503,'پاسخ تأیید قابل بررسی نبود.');}
}

export async function nativeEmailConfirmation(request:Request,options:Options){
  try{
    const account=await nativeConfirmationAccount(options.native,options.db,options.user);
    if(request.method!=='POST')throw new AppError(405,'از فورم همین صفحه استفاده کو.');
    assertSameOrigin(request);
    const parsed=input.safeParse(await readJson(request));if(!parsed.success)throw new AppError(400,'کود ایمیل باید ۶ تا ۱۰ رقم باشد.');
    const value=parsed.data,provider=supabaseSettings({SUPABASE_URL:options.provider.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:options.provider.publishableKey}),fetcher=options.fetcher??fetch;
    await rate(options.db,account.id,value.action);
    async function remote(path:string,method:'GET'|'POST',body?:unknown,token?:string){
      let response:Response;
      try{response=await fetcher(provider.supabaseUrl+'/auth/v1'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:provider.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
      catch{throw new AppError(503,'ارتباط برقرار نشد. دوباره کوشش کو.');}
      if(!response.ok){await response.body?.cancel();if(response.status===429)throw new AppError(429,'کمی صبر کن و دوباره کوشش کو.');if(response.status>=500)throw new AppError(503,'تأیید فعلاً در دسترس نیست. دوباره کوشش کو.');throw new AppError(400,'کود درست نیست یا وقتش گذشته. یک کود تازه بگیر.');}
      return boundedJson(response);
    }
    const policy=z.object({mailer_autoconfirm:z.literal(false),external:z.object({email:z.literal(true)})}).safeParse(await remote('/settings','GET'));
    if(!policy.success)throw new AppError(503,'تنظیمات تأیید ایمیل باید بررسی شود.');
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
      if(!token.success)throw new AppError(403,'تأیید ایمیل قابل بررسی نبود. دوباره کوشش کو.');
      const checked=providerUser.safeParse(await remote('/user','GET',undefined,token.data.access_token));
      if(!checked.success||checked.data.id!==token.data.user.id||checked.data.email.toLowerCase()!==account.email||token.data.user.email.toLowerCase()!==account.email||Date.parse(checked.data.email_confirmed_at)>Date.now()+5000||Date.parse(token.data.user.email_confirmed_at)>Date.now()+5000)throw new AppError(403,'ایمیل این حساب تأیید نشد.');
      return json({ok:true,confirmed:true});
    }finally{
      if(access.success)try{
        const response=await fetcher(provider.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:provider.publishableKey,Authorization:'Bearer '+access.data.access_token}});
        await response.body?.cancel();
      }catch{/* Verification is complete; no provider credentials are retained. */}
    }
  }catch(error){return json({ok:false,error:error instanceof AppError?error.message:'تأیید فعلاً تکمیل نشد. دوباره کوشش کو.'},error instanceof AppError?error.status:503);}
}
