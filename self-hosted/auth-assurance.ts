import {z} from 'zod';
import {AppError} from '../lib/service.ts';

export const factorSchema=z.object({id:z.string().uuid(),factor_type:z.string().max(30),status:z.enum(['verified','unverified']),friendly_name:z.string().max(200).nullish(),phone:z.string().max(30).nullish()});
export type Factor=z.infer<typeof factorSchema>;
// Only inspect claims after /user has authenticated this exact server-held token.
export function authenticatedAssurance(token:string,providerId:string,issuer:string){
 const fallback={level:'aal1' as 'aal1'|'aal2',verifiedAt:0};
 try{const part=token.split('.')[1];if(!part)return fallback;const p=JSON.parse(atob(part.replaceAll('-','+').replaceAll('_','/'))),at=Math.floor(Date.now()/1000);
  if(p.sub!==providerId||p.iss!==issuer||!Number.isInteger(p.exp)||p.exp<=at)return fallback;
  const proofs=Array.isArray(p.amr)?p.amr.filter((v:{method?:string;timestamp?:number})=>['totp','mfa/phone'].includes(v.method||'')&&Number.isInteger(v.timestamp)&&v.timestamp!<=at+5):[];
  return {level:p.aal==='aal2'?'aal2' as const:'aal1' as const,verifiedAt:Math.max(0,...proofs.map((v:{timestamp:number})=>v.timestamp))};
 }catch{return fallback;}
}
export const requiresSecondFactor=(factors:Factor[],level:string)=>factors.some(f=>f.status==='verified')&&level!=='aal2';
export function requireFreshSecurity(current:{requiresMfa:boolean;providerUser:{factors:Factor[]};assurance:{level:string;verifiedAt:number};row:{created_at:string}}){
 const at=Math.floor(Date.now()/1000),enrolled=current.providerUser.factors.some(f=>f.status==='verified'),proof=enrolled?current.assurance.verifiedAt:Math.floor(Date.parse(current.row.created_at)/1000);
 if(current.requiresMfa||(enrolled&&current.assurance.level!=='aal2')||!Number.isFinite(proof)||proof<at-300||proof>at+5)throw new AppError(403,'Verify your sign-in again before changing security settings.');
}
