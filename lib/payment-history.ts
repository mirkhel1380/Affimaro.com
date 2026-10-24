import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {savedPreferences} from './account-settings.ts';
import {approvedFor,committedFor} from './payment-balance.ts';
import {sourceReady} from './commission-query.ts';
import {payoutPublicFields,payoutCsv,type Payout} from './payments.ts';

export const paymentHistoryStatuses={all:'All states',open:'Open requests',requested:'Awaiting business review',approved:'Approved · awaiting payment',processing:'Transfer pending',paid:'Recorded bank / Wise payments',transferred:'Stripe transfers · including reversals',partly_reversed:'Partly reversed Stripe transfers',reversed:'Fully reversed Stripe transfers',rejected:'Declined',cancelled:'Cancelled'} as const;
const statuses=['all','open','requested','approved','processing','paid','transferred','partly_reversed','reversed','rejected','cancelled'] as const;
export const paymentHistoryQueryKeys=['q','status','method','currency','range','page','request'] as const;
export const paymentHistoryExportLimit=5000;
const page=z.union([z.number().int(),z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number)]).pipe(z.number().int().min(1).max(1_000_000));
const schema=z.object({q:z.string().trim().max(120).default(''),status:z.enum(statuses).default('all'),method:z.enum(['all','bank','stripe']).default('all'),currency:z.string().regex(/^(?:[A-Z]{3})?$/).default(''),range:z.enum(['all','7d','30d','90d']).default('all'),page:page.default(1),requestId:z.preprocess(v=>v===''?undefined:v,z.string().uuid().optional())}).strict();
export type PaymentHistoryFilters=z.infer<typeof schema>;
export function parsePaymentHistoryFilters(input:unknown):PaymentHistoryFilters{const result=schema.safeParse(input);if(!result.success)throw new AppError(400,'Choose valid payment request filters. Use each filter once.');return result.data;}
export function paymentHistorySearchParams(params:URLSearchParams,selection=true){
 const input:Record<string,string>={};for(const key of new Set(params.keys())){if(!(paymentHistoryQueryKeys as readonly string[]).includes(key)||(!selection&&key==='request')||params.getAll(key).length!==1)throw new AppError(400,'Use each supported payment history filter once.');input[key==='request'?'requestId':key]=params.get(key)!;}return parsePaymentHistoryFilters(input);
}
export function paymentHistoryQuery(filters:PaymentHistoryFilters,changes:Partial<PaymentHistoryFilters>={}){
 const v={...filters,...changes},q=new URLSearchParams();if(v.q)q.set('q',v.q);if(v.status!=='all')q.set('status',v.status);if(v.method!=='all')q.set('method',v.method);if(v.currency)q.set('currency',v.currency);if(v.range!=='all')q.set('range',v.range);if(v.page>1)q.set('page',String(v.page));if(v.requestId)q.set('request',v.requestId);return q.toString();
}
async function context(db:D1Database,user:Identity,input:unknown,clock:Date){
 if(!user.userId||!user.email)throw new AppError(401,'Sign in to view payment records.');const filters=parsePaymentHistoryFilters(input),portal=await accountPortal(db,user.userId);if(!portal)throw new AppError(403,'Complete your account setup first.');const business=businessPortal(portal),today=Date.parse(clock.toISOString().slice(0,10)+'T00:00:00Z'),from=filters.range==='all'?'':new Date(today-(Number(filters.range.slice(0,-1))-1)*86400000).toISOString(),until=filters.range==='all'?'':new Date(today+86400000).toISOString();
 const status=filters.status==='all'?'1=1':filters.status==='open'?"status IN ('requested','approved','processing')":filters.status==='partly_reversed'?"status='transferred' AND reversed_amount>0 AND reversed_amount<amount":filters.status==='reversed'?"status='transferred' AND reversed_amount>=amount":'status=?';
 const prefix=`WITH visible AS (
  SELECT ${payoutPublicFields.split(',').map(f=>'pr.'+f).join(',')},w.name AS business_name,COALESCE(f.display_name,'Partner') AS partner_name
  FROM payout_requests pr JOIN applications a ON a.id=pr.application_id AND a.affiliate_user_id=pr.affiliate_user_id
  JOIN programs p ON p.id=a.program_id AND p.workspace_id=pr.workspace_id JOIN workspaces w ON w.id=pr.workspace_id
  LEFT JOIN affiliate_profiles f ON f.user_id=pr.affiliate_user_id WHERE ${business?'w.owner_id=?':'pr.affiliate_user_id=?'}
 ), matching AS (SELECT * FROM visible WHERE (?='' OR instr(lower(id),lower(?))>0 OR instr(lower(${business?'partner_name':'business_name'}),lower(?))>0)
  AND (${status}) AND (?='all' OR method=?) AND (?='' OR currency=?) AND (?='' OR (created_at>=? AND created_at<?))
 ), stats AS (SELECT COUNT(*) AS total,COALESCE(SUM(status IN ('requested','approved','processing')),0) AS open FROM matching)`;
 const args=[user.userId,filters.q,filters.q,filters.q,...(status==='status=?'?[filters.status]:[]),filters.method,filters.method,filters.currency,filters.currency,from,from,until];
 // Existing financial eligibility is evaluated only for visible page/detail rows.
 const controls=business?`,CASE WHEN ${approvedFor('pr.application_id','pr.currency','pr.decimals')}>=${committedFor('pr.application_id','pr.currency','pr.decimals')} THEN 1 ELSE 0 END AS covered,CASE WHEN ${sourceReady('pr.application_id')} THEN 1 ELSE 0 END AS sync_ready`:'';
 return {filters,portal,business,from,until,prefix,args,controls};
}
export async function paymentHistory(db:D1Database,user:Identity,input:unknown={},clock=new Date()){
 const c=await context(db,user,input,clock),{filters,prefix,args,controls}=c,preferences=(await savedPreferences(db,user.userId)).preferences,size=preferences.pageSize;
 const result=await db.batch<Record<string,unknown>>([
  db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
  db.prepare(`${prefix} SELECT pr.*${controls} FROM matching pr ORDER BY pr.created_at DESC,pr.id DESC LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(filters.page-1)*size,size,size),
  db.prepare(`${prefix} SELECT pr.*${controls},EXISTS(SELECT 1 FROM matching m WHERE m.id=pr.id) AS matches_filters FROM visible pr WHERE pr.id=?`).bind(...args,filters.requestId||''),
  db.prepare(`${prefix} SELECT DISTINCT currency FROM visible ORDER BY currency LIMIT 201`).bind(...args),
 ]);
 const selected=result[2].results[0];if(filters.requestId&&!selected)throw new AppError(404,'Payment request not found in your portal.');const {matches_filters:matches,...request}=selected||{},summary=result[0].results[0] as unknown as {total:number;open:number},pages=Math.ceil(summary.total/size),actualPage=Math.min(filters.page,Math.max(1,pages)),currencies=result[3].results.map(r=>String(r.currency));
 return {portal:c.portal,business:c.business,preferences,filters:{...filters,page:actualPage},summary:{...summary,closed:summary.total-summary.open},pages,pageSize:size,rows:result[1].results as unknown as Payout[],selected:selected?request as unknown as Payout:null,selectedMatchesFilters:!!matches,currencies:[...new Set([...currencies.slice(0,200),...(filters.currency?[filters.currency]:[])])].sort(),currenciesTruncated:currencies.length>200};
}
export async function paymentHistoryExport(db:D1Database,user:Identity,input:unknown={},clock=new Date()){
 const {filters,prefix,args}=await context(db,user,input,clock);if(filters.requestId)throw new AppError(400,'Export the matching history without a selected request.');const rows=(await db.prepare(`${prefix} SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...args,paymentHistoryExportLimit+1).all<Payout>()).results;if(rows.length>paymentHistoryExportLimit)throw new AppError(409,'This export exceeds 5,000 requests. Narrow the date, status, method, currency or search filters.');return {filters,rowCount:rows.length,csv:payoutCsv(rows)};
}
