import {z} from 'zod';
import {AppError} from '../lib/service.ts';
import {openAuth,sealAuth} from './auth-seal.ts';
import {trustedPublicOrigin} from '../lib/public-origin.ts';

export type AuthConfig={origin:string;supabaseUrl:string;publishableKey:string;encryptionKey:string};
export type AuthUser={userId:string;email:string;fullName:string|null};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type ProviderUser={id:string;email:string;email_confirmed_at:string;user_metadata?:{display_name?:string}};
type Tokens={access_token:string;refresh_token:string;expires_at:number};
type Session={id:string;token_hash:string;provider_id:string;user_id:string;encrypted_tokens:string;recovery_only:number;expires_at:number;lease_id:string|null;lease_until:number|null};
export type AuthFlow={nonce:string;purpose:string;returnTo:string;email?:string;expires:number};
export const SESSION_COOKIE='__Host-affimaro_session',FLOW_COOKIE='__Host-affimaro_flow';
const userSchema=z.object({id:z.string().uuid(),email:z.string().email().max(254).regex(/^[\x21-\x7e]+$/),email_confirmed_at:z.string().datetime(),user_metadata:z.object({display_name:z.string().max(200).optional()}).optional()});
const tokenSchema=z.object({access_token:z.string().min(20).max(10000),refresh_token:z.string().min(10).max(10000),expires_in:z.number().int().positive().max(86400),token_type:z.literal('bearer'),user:z.unknown()});
const storedTokens=z.object({access_token:z.string().min(20).max(10000),refresh_token:z.string().min(10).max(10000),expires_at:z.number().int().positive()}).strict();
const flowSchema=z.object({nonce:z.string().regex(/^[a-f0-9]{64}$/),purpose:z.string().min(1).max(30),returnTo:z.string().max(500),email:z.string().email().max(254).optional(),expires:z.number().int()}).strict();
const hex=(data:Uint8Array)=>Array.from(data,byte=>byte.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const stamp=()=>new Date().toISOString();
const one=<T>(db:D1Database,query:string,...values:unknown[])=>db.prepare(query).bind(...values).first<T>();
const emailSchema=z.string().trim().email().max(254).regex(/^[\x21-\x7e]+$/).transform(value=>value.toLowerCase());
export function validateAuthConfig(value:AuthConfig){
  const origin=trustedPublicOrigin(value.origin);let url:URL;try{url=new URL(value.supabaseUrl);}catch{throw new AppError(503,'Independent sign-in is not configured yet.');}
  if(origin.endsWith('.chatgpt.site')||url.protocol!=='https:'||!/^https:\/\/[a-z0-9-]{6,80}\.supabase\.co$/.test(url.origin)||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||!/^[a-f0-9]{64}$/i.test(value.encryptionKey))throw new AppError(503,'Independent sign-in is not configured correctly.');
  let publicKey=/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(value.publishableKey);
  if(value.publishableKey.startsWith('eyJ'))try{const payload=JSON.parse(atob(value.publishableKey.split('.')[1].replaceAll('-','+').replaceAll('_','/')));publicKey=payload.role==='anon';}catch{publicKey=false;}
  if(!publicKey)throw new AppError(503,'Use a Supabase publishable or anon key for independent sign-in.');
  return {...value,origin,supabaseUrl:url.origin,encryptionKey:value.encryptionKey.toLowerCase()};
}
export function safeReturnTo(value:string|null|undefined){
  if(!value||value.length>500||!value.startsWith('/')||value.startsWith('//')||/[\u0000-\u001f\u007f]/.test(value))return '/account';
  try{const url=new URL(value,'https://app.local');if(url.origin!=='https://app.local'||url.pathname.startsWith('/auth/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))return '/account';const result=url.pathname+url.search+url.hash;return result.length<=500?result:'/account';}catch{return '/account';}
}
export function cookieValue(request:Request,name:string){const values=(request.headers.get('cookie')||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):null;}
export function authCookie(name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export const clearAuthCookie=(name:string)=>authCookie(name,'',0);
async function hash(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
function checkedUser(raw:unknown):ProviderUser{const result=userSchema.safeParse(raw);if(!result.success||Date.parse(result.data.email_confirmed_at)>Date.now()+5000)throw new AppError(403,'Verify your email before signing in.');return result.data;}
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const result=schema.safeParse(value);if(!result.success)throw new AppError(400,'Check the email, password or verification code.');return result.data;}

export function emailAuth(db:D1Database,settings:AuthConfig,fetcher:Fetcher=fetch){
  const config=validateAuthConfig(settings);
  async function provider(path:string,method:'GET'|'POST'|'PUT',body?:unknown,token?:string):Promise<unknown>{
    const allowed=method==='GET'?['/user','/settings'].includes(path):method==='PUT'?path==='/user':['/signup','/token?grant_type=password','/token?grant_type=refresh_token','/verify','/recover','/resend','/logout?scope=local','/logout?scope=global'].includes(path);
    if(!allowed)throw new AppError(500,'Unsupported authentication endpoint.');
    let response:Response;try{response=await fetcher(config.supabaseUrl+'/auth/v1'+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch{throw new AppError(503,'Sign-in is temporarily unavailable. Please try again.');}
    if(!response.ok){await response.body?.cancel();if(response.status===429)throw new AppError(429,'Too many attempts. Wait before trying again.');if(response.status>=500)throw new AppError(503,'Sign-in is temporarily unavailable. Please try again.');throw new AppError(401,'The credentials or verification code could not be confirmed.');}
    if(response.status===204)return null;
    const reader=response.body?.getReader();if(!reader)throw new AppError(503,'The sign-in response could not be read.');const parts:Uint8Array[]=[];let length=0;
    try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>262144){await reader.cancel();throw new Error();}parts.push(part.value);}}catch{throw new AppError(503,'The sign-in response could not be read.');}
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError(503,'The sign-in response could not be read.');}
  }
  async function emailProvider(signup=false){
    const settings=z.object({mailer_autoconfirm:z.literal(false),external:z.object({email:z.literal(true)}),disable_signup:z.boolean()}).safeParse(await provider('/settings','GET'));
    if(!settings.success)throw new AppError(503,'The site owner must enable verified email sign-in before access can continue.');
    if(signup&&settings.data.disable_signup)throw new AppError(503,'New account registration is temporarily closed.');
  }
  async function identity(user:ProviderUser){
    let row=await one<{user_id:string}>(db,'SELECT user_id FROM auth_identities WHERE provider_id=?',user.id);
    if(row)return row.user_id;
    // Legacy account ownership is linked by an explicit operator mapping, never email alone.
    if(await one(db,'SELECT id FROM accounts WHERE lower(email)=?',user.email.toLowerCase()))throw new AppError(409,'Your existing account needs its migration identity linked before you sign in. Contact the site owner.');
    const id=crypto.randomUUID(),name=(user.user_metadata?.display_name||user.email.split('@')[0]).trim().slice(0,60)||'Partner';
    try{await db.batch([db.prepare('INSERT INTO accounts (id,email,display_name,created_at) VALUES (?,?,?,?)').bind(id,user.email,name,stamp()),db.prepare('INSERT INTO auth_identities (provider_id,user_id,created_at) VALUES (?,?,?)').bind(user.id,id,stamp())]);}
    catch(error){row=await one(db,'SELECT user_id FROM auth_identities WHERE provider_id=?',user.id);if(row)return row.user_id;throw error;}
    return id;
  }
  async function rate(purpose:string,email:string,ip:string,maximum:number,seconds=900){
    const at=Math.floor(Date.now()/1000),window=Math.floor(at/seconds),key=await crypto.subtle.importKey('raw',Uint8Array.from(config.encryptionKey.match(/../g)!,byte=>parseInt(byte,16)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    for(const part of ['email/'+email.toLowerCase(),'ip/'+ip]){
      const id=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`auth-limit/${purpose}/${part}/${window}`))));
      await db.prepare('INSERT INTO auth_rate_limits (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').bind(id,(window+1)*seconds).run();
      if((await one<{count:number}>(db,'SELECT count FROM auth_rate_limits WHERE id=?',id))!.count>maximum)throw new AppError(429,'Too many attempts. Wait before trying again.');
    }
    await db.prepare('DELETE FROM auth_rate_limits WHERE id IN (SELECT id FROM auth_rate_limits WHERE expires_at<? LIMIT 100)').bind(at).run();
  }
  async function issue(raw:unknown,expectedEmail:string,recoveryOnly=false,previousCookie?:string|null){
    const response=tokenSchema.safeParse(raw);if(!response.success)throw new AppError(503,'The sign-in session could not be verified.');
    const user=checkedUser(await provider('/user','GET',undefined,response.data.access_token)),claimed=checkedUser(response.data.user);
    if(user.id!==claimed.id||user.email.toLowerCase()!==claimed.email.toLowerCase()||user.email.toLowerCase()!==expectedEmail.toLowerCase())throw new AppError(403,'The sign-in identity could not be verified.');
    const userId=await identity(user),id=crypto.randomUUID(),token=random(),tokenHash=await hash(token),at=Math.floor(Date.now()/1000),expires=at+(recoveryOnly?600:30*86400);
    const credentials:Tokens={access_token:response.data.access_token,refresh_token:response.data.refresh_token,expires_at:at+response.data.expires_in};
    const encrypted=await sealAuth(credentials,config.encryptionKey,`auth-session/${id}`);
    await db.batch([db.prepare('INSERT INTO auth_sessions (id,token_hash,provider_id,user_id,encrypted_tokens,recovery_only,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,tokenHash,user.id,userId,encrypted,recoveryOnly?1:0,expires,stamp()),...(previousCookie&&/^[a-f0-9]{64}$/.test(previousCookie)?[db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(previousCookie))]:[])]);
    return {cookie:authCookie(SESSION_COOKIE,token,recoveryOnly?600:30*86400),user:{userId,email:user.email,fullName:user.user_metadata?.display_name?.slice(0,60)||null}};
  }
  async function session(request:Request,recoveryAllowed=false){
    const value=cookieValue(request,SESSION_COOKIE);if(!value||!/^[a-f0-9]{64}$/.test(value))return null;
    const row=await one<Session>(db,'SELECT * FROM auth_sessions WHERE token_hash=?',await hash(value)),at=Math.floor(Date.now()/1000);
    if(!row)return null;
    if(row.expires_at<=at){await db.prepare('DELETE FROM auth_sessions WHERE id=?').bind(row.id).run();return null;}
    if(row.recovery_only&&!recoveryAllowed)return null;
    let tokens:Tokens;try{tokens=storedTokens.parse(await openAuth(row.encrypted_tokens,config.encryptionKey,`auth-session/${row.id}`));}catch{throw new AppError(503,'Your session could not be opened. Sign in again.');}
    if(tokens.expires_at<=at+60){
      const lease=crypto.randomUUID();await db.prepare('UPDATE auth_sessions SET lease_id=?,lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)').bind(lease,at+45,row.id,at).run();
      const locked=await one<Session>(db,'SELECT * FROM auth_sessions WHERE id=?',row.id);
      if(locked?.lease_id!==lease){if(tokens.expires_at<=at)throw new AppError(503,'Your session is refreshing. Please retry in a moment.');}
      else try{
        tokens=storedTokens.parse(await openAuth(locked.encrypted_tokens,config.encryptionKey,`auth-session/${row.id}`));
        if(tokens.expires_at<=at+60){
          const fresh=tokenSchema.safeParse(await provider('/token?grant_type=refresh_token','POST',{refresh_token:tokens.refresh_token}));if(!fresh.success||checkedUser(fresh.data.user).id!==row.provider_id)throw new AppError(403,'Your session could not be refreshed. Sign in again.');
          tokens={access_token:fresh.data.access_token,refresh_token:fresh.data.refresh_token,expires_at:Math.floor(Date.now()/1000)+fresh.data.expires_in};
          await db.prepare('UPDATE auth_sessions SET encrypted_tokens=? WHERE id=? AND lease_id=?').bind(await sealAuth(tokens,config.encryptionKey,`auth-session/${row.id}`),row.id,lease).run();
        }
      }catch(error){if(error instanceof AppError&&[401,403].includes(error.status)){await db.prepare('DELETE FROM auth_sessions WHERE id=?').bind(row.id).run();return null;}throw error;}
      finally{await db.prepare('UPDATE auth_sessions SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(row.id,lease).run();}
    }
    let user:ProviderUser;try{user=checkedUser(await provider('/user','GET',undefined,tokens.access_token));}catch(error){if(error instanceof AppError&&[401,403].includes(error.status)){await db.prepare('DELETE FROM auth_sessions WHERE id=?').bind(row.id).run();return null;}throw error;}
    const mapped=await one<{user_id:string}>(db,'SELECT user_id FROM auth_identities WHERE provider_id=?',row.provider_id);
    if(user.id!==row.provider_id||mapped?.user_id!==row.user_id){await db.prepare('DELETE FROM auth_sessions WHERE id=?').bind(row.id).run();return null;}
    return {row,tokens,user:{userId:row.user_id,email:user.email,fullName:user.user_metadata?.display_name?.slice(0,60)||null}};
  }
  return {
    async newFlow(purpose:string,returnTo?:string,email?:string){const flow:AuthFlow={nonce:random(),purpose,returnTo:safeReturnTo(returnTo),...(email?{email}:{}),expires:Math.floor(Date.now()/1000)+900};return {flow,cookie:authCookie(FLOW_COOKIE,await sealAuth(flow,config.encryptionKey,`auth-flow/${config.origin}`),900)};},
    async flow(request:Request){const value=cookieValue(request,FLOW_COOKIE);if(!value||value.length>4096)return null;try{const data=flowSchema.parse(await openAuth(value,config.encryptionKey,`auth-flow/${config.origin}`));return data.expires>Math.floor(Date.now()/1000)&&data.expires<=Math.floor(Date.now()/1000)+905?data:null;}catch{return null;}},
    async login(input:unknown,ip:string,previousCookie?:string|null){const value=parse(z.object({email:emailSchema,password:z.string().min(1).max(128)}).strict(),input);await rate('login',value.email,ip,8);await emailProvider();return issue(await provider('/token?grant_type=password','POST',{email:value.email,password:value.password}),value.email,false,previousCookie);},
    async signup(input:unknown,ip:string){const value=parse(z.object({email:emailSchema,password:z.string().min(12).max(128),name:z.string().trim().min(2).max(60)}).strict(),input);await rate('signup',value.email,ip,4,3600);await emailProvider(true);await provider('/signup','POST',{email:value.email,password:value.password,data:{display_name:value.name}});return {email:value.email};},
    async recover(input:unknown,ip:string){const value=parse(z.object({email:emailSchema}).strict(),input);await rate('recover',value.email,ip,4,3600);await provider('/recover','POST',{email:value.email});return {email:value.email};},
    async resend(flow:AuthFlow,ip:string){if(!flow.email||!['verify-signup','verify-recovery'].includes(flow.purpose))throw new AppError(400,'Start email verification again.');await rate('resend',flow.email,ip,4,3600);await provider(flow.purpose==='verify-signup'?'/resend':'/recover','POST',flow.purpose==='verify-signup'?{type:'signup',email:flow.email}:{email:flow.email});},
    async verify(flow:AuthFlow,input:unknown,ip:string,previousCookie?:string|null){const value=parse(z.object({code:z.string().regex(/^[0-9]{6}$/)}).strict(),input);if(!flow.email||!['verify-signup','verify-recovery'].includes(flow.purpose))throw new AppError(400,'Start email verification again.');await rate('verify',flow.email,ip,8);await emailProvider();return issue(await provider('/verify','POST',{type:flow.purpose==='verify-signup'?'signup':'recovery',email:flow.email,token:value.code}),flow.email,flow.purpose==='verify-recovery',previousCookie);},
    async resolve(request:Request){return (await session(request))?.user||null;},
    async canReset(request:Request){return Boolean((await session(request,true))?.row.recovery_only);},
    async reset(request:Request,input:unknown){const value=parse(z.object({password:z.string().min(12).max(128)}).strict(),input),current=await session(request,true);if(!current?.row.recovery_only)throw new AppError(403,'Verify a password-recovery code first.');const result=checkedUser(await provider('/user','PUT',{password:value.password},current.tokens.access_token));if(result.id!==current.row.provider_id)throw new AppError(403,'Password update identity could not be verified.');await db.prepare('DELETE FROM auth_sessions WHERE provider_id=?').bind(current.row.provider_id).run();try{await provider('/logout?scope=global','POST',{},current.tokens.access_token);}catch{}return clearAuthCookie(SESSION_COOKIE);},
    async logout(request:Request){const value=cookieValue(request,SESSION_COOKIE);if(value&&/^[a-f0-9]{64}$/.test(value)){const current=await one<Session>(db,'SELECT * FROM auth_sessions WHERE token_hash=?',await hash(value));if(current){await db.prepare('DELETE FROM auth_sessions WHERE id=?').bind(current.id).run();try{const tokens=storedTokens.parse(await openAuth(current.encrypted_tokens,config.encryptionKey,`auth-session/${current.id}`));await provider('/logout?scope=local','POST',{},tokens.access_token);}catch{}}}return clearAuthCookie(SESSION_COOKIE);},
  };
}
