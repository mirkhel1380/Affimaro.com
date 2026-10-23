import {z} from 'zod';
import {AppError} from './service.ts';
import {billing,type BillingConfig} from './billing.ts';
import {platformWebhookCredentials} from './platform-billing.ts';
import {subscriptionEvents} from './platform-billing-catalog.ts';
import {billingSelection} from './billing-selection.ts';
import type {Plan} from './plan-requests.ts';
const encoder=new TextEncoder(),now=()=>new Date().toISOString();
const eventSchema=z.object({id:z.string().regex(/^evt_[A-Za-z0-9]{6,200}$/),object:z.literal('event'),livemode:z.boolean(),type:z.string().max(120),account:z.string().optional(),data:z.object({object:z.record(z.unknown())})});
const id=(value:unknown,prefix:string)=>typeof value==='string'&&new RegExp('^'+prefix+'[A-Za-z0-9]{6,200}$').test(value)?value:null;
export async function verifyBillingSignature(bytes:Uint8Array,header:string,secret:string,clock=Date.now()){
 if(header.length>4096)throw new AppError(400,'Invalid subscription signature.');
 const parts=header.split(',').map(p=>p.trim().split('=')),timestamps=parts.filter(p=>p[0]==='t'),signatures=parts.filter(p=>p[0]==='v1'&&/^[a-f0-9]{64}$/.test(p[1]||'')).map(p=>p[1]);
 if(timestamps.length!==1||!/^\d{1,12}$/.test(timestamps[0][1])||Math.abs(clock/1000-Number(timestamps[0][1]))>300||!signatures.length||signatures.length>10)throw new AppError(400,'Invalid subscription signature.');
 const prefix=encoder.encode(timestamps[0][1]+'.'),message=new Uint8Array(prefix.length+bytes.length);message.set(prefix);message.set(bytes,prefix.length);
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),expected=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,message)),n=>n.toString(16).padStart(2,'0')).join('');
 if(!signatures.some(s=>{let diff=0;for(let i=0;i<64;i++)diff|=s.charCodeAt(i)^expected.charCodeAt(i);return diff===0;}))throw new AppError(400,'Invalid subscription signature.');
}
export async function billingWebhook(request:Request,options:{db:D1Database;key?:string;origin:string;config:(plan:Plan,context:{userId:string;existing:true;priceId:string|null})=>Promise<BillingConfig>;fetcher?:typeof fetch}){
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 try{
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
  const signature=request.headers.get('stripe-signature');if(!signature)throw new AppError(400,'A subscription signature is required.');
  if(Number(request.headers.get('content-length')||0)>262144)throw new AppError(413,'Subscription notification is too large.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'The subscription notification is empty.');const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();throw new AppError(413,'Subscription notification is too large.');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  const credentials=await platformWebhookCredentials(options.db,options.key,options.origin);await verifyBillingSignature(bytes,signature,credentials.secret);
  let input:unknown;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError(400,'Invalid subscription notification.');}
  const checked=eventSchema.safeParse(input);if(!checked.success)throw new AppError(400,'Invalid subscription notification.');const event=checked.data;
  if(event.livemode!==(credentials.mode==='live')||event.account&&event.account!==credentials.accountId)throw new AppError(400,'Subscription notification account mismatch.');
  if(!subscriptionEvents.includes(event.type as typeof subscriptionEvents[number]))return Response.json({received:true},{headers});
  const db=options.db,lease=crypto.randomUUID(),at=now(),until=new Date(Date.now()+120000).toISOString();
  await db.prepare("INSERT INTO billing_webhook_events (event_id,status,lease_id,lease_until,created_at) VALUES (?,'processing',?,?,?) ON CONFLICT(event_id) DO NOTHING").bind(event.id,lease,until,at).run();
  let saved=await db.prepare('SELECT status,lease_id FROM billing_webhook_events WHERE event_id=?').bind(event.id).first<{status:string;lease_id:string}>();
  if(saved?.status==='processed')return Response.json({received:true},{headers});
  if(saved?.lease_id!==lease){await db.prepare("UPDATE billing_webhook_events SET lease_id=?,lease_until=? WHERE event_id=? AND status='processing' AND lease_until<=?").bind(lease,until,event.id,at).run();saved=await db.prepare('SELECT status,lease_id FROM billing_webhook_events WHERE event_id=?').bind(event.id).first();}
  if(saved?.lease_id!==lease)throw new AppError(503,'Subscription notification is already being processed.');
  try{
   const object=event.data.object,metadata=object.metadata&&typeof object.metadata==='object'?object.metadata as Record<string,unknown>:{},checkoutId=typeof metadata.affimaro_checkout==='string'&&z.string().uuid().safeParse(metadata.affimaro_checkout).success?metadata.affimaro_checkout:null;
   const sessionId=event.type.startsWith('checkout.session.')&&object.object==='checkout.session'?id(object.id,'cs_(?:live|test)_'):null;
   const subscriptionId=event.type.startsWith('customer.subscription.')&&object.object==='subscription'?id(object.id,'sub_'):null;
   const customerId=event.type.startsWith('invoice.')&&object.object==='invoice'?id(object.customer,'cus_'):null;
   let target:{owner_id:string;email:string;price_id:string|null}|null=null;
   if(sessionId||checkoutId)target=await db.prepare(`SELECT w.owner_id,a.email,c.price_id FROM billing_checkouts c JOIN billing_accounts b ON b.id=c.account_id JOIN workspaces w ON w.id=b.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE b.platform_id=? AND b.mode=? AND ((? IS NOT NULL AND c.session_id=?) OR (? IS NOT NULL AND c.id=? AND (? IS NULL OR c.session_id IS NULL))) AND (? IS NULL OR c.id=?) LIMIT 1`).bind(credentials.accountId,credentials.mode,sessionId,sessionId,checkoutId,checkoutId,sessionId,checkoutId,checkoutId).first();
   else if(subscriptionId||customerId)target=await db.prepare(`SELECT w.owner_id,a.email,b.price_id FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id JOIN accounts a ON a.id=w.owner_id WHERE b.platform_id=? AND b.mode=? AND ((? IS NOT NULL AND b.subscription_id=?) OR (? IS NOT NULL AND b.customer_id=?)) LIMIT 1`).bind(credentials.accountId,credentials.mode,subscriptionId,subscriptionId,customerId,customerId).first();
   if(target){const selected=await billingSelection(db,target.owner_id,undefined,true,target.price_id);await billing(db,{userId:target.owner_id,email:target.email},await options.config(selected.plan,{userId:target.owner_id,existing:true,priceId:target.price_id}),options.key,options.fetcher).notification({...(checkoutId?{checkoutId}:{}),...(sessionId?{sessionId}:{})});}
   await db.prepare("UPDATE billing_webhook_events SET status='processed',processed_at=? WHERE event_id=? AND lease_id=?").bind(now(),event.id,lease).run();
  }catch(error){await db.prepare("UPDATE billing_webhook_events SET lease_until=? WHERE event_id=? AND lease_id=? AND status='processing'").bind(now(),event.id,lease).run();throw error;}
  return Response.json({received:true},{headers});
 }catch(error){const status=error instanceof AppError&&[400,413,405].includes(error.status)?error.status:503;return Response.json({received:false,error:status===503?'Subscription update could not be confirmed. Retry this notification.':error instanceof AppError?error.message:'Invalid subscription notification.'},{status,headers});}
}
