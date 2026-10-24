import {requirePlatformAdmin} from './admissions.ts';
import {AppError,type Identity} from './service.ts';
import type {MediaProperty} from './media-properties.ts';
import {z} from 'zod';
import {portals,type Portal} from './portal-policy.ts';

export const ownershipStatuses=['all','review_pending','verified','changes_requested','unverified','revoked'] as const;
export const ownershipQueuePageSize=25;
const page=z.union([z.number().int(),z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number)]).pipe(z.number().int().min(1).max(1_000_000));
const schema=z.object({applicant:z.union([z.literal(''),z.string().trim().min(1).max(200)]).default(''),status:z.enum(ownershipStatuses).optional(),portal:z.preprocess(v=>v===''?undefined:v,z.enum(portals).optional()),q:z.string().trim().max(120).default(''),page:page.default(1)}).strict();
export type OwnershipQueueFilters={applicant:string;status:typeof ownershipStatuses[number];portal?:Portal;q:string;page:number};
export function parseOwnershipQueueFilters(input:unknown):OwnershipQueueFilters{
 const value=schema.safeParse(input);if(!value.success)throw new AppError(400,'Choose a valid applicant, account type, property status, search and page. Use each filter once.');return {...value.data,status:value.data.status||(value.data.applicant?'all':'review_pending')};
}
export function ownershipReviewPath(applicant='',status='all'){
 const query=new URLSearchParams({status});if(applicant)query.set('applicant',applicant);
 return '/owner/verifications?'+query;
}
export function ownershipQueuePath(filters:OwnershipQueueFilters,changes:Partial<OwnershipQueueFilters>={}){
 const value={...filters,...changes},query=new URLSearchParams({status:value.status});if(value.applicant)query.set('applicant',value.applicant);if(value.portal)query.set('portal',value.portal);if(value.q)query.set('q',value.q);if(value.page>1)query.set('page',String(value.page));return '/owner/verifications?'+query;
}
export function applicationReviewPath(applicant:string){return '/owner/applications?'+new URLSearchParams({applicant});}
export async function ownershipReviewQueue(db:D1Database,owner:Identity,input:unknown={}){
 await requirePlatformAdmin(db,owner);
 const filters=parseOwnershipQueueFilters(input),{applicant,status,portal,q}=filters,size=ownershipQueuePageSize;
 // Exact saved account types override the earlier brand/affiliate families.
 const prefix=`WITH visible AS (
  SELECT p.*,a.display_name,a.email,COALESCE(r.portal,CASE WHEN EXISTS(SELECT 1 FROM workspaces w WHERE w.owner_id=a.id) THEN 'brand' WHEN EXISTS(SELECT 1 FROM affiliate_profiles f WHERE f.user_id=a.id) THEN 'affiliate' ELSE app.portal END) AS portal
  FROM media_properties p JOIN accounts a ON a.id=p.user_id LEFT JOIN account_portals r ON r.user_id=a.id LEFT JOIN platform_applications app ON app.user_id=a.id
  WHERE p.archived=0 AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=p.user_id)
 ), scope AS (SELECT * FROM visible WHERE (?='' OR user_id=?) AND (?='' OR portal=?) AND (?='' OR instr(lower(name),lower(?))>0 OR instr(lower(url),lower(?))>0 OR instr(lower(platform),lower(?))>0 OR instr(lower(display_name),lower(?))>0 OR instr(lower(email),lower(?))>0)), matching AS (SELECT * FROM scope WHERE (?='all' OR status=?)), stats AS (SELECT COUNT(*) AS total FROM matching)`;
 const args=[applicant,applicant,portal||'',portal||'',q,q,q,q,q,q,status,status];
 // Counts, page records and selected-applicant availability share one snapshot.
 const result=await db.batch<Record<string,unknown>>([
  db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
  db.prepare(`${prefix} SELECT * FROM matching ORDER BY updated_at,id LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(filters.page-1)*size,size,size),
  db.prepare(`${prefix} SELECT status,COUNT(*) AS total FROM scope GROUP BY status`).bind(...args),
  db.prepare('SELECT id,display_name,email FROM accounts WHERE id=? AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=accounts.id)').bind(applicant),
 ]);
 const account=(result[3].results[0] as {id:string;display_name:string;email:string}|undefined)||null;
 if(applicant&&!account)throw new AppError(404,'This applicant is not available.');
 const total=Number(result[0].results[0].total),pages=Math.ceil(total/size),currentPage=Math.min(filters.page,Math.max(1,pages));
 return {applicant,account,status,portal,q,total,pages,page:currentPage,pageSize:size,filters:{...filters,page:currentPage},statusCounts:result[2].results as unknown as {status:MediaProperty['status'];total:number}[],properties:result[1].results as unknown as (MediaProperty&{display_name:string;email:string;portal:Portal|null})[]};
}
