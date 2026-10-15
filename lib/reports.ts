import {z} from 'zod';
import {AppError,service,type Identity} from './service.ts';
import {effectiveCommission,shopifyHold} from './commission-query.ts';
import {netDisbursed} from './payment-balance.ts';

const day=86_400_000;
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed=new Date(value+'T00:00:00Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
},'Use a valid calendar date.');
const optionalDate=z.preprocess(value=>value===''?undefined:value,date.optional());
const filterSchema=z.object({
  view:z.enum(['business','affiliate']).default('business'),
  range:z.enum(['7d','30d','90d','custom']).default('30d'),
  from:optionalDate,to:optionalDate,
  applicationId:z.preprocess(value=>value===''?undefined:value,z.string().uuid().optional()),
}).strict();
export type ReportFilters={view:'business'|'affiliate';range:'7d'|'30d'|'90d'|'custom';from:string;to:string;until:string;applicationId?:string};
export function parseReportFilters(input:unknown,clock=new Date()):ReportFilters{
  const result=filterSchema.safeParse(input);
  if(!result.success)throw new AppError(400,'Choose a valid report view, date range and partnership.');
  const value=result.data,today=clock.toISOString().slice(0,10);
  let from:string,to:string;
  if(value.range==='custom'){
    if(!value.from||!value.to)throw new AppError(400,'Choose both dates for a custom report.');
    from=value.from;to=value.to;
  }else{
    to=today;from=new Date(Date.parse(today+'T00:00:00Z')-(Number(value.range.slice(0,-1))-1)*day).toISOString().slice(0,10);
  }
  const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
  if(start>end||to>today||end-start>365*day)throw new AppError(400,'Choose up to 366 days, ending today or earlier. Dates use UTC.');
  return {view:value.view,range:value.range,from,to,until:new Date(end+day).toISOString(),...(value.applicationId?{applicationId:value.applicationId}:{})};
}
export function reportSearchParams(params:URLSearchParams){
  const result:Record<string,string|string[]>={};
  for(const key of new Set(params.keys())){const values=params.getAll(key);result[key]=values.length===1?values[0]:values;}
  return result;
}
export function reportQuery(filters:ReportFilters){
  return new URLSearchParams({view:filters.view,range:filters.range,...(filters.range==='custom'?{from:filters.from,to:filters.to}:{}),...(filters.applicationId?{applicationId:filters.applicationId}:{})}).toString();
}

export type ReportMetric={currency:string;decimals:number;orders:number;eligible_orders:number;review_orders:number;net_sales:number;estimated:number;approved:number};
export type ReportPartnership=ReportMetric&{application_id:string;partner_name:string;business_name:string;program_name:string};
export type ReportBalance={currency:string;decimals:number;estimated:number;approved:number;reserved:number;bank_recorded:number;stripe_net:number;stripe_reversed:number;available:number;debt:number;uncovered_reserved:number;processing_requests:number};
export type ReportDay={date:string;orders:number;eligible_orders:number;review_orders:number};
export type ReportOption={application_id:string;partner_name:string;business_name:string;program_name:string;status:string};
export type ReportSource={business_name:string;platform:string|null;active:number|null;last_seen:string|null;synced_through:string|null;sync_in_progress:number};
export type Report={
  filters:ReportFilters;generatedAt:string;businessName:string|null;
  summary:{orders:number;eligible_orders:number;review_orders:number;partnerships:number;last_received_at:string|null};
  metrics:ReportMetric[];daily:ReportDay[];partnerships:ReportPartnership[];balances:ReportBalance[];options:ReportOption[];sources:ReportSource[];
  truncated:{partnerships:boolean;options:boolean;sources:boolean};
};

