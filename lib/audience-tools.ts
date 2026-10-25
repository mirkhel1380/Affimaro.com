import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requireApprovedAccount} from './admissions.ts';
import {accountPortal} from './portal-policy.ts';
import {activePlan} from './plan-requests.ts';
import {planCatalog} from './pricing-catalog.mjs';
import {creatorPlatforms} from './application-profile.ts';
import {savedPreferences} from './account-settings.ts';
export const clientStatuses=['prospect','active','on_hold','archived'] as const;
export const contentStatuses=['idea','draft','published','archived'] as const;
const page=z.union([z.number().int().min(1).max(10000),z.string().regex(/^[1-9][0-9]{0,4}$/).transform(Number).refine(value=>value<=10000)]).default(1);
const listFields={q:z.string().trim().max(120).default(''),page};
const clientFilters=z.object({...listFields,status:z.enum(['all',...clientStatuses]).default('all')}).strict();
const contentFilters=z.object({...listFields,status:z.enum(['all',...contentStatuses]).default('all'),platform:z.union([z.enum(creatorPlatforms),z.literal('')]).default('')}).strict();
const url=z.string().trim().url().max(500).refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use an HTTPS URL without credentials.'),optionalId=z.string().uuid().optional(),notes=z.string().trim().max(1500).default('');
const updatedAt=z.string().datetime().length(24).optional();
const client=z.object({id:optionalId,updatedAt,name:z.string().trim().min(2).max(100),website:url,contact:z.string().trim().max(150).default(''),status:z.enum(['prospect','active','on_hold','archived']),notes,authorized:z.literal(true)}).strict();
const content=z.object({id:optionalId,updatedAt,title:z.string().trim().min(2).max(150),platform:z.enum(creatorPlatforms),status:z.enum(['idea','draft','published','archived']),applicationId:z.string().uuid().nullable(),url:z.union([url,z.literal('')]),notes}).strict().refine(v=>v.status!=='published'||!!v.url,{message:'Published content needs its public HTTPS URL.'});
export type AgencyClient={id:string;user_id:string;name:string;website:string;contact:string;status:string;notes:string;created_at:string;updated_at:string};
export type CreatorContent={id:string;user_id:string;application_id:string|null;title:string;platform:string;status:string;url:string|null;notes:string;created_at:string;updated_at:string};
const applied=(result:unknown)=>Number((result as {meta?:{changes?:number};changes?:number})?.meta?.changes??(result as {changes?:number})?.changes??0)>0;
// Preserve the accountPortal fallback while checking approval and closure at the write.
const currentOwner=`EXISTS(SELECT 1 FROM platform_applications p WHERE p.user_id=? AND p.status='approved'
 AND COALESCE((SELECT r.portal FROM account_portals r WHERE r.user_id=p.user_id),CASE
 WHEN EXISTS(SELECT 1 FROM workspaces w WHERE w.owner_id=p.user_id) THEN 'brand'
 WHEN EXISTS(SELECT 1 FROM affiliate_profiles f WHERE f.user_id=p.user_id) THEN 'affiliate' ELSE p.portal END)=?
 AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=p.user_id))`;
