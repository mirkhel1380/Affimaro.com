import {z} from 'zod';
import {requirePlatformAdmin} from './admissions.ts';
import {inspectBillingConfiguration,type BillingConfig} from './billing.ts';
import {portals,type Portal} from './portal-policy.ts';
import type {Identity} from './service.ts';

type AuthSettings={supabaseUrl:string;publishableKey:string};
type LaunchConfig={auth?:AuthSettings;billing:BillingConfig[];paymentKeyReady:boolean;maintenance:boolean};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
export type EmailPolicy={status:'ready'|'attention'|'unavailable'|'not_configured';message:string;signupOpen:boolean;confirmationRequired:boolean;emailEnabled:boolean};
const unknownPolicy={signupOpen:false,confirmationRequired:false,emailEnabled:false};
function publicAuthKey(value:string){
 if(/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(value))return true;
 if(value.startsWith('eyJ'))try{return JSON.parse(atob(value.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon';}catch{}
 return false;
}
async function emailPolicy(settings:AuthSettings|undefined,fetcher:Fetcher):Promise<EmailPolicy>{
 if(!settings||!/^https:\/\/[a-z0-9-]{6,80}\.supabase\.co$/.test(settings.supabaseUrl)||!publicAuthKey(settings.publishableKey))return {status:'not_configured',message:'Verified email sign-in settings are missing.',...unknownPolicy};
 try{
  const response=await fetcher(settings.supabaseUrl+'/auth/v1/settings',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{apikey:settings.publishableKey,Accept:'application/json'}});
  if(!response.ok){await response.body?.cancel();throw new Error();}
  const reader=response.body?.getReader();if(!reader)throw new Error();let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>32768)throw new Error();text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}catch{await reader.cancel().catch(()=>{});throw new Error();}
  const parsed=z.object({external:z.object({email:z.boolean()}),disable_signup:z.boolean(),mailer_autoconfirm:z.boolean()}).safeParse(JSON.parse(text));if(!parsed.success)throw new Error();
  const policy={signupOpen:!parsed.data.disable_signup,confirmationRequired:!parsed.data.mailer_autoconfirm,emailEnabled:parsed.data.external.email},ready=policy.signupOpen&&policy.confirmationRequired&&policy.emailEnabled;
  return {...policy,status:ready?'ready':'attention',message:ready?'Email sign-in is enabled, registration is open and email confirmation is required.':'Check the email provider, signup availability and email-confirmation policy.'};
 }catch{return {status:'unavailable',message:'The email sign-in policy could not be checked. Try again later.',...unknownPolicy};}
}

export async function launchReadiness(db:D1Database,identity:Identity,config:LaunchConfig,fetcher:Fetcher=fetch){
 // Check the stored owner grant before provider requests or platform-wide counts.
 await requirePlatformAdmin(db,identity);
 const [auth,packages,rows]=await Promise.all([
  emailPolicy(config.auth,fetcher),
  Promise.all(config.billing.map(c=>inspectBillingConfiguration(c,fetcher))),
  db.prepare("SELECT COALESCE(r.portal,p.portal) AS portal,p.status,count(*) AS total FROM platform_applications p LEFT JOIN account_portals r ON r.user_id=p.user_id GROUP BY COALESCE(r.portal,p.portal),p.status").all<{portal:Portal;status:string;total:number}>(),
 ]);
 return {checkedAt:new Date().toISOString(),maintenance:config.maintenance,paymentKeyReady:config.paymentKeyReady,auth,emailDelivery:'unverified' as const,packages,portals:portals.map(portal=>({portal,approved:rows.results.filter(r=>r.portal===portal&&r.status==='approved').reduce((n,r)=>n+r.total,0),pending:rows.results.filter(r=>r.portal===portal&&r.status==='pending').reduce((n,r)=>n+r.total,0)}))};
}
