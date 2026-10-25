import {AppError} from './service.ts';
// Expressions are fixed internal SQL aliases, never request input.
export function recipientIdentityApproved(subject='payout_requests.affiliate_user_id'){
 return `EXISTS(SELECT 1 FROM identity_verifications iv JOIN account_portals ir ON ir.user_id=iv.user_id JOIN platform_applications ia ON ia.user_id=iv.user_id WHERE iv.user_id=${subject} AND iv.status='approved' AND ir.portal IN ('affiliate','creator') AND ia.status='approved' AND NOT EXISTS(SELECT 1 FROM account_closures ic WHERE ic.user_id=iv.user_id) AND NOT EXISTS(SELECT 1 FROM platform_admins ip WHERE ip.user_id=iv.user_id))`;
}
export async function requireRecipientIdentity(db:D1Database,userId:string){const row=await db.prepare(`SELECT ${recipientIdentityApproved('a.id')} AS approved FROM accounts a WHERE a.id=?`).bind(userId).first<{approved:number}>();if(!row?.approved)throw new AppError(403,'The recipient’s identity must be approved by Affimaro before a new payment can be requested, approved or sent.');}
