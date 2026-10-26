import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requirePlatformAdmin} from './admissions.ts';
import {assertAccountOpen} from './account-state.ts';
import {openPayment,sealPayment} from './payment-crypto.ts';
import {saveContactEmailSetup} from './contact-email.ts';
import {invoicePdfUrl,type BillingInvoice} from './billing-invoices.ts';

type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Setup={enabled:number;revision:number;configured_by:string};
type Receipt={sending_revision:number|null;invoice_id:string;account_id:string;user_id:string;status:'pending'|'failed'|'accepted'|'review';encrypted_payload:string;attempts:number;first_attempt_at:string|null;last_attempt_at:string|null;lease_id:string|null;lease_until:string|null;provider_id:string|null;accepted_at:string|null};
const sender='Affimaro <noreply@affimaro.com>',at=()=>new Date().toISOString();
const setting=(db:D1Database)=>db.prepare("SELECT * FROM billing_email_settings WHERE id='resend'").first<Setup>();
const receipt=(db:D1Database,id:string)=>db.prepare('SELECT * FROM billing_invoice_emails WHERE invoice_id=?').bind(id).first<Receipt>();
const shared=(db:D1Database)=>db.prepare("SELECT s.encrypted_credential,s.revision,s.enabled FROM contact_email_settings s JOIN platform_admins p ON p.user_id=s.configured_by WHERE s.id='resend' AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=s.configured_by)").first<{encrypted_credential:string;revision:number;enabled:number}>();
const active="EXISTS(SELECT 1 FROM billing_email_settings s JOIN platform_admins p ON p.user_id=s.configured_by WHERE s.id='resend' AND s.enabled=1 AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=s.configured_by))";
const changes=(r:unknown)=>Number((r as {meta?:{changes?:number}})?.meta?.changes||0);
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export type BillingEmailSetup={configured:boolean;enabled:boolean;revision:number;sender:string;pending:number;failed:number;review:number};
export async function billingEmailSetup(db:D1Database,user:Identity):Promise<BillingEmailSetup>{
 await assertAccountOpen(db,user.userId);await requirePlatformAdmin(db,user);const s=await setting(db),key=await shared(db);
 const counts=(await db.prepare("SELECT status,COUNT(*) AS n FROM billing_invoice_emails WHERE status<>'accepted' GROUP BY status").all<{status:string;n:number}>()).results;
 return {configured:!!key,enabled:!!s?.enabled,revision:s?.revision||0,sender,pending:counts.find(x=>x.status==='pending')?.n||0,failed:counts.find(x=>x.status==='failed')?.n||0,review:counts.find(x=>x.status==='review')?.n||0};
}
export async function saveBillingEmailSetup(db:D1Database,user:Identity,key:string|undefined,input:unknown){
 await assertAccountOpen(db,user.userId);await requirePlatformAdmin(db,user);
 const value=z.object({revision:z.number().int().nonnegative(),enabled:z.boolean(),apiKey:z.string().trim().regex(/^re_[A-Za-z0-9_-]{16,256}$/).optional()}).strict().safeParse(input);
 if(!value.success)throw new AppError(400,'Check the invoice email setting and sending key.');
 const old=await setting(db);if((old?.revision||0)!==value.data.revision)throw new AppError(409,'The invoice email settings changed. Reload first.');
 let send=await shared(db);if(value.data.apiKey){await saveContactEmailSetup(db,user,key,{action:'configure',revision:send?.revision||0,enabled:!!send?.enabled,apiKey:value.data.apiKey});send=await shared(db);}
 if(value.data.enabled&&!send)throw new AppError(400,'Save a Resend sending-access key for your verified affimaro.com domain first.');
 const result=old?await db.prepare("UPDATE billing_email_settings SET enabled=?,revision=revision+1,configured_by=?,updated_at=? WHERE id='resend' AND revision=? AND EXISTS(SELECT 1 FROM platform_admins WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)").bind(value.data.enabled?1:0,user.userId,at(),old.revision,user.userId,user.userId).run():await db.prepare("INSERT INTO billing_email_settings(id,enabled,revision,configured_by,updated_at) SELECT 'resend',?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM billing_email_settings WHERE id='resend') AND EXISTS(SELECT 1 FROM platform_admins WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)").bind(value.data.enabled?1:0,user.userId,at(),user.userId,user.userId).run();
 if(!changes(result))throw new AppError(409,'The invoice email settings changed. Reload first.');return billingEmailSetup(db,user);
}
export const invoiceEmailLabel=(status:string)=>({accepted:'Email accepted by sending service',pending:'Email queued',failed:'Email sending needs a retry',review:'Email needs support review',disabled:'Invoice email is unavailable. Download the PDF or contact support.',none:'Invoice email has not been requested'}[status]||'Email status unavailable');
export async function invoiceEmailStates(db:D1Database,userId:string,invoiceIds:string[]){
 const setup=await setting(db),send=await shared(db),rows=invoiceIds.length?(await db.prepare(`SELECT invoice_id,status FROM billing_invoice_emails WHERE user_id=? AND invoice_id IN (${invoiceIds.map(()=>'?').join(',')})`).bind(userId,...invoiceIds).all<{invoice_id:string;status:string}>()).results:[];
 return Object.fromEntries(invoiceIds.map(id=>{const row=rows.find(x=>x.invoice_id===id),status=row?.status||(setup?.enabled&&send?'none':'disabled');return [id,{status,label:invoiceEmailLabel(status),canSend:!!setup?.enabled&&!!send&&!['accepted','review'].includes(status)}];}));
}
// Called only with an invoice retrieved and checked against the saved provider
// customer/subscription by billing(). No email address or PDF URL comes from a form.
export async function queueInvoiceEmail(db:D1Database,user:Identity,accountId:string,invoice:BillingInvoice,key:string|undefined){
 await assertAccountOpen(db,user.userId);if(invoice.status!=='paid'||!invoice.pdfUrl||invoicePdfUrl(invoice.pdfUrl)!==invoice.pdfUrl||!invoice.paidAt)throw new AppError(409,'A finalized paid invoice PDF is required before emailing it.');
 const account=await db.prepare('SELECT a.email FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE b.id=? AND b.mode=\'live\' AND w.owner_id=?').bind(accountId,user.userId).first<{email:string}>();
 if(!account||!z.email().safeParse(account.email).success||account.email.toLowerCase()!==user.email.toLowerCase())throw new AppError(409,'Your verified billing email must match your current account.');
 const number=invoice.number||invoice.id,total=(invoice.total/100).toFixed(2),paid=(invoice.amountPaid/100).toFixed(2),date=new Date(invoice.paidAt*1000).toUTCString();
 const text=`Your Affimaro subscription invoice ${number} is paid.\n\nInvoice total: $${total} USD\nAmount paid: $${paid} USD\nPaid: ${date}\n\nDownload your private invoice PDF: ${invoice.pdfUrl}\n\nView your invoices securely at https://affimaro.com/billing (agency accounts are directed to their own billing page).\nFor billing questions: https://affimaro.com/contact\n\nThis is a service email, not a marketing subscription. Please keep your invoice link private.`;
 const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#153b32"><h2>Affimaro</h2><h3>Your subscription invoice is paid</h3><p>Invoice ${escape(number)}</p><p>Invoice total: <strong>$${total} USD</strong><br>Amount paid: <strong>$${paid} USD</strong><br>Paid: ${escape(date)}</p><p><a href="${escape(invoice.pdfUrl)}">Download invoice PDF</a></p><p><a href="https://affimaro.com/billing">View invoices in Affimaro</a> · <a href="https://affimaro.com/contact">Billing support</a></p><p style="font-size:12px">This is a service email. Keep your private invoice link secure.</p></div>`;
 const encrypted=await sealPayment({from:sender,to:[account.email],subject:'Affimaro — paid invoice '+number,text,html},key,'billing-invoice-email/'+invoice.id);
 await db.prepare("INSERT INTO billing_invoice_emails(invoice_id,account_id,user_id,status,encrypted_payload,attempts,created_at) SELECT ?,?,?,'pending',?,0,? WHERE NOT EXISTS(SELECT 1 FROM account_closures WHERE user_id=?) ON CONFLICT(invoice_id) DO NOTHING").bind(invoice.id,accountId,user.userId,encrypted,at(),user.userId).run();
 const old=await receipt(db,invoice.id);if(!old||old.user_id!==user.userId||old.account_id!==accountId)throw new AppError(409,'The invoice email does not match this account.');
}
export async function deliverInvoiceEmail(db:D1Database,id:string,key:string|undefined,fetcher:Fetcher=fetch,clock=Date.now()){
 const s=await setting(db),send=await shared(db),r=await receipt(db,id);if(!s?.enabled||!send||!r||['accepted','review'].includes(r.status))return;
 if(r.sending_revision!==null&&r.sending_revision!==send.revision){await db.prepare("UPDATE billing_invoice_emails SET status='review' WHERE invoice_id=? AND status<>'accepted' AND (lease_until IS NULL OR lease_until<=?)").bind(id,new Date(clock).toISOString()).run();return;}
 if(r.first_attempt_at&&clock-Date.parse(r.first_attempt_at)>23*3600000||r.attempts>=5){await db.prepare("UPDATE billing_invoice_emails SET status='review' WHERE invoice_id=? AND status<>'accepted' AND (lease_until IS NULL OR lease_until<=?)").bind(id,new Date(clock).toISOString()).run();return;}
 let secret:string,payload:{from:string;to:string[];subject:string;text:string;html:string};try{secret=await openPayment<string>(send.encrypted_credential,key,'contact-email/resend/key');payload=z.object({from:z.literal(sender),to:z.array(z.email()).length(1),subject:z.string().max(600),text:z.string().max(12000),html:z.string().max(12000)}).strict().parse(await openPayment(r.encrypted_payload,key,'billing-invoice-email/'+id));}catch{return;}
 const destination=await db.prepare('SELECT a.email FROM accounts a JOIN workspaces w ON w.owner_id=a.id JOIN billing_accounts b ON b.workspace_id=w.id WHERE a.id=? AND b.id=?').bind(r.user_id,r.account_id).first<{email:string}>();
 if(!destination||destination.email.toLowerCase()!==payload.to[0].toLowerCase()){await db.prepare("UPDATE billing_invoice_emails SET status='review' WHERE invoice_id=? AND status<>'accepted' AND (lease_until IS NULL OR lease_until<=?)").bind(id,new Date(clock).toISOString()).run();return;}
 const date=new Date(clock).toISOString(),lease=crypto.randomUUID();
 const result=await db.prepare(`UPDATE billing_invoice_emails SET sending_revision=COALESCE(sending_revision,?),lease_id=?,lease_until=?,first_attempt_at=COALESCE(first_attempt_at,?),last_attempt_at=?,attempts=attempts+1 WHERE invoice_id=? AND status IN ('pending','failed') AND (sending_revision IS NULL OR sending_revision=?) AND (lease_until IS NULL OR lease_until<=?) AND (last_attempt_at IS NULL OR last_attempt_at<=?) AND EXISTS(SELECT 1 FROM accounts WHERE id=billing_invoice_emails.user_id AND lower(email)=lower(?)) AND NOT EXISTS(SELECT 1 FROM account_closures WHERE user_id=billing_invoice_emails.user_id) AND ${active} AND EXISTS(SELECT 1 FROM billing_email_settings WHERE id='resend' AND revision=?) AND EXISTS(SELECT 1 FROM contact_email_settings WHERE id='resend' AND revision=?)`).bind(send.revision,lease,new Date(clock+30000).toISOString(),date,date,id,send.revision,date,new Date(clock-60000).toISOString(),destination.email,s.revision,send.revision).run();
 if(!changes(result))return;
 try{
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','Idempotency-Key':'affimaro-paid-invoice-'+id},body:JSON.stringify(payload)});
  if(!response.ok){await response.body?.cancel();throw new Error();}
  const reader=response.body?.getReader();if(!reader)throw new Error();let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384)throw new Error();text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}catch{await reader.cancel().catch(()=>{});throw new Error();}
  const provider=z.object({id:z.string().uuid()}).parse(JSON.parse(text));await db.prepare("UPDATE billing_invoice_emails SET status='accepted',provider_id=?,accepted_at=?,lease_id=NULL,lease_until=NULL WHERE invoice_id=? AND lease_id=?").bind(provider.id,at(),id,lease).run();
 }catch{await db.prepare("UPDATE billing_invoice_emails SET status='failed',lease_id=NULL,lease_until=NULL WHERE invoice_id=? AND lease_id=? AND status<>'accepted'").bind(id,lease).run();}
}
