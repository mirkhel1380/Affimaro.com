import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {savedPreferences} from './account-settings.ts';
import {trackedOrderColumns} from './commission-query.ts';
import type {TrackedOrder} from './woocommerce.ts';

export const orderStates=['pending','accrued','review','reversed','ineligible'] as const;
export const orderQueryKeys=['q','state','currency','range','page'] as const;
const page=z.union([z.number().int(),z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number)]).pipe(z.number().int().min(1).max(1_000_000));
const schema=z.object({q:z.string().trim().max(100).default(''),state:z.enum(['all',...orderStates]).default('all'),currency:z.string().regex(/^(?:[A-Z]{3})?$/).default(''),range:z.enum(['all','7d','30d','90d']).default('all'),page:page.default(1)}).strict();
export type OrderFilters=z.infer<typeof schema>;
export function parseOrderFilters(input:unknown):OrderFilters{
 const result=schema.safeParse(input);if(!result.success)throw new AppError(400,'Choose a valid order search, commission state, currency, date range and page.');return result.data;
}
export function orderSearchParams(params:URLSearchParams){
 const input:Record<string,string>={};for(const key of new Set(params.keys())){if(!(orderQueryKeys as readonly string[]).includes(key)||params.getAll(key).length!==1)throw new AppError(400,'Use each supported order filter once.');input[key]=params.get(key)!;}return parseOrderFilters(input);
}
export function orderQuery(filters:OrderFilters,page=filters.page){
 const query=new URLSearchParams();if(filters.q)query.set('q',filters.q);if(filters.state!=='all')query.set('state',filters.state);if(filters.currency)query.set('currency',filters.currency);if(filters.range!=='all')query.set('range',filters.range);if(page>1)query.set('page',String(page));return query.toString();
}

export async function orderHistory(db:D1Database,user:Identity,input:unknown={},clock=new Date()){
 if(!user.userId||!user.email)throw new AppError(401,'Sign in to view your orders.');
 const filters=parseOrderFilters(input),portal=await accountPortal(db,user.userId);if(!portal)throw new AppError(403,'Choose your account type before viewing orders.');
 const business=businessPortal(portal),preferences=(await savedPreferences(db,user.userId)).preferences,today=Date.parse(clock.toISOString().slice(0,10)+'T00:00:00Z'),from=filters.range==='all'?'':new Date(today-(Number(filters.range.slice(0,-1))-1)*86400000).toISOString(),until=filters.range==='all'?'':new Date(today+86400000).toISOString();
 // Both role and ownership come from the saved account, never query parameters.
 // Require the order's store to belong to its application program as well.
 const prefix=`WITH visible_orders AS (
  SELECT ${trackedOrderColumns()},w.name AS business_name,COALESCE(f.display_name,'Partner') AS partner_name
  FROM orders o JOIN applications a ON a.id=o.application_id JOIN programs p ON p.id=a.program_id
  JOIN workspaces w ON w.id=p.workspace_id JOIN store_connections c ON c.id=o.store_id AND c.workspace_id=w.id
  LEFT JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id
  WHERE ${business?'w.owner_id=?':'a.affiliate_user_id=?'}
 ), matching AS (
  SELECT * FROM visible_orders WHERE (?='' OR instr(lower(external_id),lower(?))>0 OR instr(lower(${business?'partner_name':'business_name'}),lower(?))>0)
  AND (?='all' OR commission_state=?) AND (?='' OR currency=?) AND (?='' OR (created_at>=? AND created_at<?))
 ), stats AS (SELECT COUNT(*) AS total,COALESCE(SUM(commission_state='review'),0) AS review,COALESCE(SUM(commission_state='accrued'),0) AS accrued FROM matching)`;
 const args=[user.userId,filters.q,filters.q,filters.q,filters.state,filters.state,filters.currency,filters.currency,from,from,until],size=preferences.pageSize;
 const results=await db.batch<Record<string,unknown>>([
  db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
  db.prepare(`${prefix} SELECT * FROM matching ORDER BY received_at DESC,id DESC LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(filters.page-1)*size,size,size),
  db.prepare(`${prefix} SELECT DISTINCT currency FROM visible_orders ORDER BY currency LIMIT 201`).bind(...args),
 ]);
 const summary=results[0].results[0] as unknown as {total:number;review:number;accrued:number},pages=Math.ceil(summary.total/size),currentPage=Math.min(filters.page,Math.max(1,pages)),currencies=results[2].results.map(row=>String(row.currency));
 return {portal,business,preferences,filters:{...filters,page:currentPage},from,until,summary,rows:results[1].results as unknown as TrackedOrder[],pages,pageSize:size,currencies:[...new Set([...currencies.slice(0,200),...(filters.currency?[filters.currency]:[])])].sort(),currenciesTruncated:currencies.length>200};
}
