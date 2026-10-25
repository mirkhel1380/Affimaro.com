import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requirePlatformAdmin} from './admissions.ts';
import {assertAccountOpen} from './account-state.ts';
import {sealPayment,openPayment} from './payment-crypto.ts';

const sender='Affimaro <noreply@affimaro.com>',context='contact-email/resend/key';
const ownerGuard='EXISTS(SELECT 1 FROM platform_admins WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)';
const activeSetup="EXISTS(SELECT 1 FROM contact_email_settings s WHERE s.id='resend' AND s.enabled=1 AND EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id=s.configured_by) AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=s.configured_by))";
type Settings={id:string;encrypted_credential:string;enabled:number;revision:number;configured_by:string;updated_at:string};
type Receipt={number:number;message_id:string;status:'pending'|'failed'|'accepted'|'review';payload_json:string|null;attempts:number;first_attempt_at:string|null;last_attempt_at:string|null;lease_id:string|null;lease_until:string|null;provider_id:string|null;accepted_at:string|null};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
async function owner(db:D1Database,user:Identity){await assertAccountOpen(db,user.userId);await requirePlatformAdmin(db,user);}
const settings=(db:D1Database)=>db.prepare("SELECT * FROM contact_email_settings WHERE id='resend'").first<Settings>();
const receipt=(db:D1Database,id:string)=>db.prepare('SELECT * FROM contact_receipts WHERE message_id=?').bind(id).first<Receipt>();
const reference=(number:number)=>String(10000000+number);
const changes=(row:unknown)=>Number((row as {meta?:{changes?:number};changes?:number})?.meta?.changes??(row as {changes?:number})?.changes??0);
export type ContactEmailSetup={configured:boolean;enabled:boolean;revision:number;sender:string};
export async function contactEmailSetup(db:D1Database,user:Identity):Promise<ContactEmailSetup>{
 await owner(db,user);const value=await db.prepare(`SELECT enabled,revision FROM contact_email_settings WHERE id='resend' AND ${ownerGuard}`).bind(user.userId,user.userId).first<{enabled:number;revision:number}>();
 return {configured:!!value,enabled:!!value?.enabled,revision:value?.revision||0,sender};
}
export async function saveContactEmailSetup(db:D1Database,user:Identity,key:string|undefined,input:unknown){
 await owner(db,user);
 const parsed=z.object({action:z.literal('configure'),revision:z.number().int().min(0),enabled:z.boolean(),apiKey:z.string().trim().regex(/^re_[A-Za-z0-9_-]{16,256}$/).optional()}).strict().safeParse(input);
 if(!parsed.success)throw new AppError(400,'Enter a valid sending-access Resend key and check the email setting.');
 const value=parsed.data,old=await settings(db);if((old?.revision||0)!==value.revision)throw new AppError(409,'The contact email settings changed. Reload before saving.');
 if(!old&&!value.apiKey)throw new AppError(400,'Enter the Resend sending key to configure contact receipts.');
 let encrypted=old?.encrypted_credential;try{if(value.apiKey)encrypted=await sealPayment(value.apiKey,key,context);}catch{throw new AppError(503,'Secure contact email storage is unavailable.');}
 const at=new Date().toISOString();
 const row=old?await db.prepare(`UPDATE contact_email_settings SET encrypted_credential=?,enabled=?,revision=revision+1,configured_by=?,updated_at=? WHERE id='resend' AND revision=? AND ${ownerGuard}`).bind(encrypted,value.enabled?1:0,user.userId,at,value.revision,user.userId,user.userId).run():await db.prepare(`INSERT INTO contact_email_settings(id,encrypted_credential,enabled,revision,configured_by,updated_at) SELECT 'resend',?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM contact_email_settings WHERE id='resend') AND ${ownerGuard}`).bind(encrypted,value.enabled?1:0,user.userId,at,user.userId,user.userId).run();
 if(!changes(row))throw new AppError(409,'The contact email settings or owner access changed. Reload before saving.');
 return contactEmailSetup(db,user);
}

export async function queueContactReceipt(db:D1Database,id:string){
 // A new row is allocated only for a stored message, never for the spam-field response.
 await db.prepare("INSERT INTO contact_receipts(message_id,status,attempts) SELECT ?,'pending',0 WHERE EXISTS(SELECT 1 FROM contact_messages WHERE id=?) AND NOT EXISTS(SELECT 1 FROM contact_receipts WHERE message_id=?) ON CONFLICT(message_id) DO NOTHING").bind(id,id,id).run();
 return receipt(db,id);
}
function payload(email:string,code:string){
 const text='Thank you for contacting Affimaro.\n\nMessage received. Your reference is '+code+'. Keep it if you contact us again.\n\nOur team will review your message. You can contact us at https://affimaro.com/contact.\n\nThis is an automatic confirmation. Please do not reply to this address.';
 return JSON.stringify({from:sender,to:[email],subject:'Affimaro — message received #'+code,text,html:'<div style="font-family:Arial,sans-serif;color:#153b32;max-width:560px;margin:auto;padding:32px"><h2>Affimaro</h2><h3>Thank you for getting in touch.</h3><p>We have received your message and our team will review it.</p><p>Your reference</p><p style="font-size:26px;font-weight:bold;letter-spacing:3px">'+code+'</p><p>Keep this reference if you <a href="https://affimaro.com/contact">contact us again</a>.</p><p style="font-size:12px;color:#657064">This is an automatic confirmation. Please do not reply to this address.</p></div>'});
}
async function providerResult(response:Response){
 if(!response.ok){await response.body?.cancel();throw new Error('Contact receipt was not accepted.');}
 const reader=response.body?.getReader();if(!reader)throw new Error('No receipt acknowledgement.');let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)throw new Error();text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();const value=z.object({id:z.string().uuid()}).parse(JSON.parse(text));return value.id;}catch{await reader.cancel().catch(()=>{});throw new Error('Invalid receipt acknowledgement.');}
}

