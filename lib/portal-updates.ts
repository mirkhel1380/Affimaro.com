import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requireApprovedAccount,isPlatformAdmin} from './admissions.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {savedPreferences} from './account-settings.ts';
import type {PortalUpdate} from './portal-updates-model.ts';

const page=z.union([z.number().int(),z.string().regex(/^[1-9][0-9]{0,5}$/).transform(Number)]).pipe(z.number().int().min(1).max(100000));
const schema=z.object({category:z.enum(['all','applications','invitations','payments']).default('all'),range:z.enum(['all','7d','30d','90d']).default('30d'),q:z.string().trim().max(100).default(''),page:page.default(1)}).strict();
export type UpdateFilters=z.infer<typeof schema>;
export function parseUpdateFilters(raw:unknown){const r=schema.safeParse(raw);if(!r.success)throw new AppError(400,'Choose valid update filters and use each filter once.');return r.data;}
export function updatesQuery(filters:UpdateFilters,change:Partial<UpdateFilters>={}){const v={...filters,...change},q=new URLSearchParams();if(v.category!=='all')q.set('category',v.category);if(v.range!=='30d')q.set('range',v.range);if(v.q)q.set('q',v.q);if(v.page>1)q.set('page',String(v.page));return q.toString();}
export async function portalUpdates(db:D1Database,user:Identity,input:unknown={},clock=new Date()){
 await requireApprovedAccount(db,user);if(await isPlatformAdmin(db,user.userId))throw new AppError(403,'Use your separate owner control panel.');const portal=await accountPortal(db,user.userId);if(!portal)throw new AppError(403,'Complete your account setup first.');
 const filters=parseUpdateFilters(input),business=businessPortal(portal),preferences=(await savedPreferences(db,user.userId)).preferences,size=preferences.pageSize,today=Date.parse(clock.toISOString().slice(0,10)+'T00:00:00.000Z'),from=filters.range==='all'?'':new Date(today-(Number(filters.range.slice(0,-1))-1)*86400000).toISOString(),until=filters.range==='all'?'':new Date(today+86400000).toISOString();
 // Explicit projections only: no credentials, bank destinations, reviewer notes,
 // invitation text, contact details or unscoped workspace audit feed.
 const prefix=`WITH updates AS (
  SELECT a.id,'applications' AS category,${business?'f.display_name':'w.name'} AS name,p.name AS program,p.id AS program_id,a.status,a.created_at,a.updated_at,NULL AS application_status,0 AS superseded,p.active AS program_active,
   EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=${business?'a.affiliate_user_id':'w.owner_id'}) AS counterparty_closed,NULL AS amount,NULL AS currency,NULL AS decimals,NULL AS method,NULL AS reversed_amount
  FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id WHERE ${business?'w.owner_id':'a.affiliate_user_id'}=?
  UNION ALL
  SELECT i.id,'invitations',${business?'f.display_name':'w.name'},p.name,p.id,i.status,i.created_at,i.updated_at,ap.status,
   CASE WHEN i.status='pending' AND ap.status IN ('rejected','suspended') AND ap.updated_at>=i.created_at THEN 1 ELSE 0 END,p.active,
   EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=${business?'i.recipient_id':'i.sender_id'}),NULL,NULL,NULL,NULL,NULL
  FROM discovery_invitations i JOIN programs p ON p.id=i.program_id JOIN workspaces w ON w.id=p.workspace_id AND w.owner_id=i.sender_id JOIN affiliate_profiles f ON f.user_id=i.recipient_id LEFT JOIN applications ap ON ap.program_id=i.program_id AND ap.affiliate_user_id=i.recipient_id WHERE ${business?'i.sender_id':'i.recipient_id'}=?
  UNION ALL
  SELECT r.id,'payments',${business?'f.display_name':'w.name'},p.name,p.id,r.status,r.created_at,r.updated_at,a.status,0,p.active,
   EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=${business?'r.affiliate_user_id':'w.owner_id'}),r.amount,r.currency,r.decimals,r.method,r.reversed_amount
  FROM payout_requests r JOIN applications a ON a.id=r.application_id AND a.affiliate_user_id=r.affiliate_user_id JOIN programs p ON p.id=a.program_id AND p.workspace_id=r.workspace_id JOIN workspaces w ON w.id=r.workspace_id JOIN affiliate_profiles f ON f.user_id=r.affiliate_user_id WHERE ${business?'w.owner_id':'r.affiliate_user_id'}=?
 ), matching AS (SELECT * FROM updates WHERE (?='all' OR category=?) AND (?='' OR instr(lower(name||' '||program),lower(?))>0) AND (?='' OR (updated_at>=? AND updated_at<?))), stats AS (SELECT count(*) AS total,COALESCE(sum(category='applications'),0) AS applications,COALESCE(sum(category='invitations'),0) AS invitations,COALESCE(sum(category='payments'),0) AS payments FROM matching)`;
 const args=[user.userId,user.userId,user.userId,filters.category,filters.category,filters.q,filters.q,from,from,until],result=await db.batch([
  db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
  db.prepare(`${prefix} SELECT * FROM matching ORDER BY updated_at DESC,category,id DESC LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(filters.page-1)*size,size,size),
 ]),summary=result[0].results[0] as unknown as {total:number;applications:number;invitations:number;payments:number},pages=Math.ceil(summary.total/size),actual=Math.min(filters.page,Math.max(1,pages));
 return {portal,preferences,filters:{...filters,page:actual},summary,pages,pageSize:size,rows:result[1].results as unknown as PortalUpdate[]};
}
