import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {savedPreferences} from './account-settings.ts';
import {effectiveCommission,shopifyHold,sourceReady} from './commission-query.ts';
import type {ApprovalOrder} from './payments.ts';

export const commissionReviewStates={all:'All review states',awaiting:'Awaiting approval',sync_needed:'Store sync needed',source_review:'Needs source review',approved:'Approved',pending:'Pending order',reversed:'Reversed',ineligible:'Ineligible',no_commission:'No payable commission'} as const;
const states=['all','awaiting','sync_needed','source_review','approved','pending','reversed','ineligible','no_commission'] as const;
export const commissionReviewQueryKeys=['q','state','currency','range','page','order'] as const;
const page=z.union([z.number().int(),z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number)]).pipe(z.number().int().min(1).max(1_000_000));
const schema=z.object({q:z.string().trim().max(100).default(''),state:z.enum(states).default('all'),currency:z.string().regex(/^(?:[A-Z]{3})?$/).default(''),range:z.enum(['all','7d','30d','90d']).default('all'),page:page.default(1),orderId:z.preprocess(v=>v===''?undefined:v,z.string().uuid().optional())}).strict();
export type CommissionReviewFilters=z.infer<typeof schema>;
export type CommissionReviewOrder=ApprovalOrder&{received_at:string;approved_at:string|null;review_status:Exclude<typeof states[number],'all'>};
export function parseCommissionReviewFilters(input:unknown):CommissionReviewFilters{const r=schema.safeParse(input);if(!r.success)throw new AppError(400,'Choose valid commission review filters. Use each filter once.');return r.data;}
export function commissionReviewSearchParams(params:URLSearchParams){const input:Record<string,string>={};for(const key of new Set(params.keys())){if(!(commissionReviewQueryKeys as readonly string[]).includes(key)||params.getAll(key).length!==1)throw new AppError(400,'Use each supported commission review filter once.');input[key==='order'?'orderId':key]=params.get(key)!;}return parseCommissionReviewFilters(input);}
export function commissionReviewQuery(filters:CommissionReviewFilters,changes:Partial<CommissionReviewFilters>={}){const v={...filters,...changes},q=new URLSearchParams();if(v.q)q.set('q',v.q);if(v.state!=='all')q.set('state',v.state);if(v.currency)q.set('currency',v.currency);if(v.range!=='all')q.set('range',v.range);if(v.page>1)q.set('page',String(v.page));if(v.orderId)q.set('order',v.orderId);return q.toString();}

export async function commissionReview(db:D1Database,user:Identity,input:unknown={},clock=new Date()){
 if(!user.userId||!user.email)throw new AppError(401,'Sign in to review commission.');const filters=parseCommissionReviewFilters(input),portal=await accountPortal(db,user.userId);if(!portal||!businessPortal(portal))throw new AppError(403,'Commission approval belongs to your business account.');
 const preferences=(await savedPreferences(db,user.userId)).preferences,size=preferences.pageSize,today=Date.parse(clock.toISOString().slice(0,10)+'T00:00:00Z'),from=filters.range==='all'?'':new Date(today-(Number(filters.range.slice(0,-1))-1)*86400000).toISOString(),until=filters.range==='all'?'':new Date(today+86400000).toISOString();
 // Read the same effective commission, approval coverage and source readiness as
 // the existing payment dashboard. Authority is the saved business owner only.
 const prefix=`WITH visible AS (
  SELECT o.id,o.external_id,o.application_id,o.currency,o.decimals,${effectiveCommission()} AS commission,o.revision,
   CASE WHEN ${shopifyHold()} THEN 'review' ELSE o.commission_state END AS commission_state,o.created_at,o.received_at,
   CASE WHEN ${sourceReady('o.application_id')} THEN 1 ELSE 0 END AS sync_ready,
   MIN(${effectiveCommission()},COALESCE(ca.amount,0)) AS approved_amount,ca.revision AS approved_revision,ca.approved_at,
   COALESCE(f.display_name,'Partner') AS partner_name
  FROM orders o JOIN applications a ON a.id=o.application_id JOIN programs p ON p.id=a.program_id
  JOIN workspaces w ON w.id=p.workspace_id JOIN store_connections c ON c.id=o.store_id AND c.workspace_id=w.id
  LEFT JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id LEFT JOIN commission_approvals ca ON ca.order_id=o.id WHERE w.owner_id=?
 ), classified AS (
  SELECT *,CASE WHEN commission_state='review' THEN 'source_review' WHEN commission_state<>'accrued' THEN commission_state
   WHEN commission<=0 THEN 'no_commission' WHEN commission<=approved_amount THEN 'approved'
   WHEN sync_ready=0 THEN 'sync_needed' ELSE 'awaiting' END AS review_status FROM visible
 ), scoped AS (
  SELECT * FROM classified WHERE (?='' OR instr(lower(external_id),lower(?))>0 OR instr(lower(partner_name),lower(?))>0 OR instr(lower(id),lower(?))>0)
   AND (?='' OR currency=?) AND (?='' OR (created_at>=? AND created_at<?))
 ), matching AS (SELECT * FROM scoped WHERE (?='all' OR review_status=?)),
 stats AS (SELECT COUNT(*) AS total,COALESCE(SUM(review_status='awaiting'),0) AS awaiting,COALESCE(SUM(review_status IN ('source_review','sync_needed')),0) AS blocked FROM matching)`;
 const args=[user.userId,filters.q,filters.q,filters.q,filters.q,filters.currency,filters.currency,from,from,until,filters.state,filters.state];
 const result=await db.batch<Record<string,unknown>>([
  db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
  db.prepare(`${prefix} SELECT * FROM matching ORDER BY CASE review_status WHEN 'awaiting' THEN 0 WHEN 'sync_needed' THEN 1 WHEN 'source_review' THEN 2 ELSE 3 END,received_at DESC,id DESC LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(filters.page-1)*size,size,size),
  db.prepare(`${prefix} SELECT *,EXISTS(SELECT 1 FROM matching m WHERE m.id=classified.id) AS matches_filters FROM classified WHERE id=?`).bind(...args,filters.orderId||''),
  db.prepare(`${prefix} SELECT review_status,COUNT(*) AS total FROM scoped GROUP BY review_status`).bind(...args),
  db.prepare(`${prefix} SELECT DISTINCT currency FROM visible ORDER BY currency LIMIT 201`).bind(...args),
 ]);
 const selected=result[2].results[0];if(filters.orderId&&!selected)throw new AppError(404,'Order not found in your business commission queue.');const {matches_filters:matches,...order}=selected||{},summary=result[0].results[0] as unknown as {total:number;awaiting:number;blocked:number},pages=Math.ceil(summary.total/size),actualPage=Math.min(filters.page,Math.max(1,pages)),currencies=result[4].results.map(r=>String(r.currency)),counts=Object.fromEntries(states.map(s=>[s,0])) as Record<typeof states[number],number>;
 for(const row of result[3].results){counts[row.review_status as keyof typeof counts]=Number(row.total);counts.all+=Number(row.total);}
 return {portal,preferences,filters:{...filters,page:actualPage},summary,pages,pageSize:size,rows:result[1].results as unknown as CommissionReviewOrder[],selected:selected?order as unknown as CommissionReviewOrder:null,selectedMatchesFilters:!!matches,counts,currencies:[...new Set([...currencies.slice(0,200),...(filters.currency?[filters.currency]:[])])].sort(),currenciesTruncated:currencies.length>200};
}
