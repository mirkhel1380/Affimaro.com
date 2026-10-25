import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requirePlatformAdmin} from './admissions.ts';
import {assertAccountOpen} from './account-state.ts';

const topic=z.enum(['general','account','integration','billing','partnership']);
const status=z.enum(['new','in_progress','closed']);
export type ContactStatus=z.infer<typeof status>;
const submission=z.object({
 id:z.string().uuid().optional(),name:z.string().trim().min(2).max(100).regex(/^[^\u0000-\u001f\u007f]+$/,'Use a name without control characters.'),
 email:z.string().trim().max(254).email().transform(value=>value.toLowerCase()),topic,
 message:z.string().trim().min(20).max(4000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+$/,'Remove control characters from the message.'),fax:z.string().trim().max(200).default(''),
}).strict();
function parse<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>{const result=schema.safeParse(input);if(!result.success)throw new AppError(400,result.error.issues[0]?.message||'Check your message.');return result.data;}
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const changed=(result:unknown)=>Number((result as {meta?:{changes?:number};changes?:number})?.meta?.changes??(result as {changes?:number})?.changes??0)>0;

// This route records a private support message. It never sends an email.
export async function submitContact(db:D1Database,input:unknown,network:string|null,at=Date.now()){
 const value=parse(submission,input),id=value.id||crypto.randomUUID();
 if(value.fax)return {reference:id};
 if(network!==null&&(typeof network!=='string'||network.length>128||/[\u0000-\u001f\u007f]/.test(network)))throw new AppError(400,'The contact request could not be verified.');
 if(!Number.isFinite(at)||!Number.isFinite(new Date(at).getTime()))throw new AppError(400,'The contact request could not be verified.');
 const created=new Date(at).toISOString(),since=new Date(at-15*60*1000).toISOString();
 const [emailHash,networkHash,payloadHash]=await Promise.all([digest('contact-email\n'+value.email),network?.trim()?digest('contact-network\n'+network.trim()):Promise.resolve(''),digest(JSON.stringify([value.name,value.email,value.topic,value.message]))]);
 const result=await db.batch([
  db.prepare("INSERT INTO contact_messages(id,name,email,topic,message,status,revision,email_hash,network_hash,payload_hash,created_at,updated_at) SELECT ?,?,?,?,?,'new',1,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM contact_messages WHERE id=?) AND (SELECT count(*) FROM contact_messages WHERE email_hash=? AND created_at>?)<5 AND (?='' OR (SELECT count(*) FROM contact_messages WHERE network_hash=? AND created_at>?)<5)").bind(id,value.name,value.email,value.topic,value.message,emailHash,networkHash,payloadHash,created,created,id,emailHash,since,networkHash,networkHash,since),
  db.prepare('SELECT id,payload_hash FROM contact_messages WHERE id=?').bind(id),
 ]);
 const saved=result[1].results[0] as {id:string;payload_hash:string}|undefined;
 if(!saved)throw new AppError(429,'Too many messages. Wait 15 minutes before trying again.');
 if(saved.payload_hash!==payloadHash)throw new AppError(409,'This message changed. Refresh the contact form and try again.');
 return {reference:saved.id};
}

export type ContactMessage={id:string;name:string;email:string;topic:string;message:string;status:ContactStatus;revision:number;created_at:string;updated_at:string};
const fields='id,name,email,topic,message,status,revision,created_at,updated_at';
const page=z.union([z.number().int().min(1).max(1_000_000),z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number).refine(value=>value<=1_000_000)]).default(1);
const filters=z.object({q:z.string().trim().max(120).regex(/^[^\u0000-\u001f\u007f]*$/).default(''),status:z.enum(['all','new','in_progress','closed']).default('new'),page,message:z.string().uuid().optional()}).strict();
const ownerGuard='EXISTS(SELECT 1 FROM platform_admins WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)';
export function contactInbox(db:D1Database,user:Identity){
 async function owner(){await assertAccountOpen(db,user.userId);await requirePlatformAdmin(db,user);}
 return {
  async list(input:unknown={}){
   await owner();const f=parse(filters,input),size=25,args=[user.userId,user.userId,f.q,f.q,f.q,f.q,f.q,f.status,f.status],prefix=`WITH scope AS (SELECT ${fields} FROM contact_messages WHERE ${ownerGuard} AND (?='' OR instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0 OR instr(lower(topic),lower(?))>0 OR instr(lower(message),lower(?))>0)), matching AS (SELECT * FROM scope WHERE (?='all' OR status=?)), stats AS (SELECT count(*) total FROM matching)`;
   const results=await db.batch([
    db.prepare(`${prefix} SELECT * FROM stats`).bind(...args),
    db.prepare(`${prefix} SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT ? OFFSET MIN(?,MAX(0,(SELECT CAST((total-1)/? AS INTEGER)*? FROM stats)))`).bind(...args,size,(Number(f.page)-1)*size,size,size),
    db.prepare(`${prefix} SELECT status,count(*) total FROM scope GROUP BY status`).bind(...args),
    db.prepare(`SELECT ${fields} FROM contact_messages WHERE id=? AND ${ownerGuard}`).bind(f.message||'',user.userId,user.userId),
    db.prepare(`${prefix} SELECT id FROM matching WHERE id=?`).bind(...args,f.message||''),
   ]);
   const total=Number((results[0].results[0] as {total:number}).total),pages=Math.ceil(total/size),currentPage=Math.min(Number(f.page),Math.max(1,pages)),selected=(results[3].results[0] as ContactMessage|undefined)||null;
   if(f.message&&!selected)throw new AppError(404,'This contact message is not available.');
   return {rows:results[1].results as ContactMessage[],selected,selectedMatchesFilters:!!results[4].results.length,total,page:currentPage,pages,pageSize:size,filters:{...f,page:currentPage},counts:results[2].results as {status:ContactStatus;total:number}[]};
  },
  async update(input:unknown){
   await owner();const value=parse(z.object({id:z.string().uuid(),revision:z.number().int().positive(),status}).strict(),input),at=new Date().toISOString();
   const result=await db.batch([
    db.prepare(`UPDATE contact_messages SET status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND ${ownerGuard}`).bind(value.status,at,value.id,value.revision,user.userId,user.userId),
    db.prepare(`SELECT ${fields} FROM contact_messages WHERE id=? AND ${ownerGuard}`).bind(value.id,user.userId,user.userId),
   ]);
   if(!changed(result[0])||!result[1].results.length)throw new AppError(409,'This message or your owner access changed. Reload the inbox before saving.');
   return result[1].results[0] as ContactMessage;
  },
 };
}
