import {requirePlatformAdmin} from './admissions.ts';
import {AppError,type Identity} from './service.ts';
import type {MediaProperty} from './media-properties.ts';

export const ownershipStatuses=['all','review_pending','verified','changes_requested','unverified','revoked'] as const;
export function ownershipReviewPath(applicant='',status='all'){
 const query=new URLSearchParams({status});if(applicant)query.set('applicant',applicant);
 return '/owner/verifications?'+query;
}
export function applicationReviewPath(applicant:string){return '/owner/applications?'+new URLSearchParams({applicant});}
export async function ownershipReviewQueue(db:D1Database,owner:Identity,input:{applicant?:string;status?:string}={}){
 await requirePlatformAdmin(db,owner);
 if(input.applicant!==undefined&&typeof input.applicant!=='string')throw new AppError(400,'Choose a valid applicant.');
 const applicant=(input.applicant||'').trim();if(applicant.length>200)throw new AppError(400,'Choose a valid applicant.');
 const status=ownershipStatuses.includes(input.status as typeof ownershipStatuses[number])?input.status!:applicant?'all':'review_pending';
 const account=applicant?await db.prepare('SELECT id,display_name,email FROM accounts WHERE id=? AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=accounts.id)').bind(applicant).first<{id:string;display_name:string;email:string}>():null;
 if(applicant&&!account)throw new AppError(404,'This applicant is not available.');
 const rows=(await db.prepare("SELECT p.*,a.display_name,a.email FROM media_properties p JOIN accounts a ON a.id=p.user_id WHERE p.archived=0 AND (?='all' OR p.status=?) AND (?='' OR p.user_id=?) AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=p.user_id) ORDER BY p.updated_at,p.id LIMIT 101").bind(status,status,applicant,applicant).all<MediaProperty&{display_name:string;email:string}>()).results;
 return {applicant,account,status,properties:rows.slice(0,100),truncated:rows.length>100};
}
