import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requireApprovedAccount} from './admissions.ts';
import {accountPortal,businessPortal,type Portal} from './portal-policy.ts';
export const relationshipTabs=['all','approved','pending','invitations','rejected','suspended'] as const;
export type RelationshipTab=typeof relationshipTabs[number];
export const relationshipsPath=(p:Portal)=>({brand:'/workspace/partners',agency:'/agency/partners',affiliate:'/partner/brands',creator:'/creator/brands'})[p];
export type Relationship={id:string;program_id:string;name:string;program_name:string;target_id:string;target_portal:Portal;status:string;rate_bps:number;window_days:number;program_active:number;target_closed:number;created_at:string;updated_at:string};
export type ProgramInvitation={id:string;sender_id:string;recipient_id:string;program_id:string;note:string;status:string;created_at:string;brand_name:string;partner_name:string;program_name:string;rate_bps:number;window_days:number;target_closed:number};
export async function relationshipWorkspace(db:D1Database,user:Identity,input:unknown={}){
 await requireApprovedAccount(db,user);const portal=await accountPortal(db,user.userId);if(!portal)throw new AppError(403,'Complete your account setup first.');
 const parsed=z.object({tab:z.enum(relationshipTabs).default('all'),q:z.string().trim().max(100).default(''),type:z.enum(['all','brand','agency','affiliate','creator']).default('all'),invitationStatus:z.enum(['all','pending','accepted','declined','withdrawn']).default('pending'),page:z.number().int().min(1).max(10000).default(1)}).strict().safeParse(input);if(!parsed.success)throw new AppError(400,'Choose valid partnership filters.');const v=parsed.data,business=businessPortal(portal);
 const targetRole=business?"COALESCE(r.portal,'affiliate')":"COALESCE(r.portal,'brand')",targetId=business?'a.affiliate_user_id':'w.owner_id',name=business?'f.display_name':'w.name',joins=`FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id LEFT JOIN account_portals r ON r.user_id=${targetId}`,scope=business?'w.owner_id=?':'a.affiliate_user_id=?';
 const counts=(await db.prepare(`SELECT a.status,count(*) AS total ${joins} WHERE ${scope} GROUP BY a.status`).bind(user.userId).all<{status:string;total:number}>()).results;
 const invitationScope=business?'i.sender_id=?':'i.recipient_id=?',invitationJoins='FROM discovery_invitations i JOIN programs p ON p.id=i.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN affiliate_profiles f ON f.user_id=i.recipient_id',invitationCounts=(await db.prepare(`SELECT i.status,count(*) AS total ${invitationJoins} WHERE ${invitationScope} GROUP BY i.status`).bind(user.userId).all<{status:string;total:number}>()).results;
 const conditions=[v.tab==='invitations'?invitationScope:scope],args:unknown[]=[user.userId];
 if(v.q){conditions.push(v.tab==='invitations'?"instr(lower(w.name||' '||p.name||' '||f.display_name),lower(?))>0":`instr(lower(${name}||' '||p.name),lower(?))>0`);args.push(v.q);}
 if(v.tab==='invitations'&&v.invitationStatus!=='all'){conditions.push('i.status=?');args.push(v.invitationStatus);}else if(v.tab!=='invitations'&&v.tab!=='all'){conditions.push('a.status=?');args.push(v.tab);}
 if(v.tab!=='invitations'&&v.type!=='all'){conditions.push(`${targetRole}=?`);args.push(v.type);}
 const queryJoins=v.tab==='invitations'?invitationJoins:joins,where=conditions.join(' AND '),total=(await db.prepare(`SELECT count(*) n ${queryJoins} WHERE ${where}`).bind(...args).first<{n:number}>())?.n||0;
 let rows:Relationship[]=[],invitations:ProgramInvitation[]=[];
 if(v.tab==='invitations')invitations=(await db.prepare(`SELECT i.id,i.sender_id,i.recipient_id,i.program_id,i.note,i.status,i.created_at,w.name AS brand_name,f.display_name AS partner_name,p.name AS program_name,p.rate_bps,p.window_days,EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id IN(i.sender_id,i.recipient_id)) AS target_closed ${invitationJoins} WHERE ${where} ORDER BY i.created_at DESC,i.id LIMIT 12 OFFSET ?`).bind(...args,(v.page-1)*12).all<ProgramInvitation>()).results;
 else rows=(await db.prepare(`SELECT a.id,a.program_id,${name} AS name,p.name AS program_name,${targetId} AS target_id,${targetRole} AS target_portal,a.status,p.rate_bps,p.window_days,p.active AS program_active,EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=${targetId}) AS target_closed,a.created_at,a.updated_at ${joins} WHERE ${where} ORDER BY a.updated_at DESC,a.id LIMIT 12 OFFSET ?`).bind(...args,(v.page-1)*12).all<Relationship>()).results;
 return {portal,business,rows,invitations,counts,invitationCounts,total,page:v.page,pages:Math.ceil(total/12),filters:v};
}