export function audienceTools(db:D1Database,user:Identity){
 async function role(p:'creator'|'agency'){await requireApprovedAccount(db,user);if(await accountPortal(db,user.userId)!==p)throw new AppError(403,'Open your own account portal.');}
 async function paged<T extends AgencyClient|CreatorContent>(kind:'agency'|'creator',input:unknown){
  await role(kind);const parsed=(kind==='agency'?clientFilters:contentFilters).safeParse(input);
  if(!parsed.success)throw new AppError(400,'Use one supported value for each filter, a search up to 120 characters and a page from 1 to 10000.');
  const v=parsed.data,platform='platform' in v?v.platform:'',table=kind==='agency'?'agency_clients':'creator_content',columns=kind==='agency'?['name','website','contact','notes']:['title','url','notes','platform'],conditions=['user_id=?'],args:unknown[]=[user.userId],size=(await savedPreferences(db,user.userId)).preferences.pageSize;
  if(v.status!=='all'){conditions.push('status=?');args.push(v.status);}
  if(platform){conditions.push('platform=?');args.push(platform);}
  if(v.q){conditions.push('('+columns.map(column=>`instr(lower(COALESCE(${column},'')),lower(?))>0`).join(' OR ')+')');args.push(...columns.map(()=>v.q));}
  const prefix=`WITH matching AS (SELECT * FROM ${table} WHERE ${conditions.join(' AND ')}), stats AS (SELECT count(*) total FROM matching)`;
  const results=await db.batch([
   db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
   db.prepare(`${prefix} SELECT * FROM matching ORDER BY updated_at DESC,id LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(Number(v.page)-1)*size,size,size),
   db.prepare(`SELECT count(*) total,sum(status='active') active,sum(status IN ('idea','draft')) in_progress,sum(status='published') published FROM ${table} WHERE user_id=?`).bind(user.userId)
  ]);
  const total=Number((results[0].results[0] as {total:number}).total),pages=Math.ceil(total/size),currentPage=Math.min(Number(v.page),Math.max(1,pages)),summary=results[2].results[0] as {total:number;active:number;in_progress:number;published:number};
  return {rows:results[1].results as T[],total,pages,page:currentPage,pageSize:size,summary,filters:{q:v.q,status:v.status,platform,page:currentPage}};
 }
 async function editVersion(table:'agency_clients'|'creator_content',id:string,expected:string|undefined,label:string){
  const row=await db.prepare(`SELECT updated_at FROM ${table} WHERE id=? AND user_id=?`).bind(id,user.userId).first<{updated_at:string}>();
  if(!row)throw new AppError(404,label==='Client record'?'Client not found in your directory.':'Content not found in your planner.');
  if(!expected||expected!==row.updated_at)throw conflict(label);
  // An edit must get a different token even when both saves share a clock tick.
  return new Date(Math.max(Date.now(),Date.parse(row.updated_at)+1)).toISOString();
 }
 function conflict(label:string){return new AppError(409,`${label} changed or is no longer editable. Reload the latest record before saving. Your unsaved edits have not been applied.`);}
 return {
 async clientDirectory(input:unknown={}){return paged<AgencyClient>('agency',input);},
 async contentPlanner(input:unknown={}){return paged<CreatorContent>('creator',input);},
 async clients(){await role('agency');return (await db.prepare('SELECT * FROM agency_clients WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 100').bind(user.userId).all<AgencyClient>()).results;},
 async saveClient(input:unknown){
  await role('agency');const parsed=client.safeParse(input);if(!parsed.success)throw new AppError(400,parsed.error.issues[0].message);
  const v=parsed.data,id=v.id||crypto.randomUUID(),at=v.id?await editVersion('agency_clients',id,v.updatedAt,'Client record'):new Date().toISOString();
  if(v.id){
   const result=await db.prepare(`UPDATE agency_clients SET name=?,website=?,contact=?,status=?,notes=?,updated_at=? WHERE id=? AND user_id=? AND updated_at=? AND ${currentOwner}`).bind(v.name,v.website,v.contact,v.status,v.notes,at,id,user.userId,v.updatedAt,user.userId,'agency').run();
   if(!applied(result))throw conflict('Client record');
  }else await db.prepare('INSERT INTO agency_clients (id,user_id,name,website,contact,status,notes,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM agency_clients WHERE user_id=?)<?').bind(id,user.userId,v.name,v.website,v.contact,v.status,v.notes,at,at,user.userId,planCatalog[await activePlan(db,user.userId)].clients).run();
  const saved=await db.prepare('SELECT * FROM agency_clients WHERE id=? AND user_id=?').bind(id,user.userId).first<AgencyClient>();
  if(!saved)throw new AppError(409,'Your client-directory package limit has been reached. Choose a larger package in billing and complete payment.');return saved;
 },
 async content(){await role('creator');return (await db.prepare('SELECT * FROM creator_content WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 250').bind(user.userId).all<CreatorContent>()).results;},
 async saveContent(input:unknown){
  await role('creator');const parsed=content.safeParse(input);if(!parsed.success)throw new AppError(400,parsed.error.issues[0].message);
  const v=parsed.data,id=v.id||crypto.randomUUID();
  if(v.applicationId&&!await db.prepare("SELECT id FROM applications WHERE id=? AND affiliate_user_id=? AND status='approved'").bind(v.applicationId,user.userId).first())throw new AppError(403,'Choose one of your own approved partnerships.');
  const at=v.id?await editVersion('creator_content',id,v.updatedAt,'Content entry'):new Date().toISOString();
  if(v.id){
   const result=await db.prepare(`UPDATE creator_content SET application_id=?,title=?,platform=?,status=?,url=?,notes=?,updated_at=? WHERE id=? AND user_id=? AND updated_at=? AND ${currentOwner} AND (? IS NULL OR EXISTS(SELECT 1 FROM applications a WHERE a.id=? AND a.affiliate_user_id=? AND a.status='approved'))`).bind(v.applicationId,v.title,v.platform,v.status,v.url||null,v.notes,at,id,user.userId,v.updatedAt,user.userId,'creator',v.applicationId,v.applicationId,user.userId).run();
   if(!applied(result))throw conflict('Content entry');
  }else await db.prepare('INSERT INTO creator_content (id,user_id,application_id,title,platform,status,url,notes,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM creator_content WHERE user_id=?)<250').bind(id,user.userId,v.applicationId,v.title,v.platform,v.status,v.url||null,v.notes,at,at,user.userId).run();
  const saved=await db.prepare('SELECT * FROM creator_content WHERE id=? AND user_id=?').bind(id,user.userId).first<CreatorContent>();if(!saved)throw new AppError(409,'Your content planner is full. Edit an existing entry.');return saved;
 }
};}
