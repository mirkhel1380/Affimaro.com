import {z} from 'zod';
import {savedPreferences} from './account-settings.ts';
import {AppError,type Identity} from './service.ts';
import {requireApprovedAccount} from './admissions.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {clickPeriod,completeClickDays,type ClickDay} from './click-series.ts';
import {storeReferralLink} from './referral-link.ts';
export {trackedReferralPath} from './referral-link.ts';
const uuid=z.string().uuid();
export function clickMetadata(request:Request){
 const url=new URL(request.url),tag=(name:string)=>{const v=(url.searchParams.get(name)||'').trim();return /^[a-zA-Z0-9_. -]{1,80}$/.test(v)?v:'';};
 let referrerHost='';try{const r=new URL(request.headers.get('referer')||'');if(['https:','http:'].includes(r.protocol)&&!r.username&&!r.password&&r.hostname.length<=253)referrerHost=r.hostname.toLowerCase();}catch{}
 const ua=request.headers.get('user-agent')||'',prefetch=/prefetch|preview/i.test((request.headers.get('sec-purpose')||'')+' '+(request.headers.get('purpose')||'')),bot=/bot\b|crawler|spider|facebookexternalhit|slackbot|twitterbot|discordbot|whatsapp|telegrambot|headless|preview/i.test(ua),country=request.headers.get('cf-ipcountry')||'';
 return {source:tag('utm_source')||referrerHost||'Direct / unknown',medium:tag('utm_medium')||'Unspecified',referrerHost,device:/ipad|tablet/i.test(ua)?'Tablet':/mobile|android|iphone/i.test(ua)?'Mobile':ua?'Desktop':'Unknown',country:/^[A-Z]{2}$/.test(country)&&country!=='XX'?country:'Unknown',record:request.method==='GET'&&!prefetch&&!bot};
}
export async function referralRedirect(db:D1Database,request:Request,applicationId:string){
 if(!uuid.safeParse(applicationId).success)throw new AppError(404,'Referral link not found.');
 const link=await db.prepare("SELECT a.id AS application_id,p.id AS program_id,c.store_url,c.platform FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN store_connections c ON c.workspace_id=w.id WHERE a.id=? AND a.status='approved' AND p.active=1 AND c.active=1 AND c.last_seen IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_closures x WHERE x.user_id IN(a.affiliate_user_id,w.owner_id))").bind(applicationId).first<{application_id:string;program_id:string;store_url:string;platform:string}>();
 if(!link)throw new AppError(404,'This referral link is unavailable.');const destination=new URL(storeReferralLink(link));if(destination.protocol!=='https:'||destination.username||destination.password)throw new AppError(409,'This program’s store address needs review.');
 const metadata=clickMetadata(request);if(metadata.record)try{const at=new Date().toISOString();await db.batch([db.prepare('INSERT INTO link_clicks(id,application_id,source,medium,referrer_host,device,country,clicked_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),applicationId,metadata.source,metadata.medium,metadata.referrerHost,metadata.device,metadata.country,at),db.prepare('DELETE FROM link_clicks WHERE id IN (SELECT id FROM link_clicks WHERE clicked_at<? LIMIT 50)').bind(new Date(Date.now()-90*86400000).toISOString())]);}catch{console.error('Referral click could not be recorded.');}
 return new Response(null,{status:302,headers:{Location:destination.href,'Cache-Control':'private, no-store','Referrer-Policy':'origin','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}
export const clickExportLimit=5000;
const clickFilters=z.object({applicationId:z.union([uuid,z.literal('')]).default(''),days:z.union([z.literal(7),z.literal(30),z.literal(90)]).default(30),page:z.number().int().min(1).max(10000).default(1),q:z.string().trim().max(100).default(''),country:z.union([z.literal(''),z.literal('Unknown'),z.string().regex(/^[A-Z]{2}$/)]).default(''),device:z.enum(['','Mobile','Desktop','Tablet','Unknown']).default('')}).strict();
export type ClickFilters=z.infer<typeof clickFilters>;
export const clickQueryKeys=['application','days','page','q','country','device'] as const;
export function clickSearchParams(params:URLSearchParams):ClickFilters{
 for(const [key] of params)if(!(clickQueryKeys as readonly string[]).includes(key)||params.getAll(key).length>1)throw new AppError(400,'Choose valid click report filters.');
 const number=(key:string,fallback:number)=>{const value=params.get(key);return !value?fallback:/^\d+$/.test(value)?Number(value):NaN;};
 const result=clickFilters.safeParse({applicationId:params.get('application')||'',days:number('days',30),page:number('page',1),q:params.get('q')||'',country:params.get('country')||'',device:params.get('device')||''});
 if(!result.success)throw new AppError(400,'Choose valid click report filters.');return result.data;
}
export function clickQuery(filters:ClickFilters,page=1){const params=new URLSearchParams({days:String(filters.days)});if(filters.applicationId)params.set('application',filters.applicationId);if(filters.q)params.set('q',filters.q);if(filters.country)params.set('country',filters.country);if(filters.device)params.set('device',filters.device);if(page>1)params.set('page',String(page));return params.toString();}
type ClickPartnership={id:string;brand:string;partner:string;status:string};
export type ClickRow={id:string;source:string;medium:string;referrer_host:string;device:string;country:string;clicked_at:string;brand:string;partner:string};
const clickJoins='FROM link_clicks c JOIN applications a ON a.id=c.application_id JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id LEFT JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id';
const partnershipJoins='FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id LEFT JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id';
const partnershipFields="a.id,w.name AS brand,COALESCE(f.display_name,'Partner') AS partner,a.status";
const rowFields="c.id,c.source,c.medium,c.referrer_host,c.device,c.country,c.clicked_at,w.name AS brand,COALESCE(f.display_name,'Partner') AS partner";
async function clickContext(db:D1Database,user:Identity,input:unknown){
 await requireApprovedAccount(db,user);const portal=await accountPortal(db,user.userId);if(!portal)throw new AppError(403,'Complete account setup first.');const parsed=clickFilters.safeParse(input);if(!parsed.success)throw new AppError(400,'Choose a valid click report.');
 const filters=parsed.data,business=businessPortal(portal),scope=business?'w.owner_id=?':'a.affiliate_user_id=?',at=new Date(),period=clickPeriod(filters.days,at);
 const selected=filters.applicationId?await db.prepare(`SELECT ${partnershipFields} ${partnershipJoins} WHERE ${scope} AND a.id=?`).bind(user.userId,filters.applicationId).first<ClickPartnership>():null;
 if(filters.applicationId&&!selected)throw new AppError(403,'Choose a partnership from your own account.');
 const baseWhere=`${scope} AND c.clicked_at>=? AND c.clicked_at<=?${filters.applicationId?' AND a.id=?':''}`,baseArgs:unknown[]=[user.userId,period.start,period.end,...(filters.applicationId?[filters.applicationId]:[])],conditions=[baseWhere],args=[...baseArgs];
 if(filters.q){conditions.push("instr(lower(c.source||' '||c.medium||' '||c.referrer_host),lower(?))>0");args.push(filters.q);}
 if(filters.country){conditions.push('c.country=?');args.push(filters.country);}
 if(filters.device){conditions.push('c.device=?');args.push(filters.device);}
 return {portal,business,filters,scope,at,period,selected,baseWhere,baseArgs,where:conditions.join(' AND '),args};
}
export async function clickReport(db:D1Database,user:Identity,input:unknown={}){
 const context=await clickContext(db,user,input),{portal,business,filters,scope,at,selected,baseWhere,baseArgs,where,args}=context,preferences=(await savedPreferences(db,user.userId)).preferences;
 const available=(await db.prepare(`SELECT ${partnershipFields} ${partnershipJoins} WHERE ${scope} ORDER BY w.name,COALESCE(f.display_name,'Partner'),a.id LIMIT 2001`).bind(user.userId).all<ClickPartnership>()).results,partnerships=available.slice(0,2000);if(selected&&!partnerships.some(p=>p.id===selected.id))partnerships.push(selected);
 // One read-only batch gives cards, graphs, activity and country options the
 // same database snapshot and account scope.
 const reads=await db.batch([
  db.prepare(`SELECT count(*) AS total,max(c.clicked_at) AS latest,sum(c.clicked_at>=?) AS today ${clickJoins} WHERE ${where}`).bind(at.toISOString().slice(0,10)+'T00:00:00.000Z',...args),
  db.prepare(`SELECT c.source,count(*) AS clicks ${clickJoins} WHERE ${where} GROUP BY c.source ORDER BY clicks DESC,c.source LIMIT 25`).bind(...args),
  db.prepare(`SELECT ${rowFields} ${clickJoins} WHERE ${where} ORDER BY c.clicked_at DESC,c.id LIMIT ? OFFSET ?`).bind(...args,preferences.pageSize,(filters.page-1)*preferences.pageSize),
  db.prepare(`SELECT substr(c.clicked_at,1,10) AS date,count(*) AS clicks ${clickJoins} WHERE ${where} GROUP BY substr(c.clicked_at,1,10) ORDER BY date`).bind(...args),
  db.prepare(`SELECT DISTINCT c.country ${clickJoins} WHERE ${baseWhere} ORDER BY c.country LIMIT 256`).bind(...baseArgs),
 ]);
 const totals=(reads[0].results as {total:number;latest:string|null;today:number|null}[])[0],sources=reads[1].results as {source:string;clicks:number}[],rows=reads[2].results as ClickRow[],daily=completeClickDays(reads[3].results as ClickDay[],filters.days,at),countries=(reads[4].results as {country:string}[]).map(r=>r.country).filter(value=>/^(?:[A-Z]{2}|Unknown)$/.test(value));
 return {portal,business,partnerships,partnershipsTruncated:available.length>2000,totals,sources,rows,daily,countries,filters,preferences,pages:Math.ceil(totals.total/preferences.pageSize)};
}
export async function clickExport(db:D1Database,user:Identity,input:unknown={}){
 const {filters,business,where,args}=await clickContext(db,user,input),rows=(await db.prepare(`SELECT ${rowFields} ${clickJoins} WHERE ${where} ORDER BY c.clicked_at DESC,c.id LIMIT ?`).bind(...args,clickExportLimit+1).all<ClickRow>()).results;
 if(rows.length>clickExportLimit)throw new AppError(409,'This download has more than 5,000 clicks. Narrow the date range, partnership, source, country or device filters.');
 const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const columns=['Clicked at (UTC)','Brand',...(business?['Partner']:[]),'Source','Medium','Referrer host','Device','Country'];
 const lines=[columns,...rows.map(row=>[row.clicked_at,row.brand,...(business?[row.partner]:[]),row.source,row.medium,row.referrer_host,row.device,row.country])];
 return {csv:'\ufeff'+lines.map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n',rowCount:rows.length,filters:{...filters,page:1}};
}
