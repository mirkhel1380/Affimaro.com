import {z} from 'zod';
import {AppError} from '../lib/service.ts';
import {accountPortal,businessPortal,type Portal} from '../lib/portal-policy.ts';
import {admissions,isPlatformAdmin} from '../lib/admissions.ts';
import {sealAuth} from './auth-seal.ts';
import {authenticatedAssurance,factorSchema,requireFreshSecurity,type Factor} from './auth-assurance.ts';
import type {AuthConfig,AuthFlow,AuthUser,ProviderUser,Session,Tokens} from './auth-core.ts';

type Current={row:Session;tokens:Tokens;user:AuthUser;providerUser:ProviderUser;assurance:{level:string;verifiedAt:number};requiresMfa:boolean};
type Context={db:D1Database;config:AuthConfig;provider:(path:string,method:'GET'|'POST'|'PUT'|'DELETE',body?:unknown,token?:string)=>Promise<unknown>;session:(request:Request,recovery?:boolean,allowMfa?:boolean)=>Promise<Current|null>;rate:(purpose:string,email:string,ip:string,maximum:number,seconds?:number)=>Promise<void>;random:()=>string;issue:(raw:unknown,email:string|null,recovery?:boolean,previous?:string|null,portal?:Portal,onboarding?:never,ownerOnly?:boolean)=>Promise<{cookie:string;needsMfa:boolean;needsProfile:boolean;user:AuthUser}>;checkedUser:(raw:unknown)=>ProviderUser};
const uuid=z.string().uuid(),confirmed=z.literal(true),code=z.string().regex(/^[0-9]{6}$/);
const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('enroll'),type:z.literal('totp')}).strict(),
 z.object({action:z.literal('enrollPhone'),phone:z.string().regex(/^\+[1-9][0-9]{7,14}$/)}).strict(),
 z.object({action:z.literal('challenge'),factorId:uuid}).strict(),
 z.object({action:z.literal('verify'),factorId:uuid,challengeId:uuid,code}).strict(),
 z.object({action:z.literal('remove'),factorId:uuid,confirmation:confirmed}).strict(),
 z.object({action:z.literal('revoke'),sessionId:uuid,confirmation:confirmed}).strict(),
 z.object({action:z.literal('revokeOthers'),confirmation:confirmed}).strict(),
]);
const tokensSchema=z.object({access_token:z.string().min(20).max(10000),refresh_token:z.string().min(10).max(10000),expires_in:z.number().int().positive().max(86400),user:z.unknown()});
const stamp=()=>Math.floor(Date.now()/1000);
function checked<S extends z.ZodTypeAny>(schema:S,raw:unknown):z.output<S>{const r=schema.safeParse(raw);if(!r.success)throw new AppError(400,'Check the security form and try again.');return r.data;}
function owned(current:Current,id:string):Factor{const factor=current.providerUser.factors.find(f=>f.id===id);if(!factor||!['totp','phone'].includes(factor.factor_type)||current.requiresMfa&&factor.status!=='verified')throw new AppError(403,'Choose one of your verified security methods.');return factor;}
export function securityMethods(c:Context){
 const {db,config,provider,session,rate}=c;
 async function options(){const raw=checked(z.object({external:z.record(z.string(),z.boolean()).default({}),saml_enabled:z.boolean().optional(),disable_signup:z.boolean().optional()}),await provider('/settings','GET'));return {google:raw.external.google===true,apple:raw.external.apple===true,sso:raw.saml_enabled===true,phone:raw.external.phone===true,signup:raw.disable_signup!==true};}
 async function current(request:Request){const s=await session(request,false,true);if(!s)throw new AppError(401,'Sign in to manage your account security.');return s;}
 async function storeTokens(s:Current,lease:string,raw:unknown,requireAal2=false){
  const fresh=checked(tokensSchema,raw),user=c.checkedUser(await provider('/user','GET',undefined,fresh.access_token)),claimed=c.checkedUser(fresh.user);
  if(user.id!==s.row.provider_id||claimed.id!==user.id||user.email.toLowerCase()!==s.user.email.toLowerCase()||claimed.email.toLowerCase()!==user.email.toLowerCase())throw new AppError(403,'The account identity could not be confirmed.');
  if(requireAal2&&authenticatedAssurance(fresh.access_token,user.id,config.supabaseUrl+'/auth/v1').level!=='aal2')throw new AppError(403,'The second verification could not be confirmed.');
  const encrypted=await sealAuth({origin:config.origin,access_token:fresh.access_token,refresh_token:fresh.refresh_token,expires_at:stamp()+fresh.expires_in},config.encryptionKey,`auth-session/${s.row.id}`);
  const result=await db.prepare('UPDATE auth_sessions SET encrypted_tokens=? WHERE id=? AND user_id=? AND lease_id=? AND expires_at>?').bind(encrypted,s.row.id,s.user.userId,lease,stamp()).run();
  if(result.meta.changes!==1)throw new AppError(409,'This session changed. Sign in again.');
  return user;
 }
 async function leased<T>(s:Current,work:(lease:string)=>Promise<T>){
  const lease=crypto.randomUUID(),at=stamp(),locked=await db.prepare('UPDATE auth_sessions SET lease_id=?,lease_until=? WHERE id=? AND encrypted_tokens=? AND expires_at>? AND (lease_until IS NULL OR lease_until<=?)').bind(lease,at+45,s.row.id,s.row.encrypted_tokens,at,at).run();
  if(locked.meta.changes!==1)throw new AppError(409,'Your security settings are updating. Retry in a moment.');
  try{return await work(lease);}finally{await db.prepare('UPDATE auth_sessions SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(s.row.id,lease).run();}
 }
 async function revokeOthers(s:Current,lease:string){const r=await db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND id<>? AND EXISTS (SELECT 1 FROM auth_sessions WHERE id=? AND lease_id=?)').bind(s.user.userId,s.row.id,s.row.id,lease).run();return Number(r.meta.changes);}
 return {
  options,
  async securitySnapshot(request:Request){const s=await current(request),at=stamp();let recent=true;try{requireFreshSecurity(s);}catch{recent=false;}
   const sessions=s.requiresMfa?[]:(await db.prepare('SELECT id,created_at,expires_at FROM auth_sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 50').bind(s.user.userId,at).all<{id:string;created_at:string;expires_at:number}>()).results;
   const count=s.requiresMfa?0:(await db.prepare('SELECT count(*) AS count FROM auth_sessions WHERE user_id=? AND expires_at>?').bind(s.user.userId,at).first<{count:number}>())?.count||0;
   return {email:s.user.email,owner:await isPlatformAdmin(db,s.user.userId),portal:await accountPortal(db,s.user.userId),requiresMfa:s.requiresMfa,assurance:s.assurance.level,recentlyVerified:recent,factors:s.providerUser.factors.filter(f=>['totp','phone'].includes(f.factor_type)).map(f=>({id:f.id,type:f.factor_type,status:f.status,name:f.friendly_name||'',phone:f.phone?'•••• '+f.phone.slice(-4):null})),providers:await options(),sessions:sessions.map(v=>({id:v.id,current:v.id===s.row.id,createdAt:v.created_at,expiresAt:v.expires_at})),sessionCount:count};
  },
  async securityAction(request:Request,input:unknown){const value=checked(actionSchema,input),s=await current(request),ip=request.headers.get('CF-Connecting-IP')||'unknown';
   await rate('security-'+value.action,s.user.email,ip,value.action==='verify'?8:12);
   if(s.requiresMfa&&!['challenge','verify'].includes(value.action))throw new AppError(403,'Complete your second verification first.');
   if(!['challenge','verify'].includes(value.action))requireFreshSecurity(s);
   return leased(s,async lease=>{
    if(value.action==='revokeOthers')return {signedOut:await revokeOthers(s,lease)};
    if(value.action==='revoke'){if(value.sessionId===s.row.id)throw new AppError(400,'Use Sign out to end this session.');const r=await db.prepare('DELETE FROM auth_sessions WHERE id=? AND user_id=? AND id<>? AND EXISTS (SELECT 1 FROM auth_sessions WHERE id=? AND lease_id=?)').bind(value.sessionId,s.user.userId,s.row.id,s.row.id,lease).run();return {signedOut:Number(r.meta.changes)};}
    if(value.action==='enroll'||value.action==='enrollPhone'){
     const type=value.action==='enroll'?'totp':'phone',raw=checked(z.object({id:uuid,type:z.string().optional(),totp:z.object({qr_code:z.string().max(100000),secret:z.string().regex(/^[A-Z2-7]+=*$/).max(200)}).optional()}),await provider('/factors','POST',{factor_type:type,friendly_name:type==='totp'?'Authenticator app':'Phone verification',...(type==='totp'?{issuer:'Affimaro'}:{phone:value.action==='enrollPhone'?value.phone:''})},s.tokens.access_token));
     if(raw.type&&raw.type!==type)throw new AppError(503,'The security method could not be created.');
     if(type==='phone')return {factorId:raw.id,type};
     const totp=raw.totp;if(!totp)throw new AppError(503,'The authenticator setup could not be read.');const svg=totp.qr_code.trim();
     if(!/^<svg[\s>]/.test(svg)||!/<\/svg>$/.test(svg)||/<(?:script|foreignObject)|\bon\w+\s*=|<!DOCTYPE|<!ENTITY|\b(?:href|src)\s*=|url\s*\(/i.test(svg))throw new AppError(503,'The authenticator image could not be read.');
     return {factorId:raw.id,type,secret:totp.secret,qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)};
    }
    const factor=owned(s,value.factorId);
    if(value.action==='challenge'){const raw=checked(z.object({id:uuid}),await provider('/factors/'+factor.id+'/challenge','POST',factor.factor_type==='phone'?{channel:'sms'}:{},s.tokens.access_token));return {challengeId:raw.id};}
    if(value.action==='verify'){
     await storeTokens(s,lease,await provider('/factors/'+factor.id+'/verify','POST',{challenge_id:value.challengeId,code:value.code},s.tokens.access_token),true);
     if(factor.status==='unverified')await revokeOthers(s,lease);return {verified:true};
    }
    await provider('/factors/'+factor.id,'DELETE',undefined,s.tokens.access_token);
    await storeTokens(s,lease,await provider('/token?grant_type=refresh_token','POST',{refresh_token:s.tokens.refresh_token}));await revokeOthers(s,lease);return {removed:true};
   });
  },
  async beginSocial(flow:AuthFlow,input:unknown,ip:string){const value=checked(z.object({provider:z.enum(['google','apple','sso']),domain:z.string().trim().max(253).optional()}).strict(),input);if(!['login','signup'].includes(flow.purpose))throw new AppError(403,'Open sign in again.');
   const available=await options();if(!available[value.provider]||flow.purpose==='signup'&&!available.signup)throw new AppError(503,'This sign-in option is not configured yet. Please use email.');
   await rate('social-start','',ip,20);const verifier=c.random(),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),callback=config.origin+'/auth/'+(flow.ownerOnly?'owner/':flow.portal?flow.portal+'/':'')+'callback';
   const next:AuthFlow={...flow,nonce:c.random(),purpose:'oauth',expires:stamp()+900,provider:value.provider,verifier};
   if(value.provider==='sso'){
    const domain=value.domain?.toLowerCase();if(!domain||! /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw new AppError(400,'Enter your organization’s domain, such as company.com.');
    const raw=checked(z.object({url:z.string().url().max(12000)}),await provider('/sso','POST',{domain,redirect_to:callback,skip_http_redirect:true,code_challenge:challenge,code_challenge_method:'s256'})),target=new URL(raw.url);if(target.protocol!=='https:'||target.username||target.password||target.port||target.hash)throw new AppError(503,'The organization sign-in link could not be verified.');return {flow:next,url:target.href};
   }
   const target=new URL(config.supabaseUrl+'/auth/v1/authorize');target.search=new URLSearchParams({provider:value.provider,redirect_to:callback,code_challenge:challenge,code_challenge_method:'s256'}).toString();return {flow:next,url:target.href};
  },
  async finishSocial(flow:AuthFlow,input:unknown,ip:string,previous?:string|null){const value=checked(z.object({code:z.string().min(8).max(2048)}).strict(),input);if(flow.purpose!=='oauth'||!flow.provider||!flow.verifier)throw new AppError(403,'Start provider sign-in again.');await rate('social-callback','',ip,20);
   const claim=await db.prepare('INSERT OR IGNORE INTO auth_rate_limits (id,count,expires_at) VALUES (?,1,?)').bind('oauth-once/'+flow.nonce,flow.expires).run();if(claim.meta.changes!==1)throw new AppError(403,'This sign-in link has already been used. Start again.');
   return c.issue(await provider('/token?grant_type=pkce','POST',{auth_code:value.code,code_verifier:flow.verifier}),null,false,previous,flow.portal,undefined,flow.ownerOnly);
  },
  async completeSocial(request:Request,flow:AuthFlow,input:unknown){const s=await session(request);if(!s||flow.purpose!=='complete'||!flow.portal||flow.ownerOnly)throw new AppError(403,'Sign in from your account page again.');const actual=await accountPortal(db,s.user.userId);if(actual&&actual!==flow.portal)throw new AppError(403,'Use your own account portal.');
   const base=z.object({name:z.string().trim().min(2).max(60)}),value=checked(businessPortal(flow.portal)?base.extend({businessName:z.string().trim().min(2).max(60)}).strict():base.extend({channel:z.enum(['Content creator','Newsletter','Community','Blog','Other'])}).strict(),input),registration=admissions(db,s.user);
   if(!actual){if('businessName' in value)await registration.start(flow.portal,{businessName:value.businessName,plan:flow.plan});else await registration.start(flow.portal,{channel:value.channel});}
   await db.prepare('UPDATE accounts SET display_name=? WHERE id=?').bind(value.name,s.user.userId).run();return {complete:true};
  },
 };
}