function safeNumbers(rows:Record<string,unknown>[]){
  for(const row of rows)for(const value of Object.values(row))if(typeof value==='number'&&!Number.isSafeInteger(value))throw new AppError(413,'These totals exceed the exact report limit. Select a smaller report.');
}
export function reports(db:D1Database,identity:Identity){
  const s=service(db,identity);
  return {async get(input:unknown,clock=new Date()):Promise<Report>{
    const filters=parseReportFilters(input,clock),business=filters.view==='business'?await s.workspace():null;
    if(filters.view==='business'&&!business)throw new AppError(404,'Create your business workspace to see its reports.');
    // Only these fixed predicates select a role. IDs and dates are bound values.
    const predicate=filters.view==='business'?'w.owner_id=?':'a.affiliate_user_id=?';
    const prefix=`WITH scope AS (
      SELECT a.id AS application_id,a.affiliate_user_id,a.status,p.name AS program_name,w.id AS workspace_id,w.name AS business_name,COALESCE(f.display_name,'Partner') AS partner_name
      FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id LEFT JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id
      WHERE ${predicate} AND (?='' OR a.id=?)
    ), current_orders AS (
      SELECT o.application_id,o.currency,o.decimals,o.created_at,o.received_at,
        ${effectiveCommission()} AS estimated,MIN(${effectiveCommission()},COALESCE(ca.amount,0)) AS approved,
        CASE WHEN o.commission_state='review' OR ${shopifyHold()} THEN 1 ELSE 0 END AS review,
        CASE WHEN o.commission_state='accrued' AND NOT ${shopifyHold()} THEN 1 ELSE 0 END AS eligible,
        CASE WHEN o.commission_state='accrued' AND NOT ${shopifyHold()} THEN o.basis-o.refunded_basis ELSE 0 END AS net_sales
      FROM orders o JOIN scope a ON a.application_id=o.application_id JOIN store_connections c ON c.id=o.store_id AND c.workspace_id=a.workspace_id
      LEFT JOIN commission_approvals ca ON ca.order_id=o.id
    ), period_orders AS (SELECT * FROM current_orders WHERE created_at>=? AND created_at<?)`;
    const args=[identity.userId,filters.applicationId||'',filters.applicationId||'',filters.from+'T00:00:00.000Z',filters.until];
    const aggregate="COUNT(*) AS orders,COALESCE(SUM(eligible),0) AS eligible_orders,COALESCE(SUM(review),0) AS review_orders,COALESCE(SUM(net_sales),0) AS net_sales,COALESCE(SUM(estimated),0) AS estimated,COALESCE(SUM(approved),0) AS approved";
    const balanceCtes=`, earned AS (
      SELECT application_id,currency,decimals,SUM(estimated) AS estimated,SUM(approved) AS approved FROM current_orders GROUP BY application_id,currency,decimals
    ), booked AS (
      SELECT pr.application_id,pr.currency,pr.decimals,
        SUM(CASE WHEN pr.status IN ('requested','approved','processing') THEN pr.amount ELSE 0 END) AS reserved,
        SUM(CASE WHEN pr.method='bank' AND pr.status='paid' THEN pr.amount ELSE 0 END) AS bank_recorded,
        SUM(CASE WHEN pr.method='stripe' AND pr.status='transferred' THEN ${netDisbursed('pr')} ELSE 0 END) AS stripe_net,
        SUM(CASE WHEN pr.method='stripe' AND pr.status='transferred' THEN pr.reversed_amount ELSE 0 END) AS stripe_reversed,
        SUM(CASE WHEN pr.status='processing' THEN 1 ELSE 0 END) AS processing_requests
      FROM payout_requests pr JOIN scope a ON a.application_id=pr.application_id AND a.workspace_id=pr.workspace_id AND a.affiliate_user_id=pr.affiliate_user_id
      GROUP BY pr.application_id,pr.currency,pr.decimals
    ), balance_keys AS (SELECT application_id,currency,decimals FROM earned UNION SELECT application_id,currency,decimals FROM booked), balances AS (
      SELECT k.*,COALESCE(e.estimated,0) AS estimated,COALESCE(e.approved,0) AS approved,COALESCE(b.reserved,0) AS reserved,
        COALESCE(b.bank_recorded,0) AS bank_recorded,COALESCE(b.stripe_net,0) AS stripe_net,COALESCE(b.stripe_reversed,0) AS stripe_reversed,COALESCE(b.processing_requests,0) AS processing_requests
      FROM balance_keys k LEFT JOIN earned e USING(application_id,currency,decimals) LEFT JOIN booked b USING(application_id,currency,decimals)
    )`;
    const statements=[
      `${prefix} SELECT COUNT(*) AS orders,COALESCE(SUM(eligible),0) AS eligible_orders,COALESCE(SUM(review),0) AS review_orders,COUNT(DISTINCT application_id) AS partnerships,MAX(received_at) AS last_received_at,(SELECT COUNT(*) FROM scope) AS matching_applications FROM period_orders`,
      `${prefix} SELECT currency,decimals,${aggregate} FROM period_orders GROUP BY currency,decimals ORDER BY currency,decimals LIMIT 201`,
      `${prefix} SELECT substr(created_at,1,10) AS date,COUNT(*) AS orders,SUM(eligible) AS eligible_orders,SUM(review) AS review_orders FROM period_orders GROUP BY substr(created_at,1,10) ORDER BY date`,
      `${prefix} SELECT a.application_id,a.partner_name,a.business_name,a.program_name,o.currency,o.decimals,${aggregate} FROM period_orders o JOIN scope a ON a.application_id=o.application_id GROUP BY a.application_id,o.currency,o.decimals ORDER BY orders DESC,a.partner_name,a.business_name,a.application_id,o.currency,o.decimals LIMIT 101`,
      `${prefix}${balanceCtes} SELECT currency,decimals,SUM(estimated) AS estimated,SUM(approved) AS approved,SUM(reserved) AS reserved,SUM(bank_recorded) AS bank_recorded,SUM(stripe_net) AS stripe_net,SUM(stripe_reversed) AS stripe_reversed,SUM(processing_requests) AS processing_requests,
        SUM(MAX(0,approved-bank_recorded-stripe_net-reserved)) AS available,SUM(MAX(0,bank_recorded+stripe_net-approved)) AS debt,SUM(MIN(reserved,MAX(0,bank_recorded+stripe_net+reserved-approved))) AS uncovered_reserved
        FROM balances GROUP BY currency,decimals ORDER BY currency,decimals LIMIT 201`,
      `${prefix} SELECT application_id,partner_name,business_name,program_name,status FROM scope ORDER BY CASE WHEN application_id=? THEN 0 ELSE 1 END,partner_name,business_name,application_id LIMIT 201`,
      `${prefix} SELECT DISTINCT a.workspace_id,a.business_name,c.platform,c.active,c.last_seen,sa.synced_through,CASE WHEN sa.sync_until IS NOT NULL OR sa.lease_until>? THEN 1 ELSE 0 END AS sync_in_progress FROM scope a LEFT JOIN store_connections c ON c.workspace_id=a.workspace_id LEFT JOIN shopify_accounts sa ON sa.store_id=c.id ORDER BY a.business_name,a.workspace_id LIMIT 101`,
    ].map((sql,index)=>db.prepare(sql).bind(...(index===5?[identity.userId,'','',args[3],args[4],filters.applicationId||'']:index===6?[...args,clock.toISOString()]:args)));
    // A read-only D1 batch keeps all report sections on the same database snapshot.
    let result:D1Result<Record<string,unknown>>[];
    try{result=await db.batch<Record<string,unknown>>(statements);}
    catch(error){if(error instanceof RangeError)throw new AppError(413,'These totals exceed the exact report limit. Select a smaller report.');throw error;}
    const rows=result.map(item=>item.results);
    for(const list of rows)safeNumbers(list);
    const summary=rows[0][0] as unknown as Report['summary']&{matching_applications:number};
    if(filters.applicationId&&!summary.matching_applications)throw new AppError(404,'That partnership is not available in this report.');
    if(rows[1].length>200||rows[4].length>200)throw new AppError(413,'This report has too many currency groups. Choose one partnership or a shorter period.');
    const sparse=new Map((rows[2] as unknown as ReportDay[]).map(row=>[row.date,row]));
    const daily:ReportDay[]=[];
    for(let at=Date.parse(filters.from+'T00:00:00Z');at<Date.parse(filters.until);at+=day){const date=new Date(at).toISOString().slice(0,10);daily.push(sparse.get(date)||{date,orders:0,eligible_orders:0,review_orders:0});}
    return {filters,generatedAt:clock.toISOString(),businessName:business?.name||null,
      summary:{orders:summary.orders,eligible_orders:summary.eligible_orders,review_orders:summary.review_orders,partnerships:summary.partnerships,last_received_at:summary.last_received_at},
      metrics:rows[1] as unknown as ReportMetric[],daily,partnerships:rows[3].slice(0,100) as unknown as ReportPartnership[],balances:rows[4] as unknown as ReportBalance[],options:rows[5].slice(0,200) as unknown as ReportOption[],
      sources:rows[6].slice(0,100).map(({workspace_id:_,...row})=>row) as unknown as ReportSource[],
      truncated:{partnerships:rows[3].length>100,options:rows[5].length>200,sources:rows[6].length>100}};
  }};
}