export async function deliverContactReceipt(db:D1Database,id:string,key:string|undefined,fetcher:Fetcher=fetch,at=Date.now(),by?:Identity){
 const setup=await settings(db),current=await receipt(db,id);if(!current||current.status==='accepted'||current.status==='review'||!setup?.enabled)return;
 const active=await db.prepare(`SELECT 1 AS ok WHERE ${activeSetup}`).first();if(!active)return;
 if(current.first_attempt_at&&at-Date.parse(current.first_attempt_at)>23*3600000){await db.prepare("UPDATE contact_receipts SET status='review' WHERE message_id=? AND status<>'accepted' AND (lease_until IS NULL OR lease_until<=?)").bind(id,new Date(at).toISOString()).run();return;}
 if(current.last_attempt_at&&at-Date.parse(current.last_attempt_at)<60000)return;
 const message=await db.prepare('SELECT email FROM contact_messages WHERE id=?').bind(id).first<{email:string}>();if(!message)return;
 let secret:string;try{secret=await openPayment<string>(setup.encrypted_credential,key,context);}catch{return;}
 const date=new Date(at).toISOString(),lease=crypto.randomUUID(),ownerCondition=by?` AND ${ownerGuard}`:'',bindings=by?[by.userId,by.userId]:[];
 const result=await db.prepare(`UPDATE contact_receipts SET payload_json=COALESCE(payload_json,?),lease_id=?,lease_until=?,first_attempt_at=COALESCE(first_attempt_at,?),last_attempt_at=?,attempts=attempts+1 WHERE message_id=? AND status IN ('pending','failed') AND (lease_until IS NULL OR lease_until<=?) AND (last_attempt_at IS NULL OR last_attempt_at<=?) AND ${activeSetup} AND EXISTS(SELECT 1 FROM contact_email_settings WHERE id='resend' AND revision=?)${ownerCondition}`).bind(payload(message.email,reference(current.number)),lease,new Date(at+30000).toISOString(),date,date,id,date,new Date(at-60000).toISOString(),setup.revision,...bindings).run();
 if(!changes(result))return;const locked=await receipt(db,id);if(!locked?.payload_json||locked.lease_id!==lease)return;
 try{
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Idempotency-Key':'affimaro-contact-receipt-'+current.number},body:locked.payload_json});
  const providerId=await providerResult(response);
  await db.prepare("UPDATE contact_receipts SET status='accepted',provider_id=?,accepted_at=?,lease_id=NULL,lease_until=NULL WHERE message_id=? AND lease_id=?").bind(providerId,new Date().toISOString(),id,lease).run();
 }catch{await db.prepare("UPDATE contact_receipts SET status='failed',lease_id=NULL,lease_until=NULL WHERE message_id=? AND lease_id=? AND status<>'accepted'").bind(id,lease).run();}
}

export async function contactReceiptSummary(db:D1Database,user:Identity,id:string){
 await owner(db,user);const row=await db.prepare(`SELECT number,status,attempts,accepted_at,first_attempt_at FROM contact_receipts WHERE message_id=? AND ${ownerGuard}`).bind(id,user.userId,user.userId).first<Pick<Receipt,'number'|'status'|'attempts'|'accepted_at'|'first_attempt_at'>>();
 return row?{reference:reference(row.number),status:row.status,attempts:row.attempts,acceptedAt:row.accepted_at}:null;
}
export async function retryContactReceipt(db:D1Database,user:Identity,key:string|undefined,input:unknown){
 await owner(db,user);const value=z.object({action:z.literal('retry'),id:z.string().uuid()}).strict().safeParse(input);if(!value.success)throw new AppError(400,'Choose a stored message.');
 const exists=await db.prepare(`SELECT id FROM contact_messages WHERE id=? AND ${ownerGuard}`).bind(value.data.id,user.userId,user.userId).first();if(!exists)throw new AppError(404,'This message is not available.');
 const setup=await settings(db);if(!setup?.enabled)throw new AppError(409,'Enable contact receipt emails first.');
 await queueContactReceipt(db,value.data.id);await deliverContactReceipt(db,value.data.id,key,fetch,Date.now(),user);return contactReceiptSummary(db,user,value.data.id);
}
