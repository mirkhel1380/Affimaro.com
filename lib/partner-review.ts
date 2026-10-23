import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {getAdmission,requireApprovedAccount} from './admissions.ts';
import {accountPortal,businessPortal,type Portal} from './portal-policy.ts';
import {mediaPropertiesFor,profileVerificationSummary} from './media-properties.ts';
import {isAccountClosed} from './account-state.ts';
import type {ApplicationProfile} from './application-profile.ts';

import {partnershipProfile} from './partnership-profile.ts';
import type {PartnerApprovalSnapshot} from './partner-approval.ts';
export type PartnerReview={
 id:string;status:string;created_at:string;updated_at:string;name:string;portal:Portal;
 program_name:string;rate_bps:number;window_days:number;program_active:number;
 profile:Partial<ApplicationProfile>;accountApproved:boolean;closed:boolean;ownershipReady:boolean;approvalReady:boolean;
 channels:{name:string;url:string;platform:string;kind:string;language:string;relationship:string;verified:boolean;status:string;verified_at:string|null}[];
};
async function inspectPartnerApplication(db:D1Database,user:Identity,applicationId:string):Promise<{review:PartnerReview;snapshot:PartnerApprovalSnapshot}>{
 await requireApprovedAccount(db,user);
 const portal=await accountPortal(db,user.userId);
 if(!portal||!businessPortal(portal))throw new AppError(403,'Only the program owner can review its applicants.');
 if(!z.string().uuid().safeParse(applicationId).success)throw new AppError(404,'Application not found in your program.');
 const row=await db.prepare(`SELECT a.id,a.status,a.created_at,a.updated_at,a.affiliate_user_id,
  f.display_name AS name,COALESCE(r.portal,'affiliate') AS portal,
  p.name AS program_name,p.rate_bps,p.window_days,p.active AS program_active
  FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id
  JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id LEFT JOIN account_portals r ON r.user_id=a.affiliate_user_id
  WHERE a.id=? AND w.owner_id=?`).bind(applicationId,user.userId).first<Omit<PartnerReview,'profile'|'accountApproved'|'closed'|'ownershipReady'|'approvalReady'|'channels'>&{affiliate_user_id:string}>();
 if(!row)throw new AppError(404,'Application not found in your program.');
 const [admission,properties,closed]=await Promise.all([getAdmission(db,row.affiliate_user_id),mediaPropertiesFor(db,row.affiliate_user_id),isAccountClosed(db,row.affiliate_user_id)]);
 let profile:Record<string,unknown>={};try{const value=JSON.parse(admission?.profile_json||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))profile=value;}catch{}
 const summary=profileVerificationSummary(properties,profile),accountApproved=admission?.status==='approved';
 const {affiliate_user_id:_,...application}=row;
 const review={...application,profile:partnershipProfile(profile),accountApproved,closed,ownershipReady:summary.ready,
  approvalReady:accountApproved&&!closed&&summary.ready,
  channels:properties.map(p=>({name:p.name,url:p.url,platform:p.platform,kind:p.kind,language:p.language,relationship:p.relationship,
   verified:p.status==='verified'&&!summary.blockers.some(b=>b.id===p.id),status:p.status,verified_at:p.verified_at}))};
 return {review,snapshot:{applicationId:row.id,partnerId:row.affiliate_user_id,applicationStatus:row.status,applicationUpdatedAt:row.updated_at,admissionRevision:admission?.revision||0,properties:properties.map(p=>({id:p.id,revision:p.revision}))}};
}
export async function partnerApplicationReview(db:D1Database,user:Identity,applicationId:string):Promise<PartnerReview>{
 return (await inspectPartnerApplication(db,user,applicationId)).review;
}
export async function assertPartnerReadyForApproval(db:D1Database,user:Identity,input:unknown){
 const parsed=z.object({applicationId:z.string().uuid(),status:z.literal('approved')}).strict().safeParse(input);
 if(!parsed.success)throw new AppError(400,'Choose a valid partner application.');
 const {review,snapshot}=await inspectPartnerApplication(db,user,parsed.data.applicationId);
 if(!review.approvalReady)throw new AppError(409,'This partner must have an open, approved Affimaro account and current channel verification before you can approve the partnership. Open Review application for details.');
 return snapshot;
}