export function reportCsv(report:Report){
  const columns=['section','time_basis','view','period_from_utc','period_through_utc','generated_at_utc','application_id','name','currency','decimals','day_utc','orders','eligible_orders','review_orders','net_sales_minor','estimated_commission_minor','approved_commission_minor','reserved_minor','bank_recorded_minor','stripe_net_minor','stripe_reversed_minor','available_minor','debt_minor','uncovered_reserved_minor','processing_requests','partnership_rows_truncated'];
  const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const lines=[columns.map(cell).join(',')];
  function push(section:string,values:Record<string,unknown>){const row:Record<string,unknown>={section,time_basis:section==='balance'?'all_time_current_balance':'orders_created_in_period_current_snapshot',view:report.filters.view,period_from_utc:report.filters.from,period_through_utc:report.filters.to,generated_at_utc:report.generatedAt,partnership_rows_truncated:report.truncated.partnerships,...values};lines.push(columns.map(key=>cell(row[key])).join(','));}
  const metric=(row:ReportMetric)=>({currency:row.currency,decimals:row.decimals,orders:row.orders,eligible_orders:row.eligible_orders,review_orders:row.review_orders,net_sales_minor:row.net_sales,estimated_commission_minor:row.estimated,approved_commission_minor:row.approved});
  for(const row of report.metrics)push('performance_total',metric(row));
  for(const row of report.daily)push('daily_orders',{day_utc:row.date,orders:row.orders,eligible_orders:row.eligible_orders,review_orders:row.review_orders});
  for(const row of report.partnerships)push('partnership',{...metric(row),application_id:row.application_id,name:report.filters.view==='business'?row.partner_name:row.business_name});
  for(const row of report.balances)push('balance',{currency:row.currency,decimals:row.decimals,estimated_commission_minor:row.estimated,approved_commission_minor:row.approved,reserved_minor:row.reserved,bank_recorded_minor:row.bank_recorded,stripe_net_minor:row.stripe_net,stripe_reversed_minor:row.stripe_reversed,available_minor:row.available,debt_minor:row.debt,uncovered_reserved_minor:row.uncovered_reserved,processing_requests:row.processing_requests});
  return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
