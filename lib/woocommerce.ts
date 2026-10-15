import {z} from 'zod';
import {effectiveCommission,shopifyHold,trackedOrderColumns} from './commission-query.ts';
import {AppError,service,type Identity} from './service.ts';

export type Connection={id:string;store_url:string;active:number;last_seen:string|null;created_at:string;platform:'woocommerce'|'shopify'};
type PrivateConnection=Connection&{workspace_id:string;signing_key:string};
export type TrackedOrder={id:string;store_id:string;referral_id:string;application_id:string;external_id:string;revision:number;currency:string;decimals:number;basis:number;refunded_basis:number;rate_bps:number;commission:number;status:string;commission_state:string;needs_review:number;created_at:string;received_at:string;partner_name?:string;business_name?:string};
type Referral={id:string;store_id:string;application_id:string;rate_bps:number;created_at:string;expires_at:string};
const uuid=z.string().uuid();
const storeUrl=z.string().max(300).transform(v=>v.trim().replace(/\/+$/,'' )).refine(v=>{
  try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.hostname.includes('.')&&!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname);}catch{return false;}
},'Use the public HTTPS home URL of your WooCommerce store.');
const inputSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('connect'),storeUrl}).strict(),
  z.object({action:z.enum(['rotate','disconnect','resume'])}).strict(),
]);
const amount=z.number().int().min(0).max(1_000_000_000_000);
const eventSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('ping'),storeUrl}).strict(),
  z.object({kind:z.literal('referral'),applicationId:uuid}).strict(),
  z.object({kind:z.literal('order'),orderId:z.string().regex(/^[1-9][0-9]{0,19}$/),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),referralId:uuid,createdAt:z.string().datetime(),currency:z.string().regex(/^[A-Z]{3}$/),decimals:z.number().int().min(0).max(6),basis:amount,refundedBasis:amount,status:z.enum(['pending','on-hold','processing','completed','cancelled','failed','refunded']),refundUnallocated:z.boolean()}).strict(),
]);
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,r.error.issues[0]?.message||'Invalid store request.');return r.data;}
const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
export async function signStoreRequest(key:string,timestamp:string,eventId:string,raw:string){
  const cryptoKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',cryptoKey,encoder.encode(`${timestamp}.${eventId}.${raw}`)));
}
async function verifySignature(key:string,message:string,signature:string){
  if(!/^[a-f0-9]{64}$/.test(signature))return false;
  const cryptoKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',cryptoKey,Uint8Array.from(signature.match(/../g)!,v=>parseInt(v,16)),encoder.encode(message));
}
export function commissionFor(basis:number,refunded:number,rate:number){
  // Integer half-up rounding; multiplication never passes through a floating-point amount.
  return Number((BigInt(basis-refunded)*BigInt(rate)+BigInt(5000))/BigInt(10000));
}
const one=<T>(db:D1Database,query:string,...values:unknown[])=>db.prepare(query).bind(...values).first<T>();
const all=async<T>(db:D1Database,query:string,...values:unknown[])=>(await db.prepare(query).bind(...values).all<T>()).results;
export function commerce(db:D1Database,identity:Identity){
  const s=service(db,identity);
  const workspace=async()=>{const w=await s.workspace();if(!w)throw new AppError(404,'Create your business workspace first.');return w;};
  return {
    async configure(input:unknown){
      const value=parse(inputSchema,input),w=await workspace();
      const existing=await one<Connection>(db,'SELECT id,store_url,active,last_seen,created_at FROM store_connections WHERE workspace_id=?',w.id);
      if(existing){const kind=await one<{platform:string}>(db,'SELECT platform FROM store_connections WHERE id=?',existing.id);if(kind?.platform!=='woocommerce')throw new AppError(409,'Manage this store through its Shopify connection settings.');}
      const at=new Date().toISOString();let key:string|undefined;
      if(value.action==='connect'){
        if(existing)throw new AppError(409,'This workspace already has a store. Resume or rotate its key instead.');
        key=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
        const storeId=crypto.randomUUID();
        await db.batch([
          db.prepare('INSERT INTO store_connections (id,workspace_id,store_url,signing_key,active,created_at) VALUES (?,?,?,?,1,?)').bind(storeId,w.id,value.storeUrl,key,at),
          db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),w.id,identity.userId,'store_configured',at),
        ]);
      }else{
        if(!existing)throw new AppError(404,'No store is configured.');
        const statement=value.action==='rotate'?
          db.prepare('UPDATE store_connections SET signing_key=?,last_seen=NULL WHERE id=? AND workspace_id=?').bind(key=hex(crypto.getRandomValues(new Uint8Array(32)).buffer),existing.id,w.id):
          db.prepare('UPDATE store_connections SET active=? WHERE id=? AND workspace_id=?').bind(value.action==='resume'?1:0,existing.id,w.id);
        await db.batch([statement,db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),w.id,identity.userId,`store_${value.action}`,at)]);
      }
      const connection=await one<Connection>(db,'SELECT id,store_url,active,last_seen,created_at,platform FROM store_connections WHERE workspace_id=?',w.id);
      return {connection,...(key?{key}:{})};
    },
    async dashboard(){
      const w=await workspace();
      const connection=await one<Connection>(db,'SELECT id,store_url,active,last_seen,created_at,platform FROM store_connections WHERE workspace_id=?',w.id);
      if(!connection)return {connection:null,visits:0,orders:[] as TrackedOrder[],totals:[] as {currency:string;decimals:number;commission:number;count:number}[]};
      const visits=await one<{n:number}>(db,'SELECT count(*) AS n FROM referrals WHERE store_id=?',connection.id);
      const orders=await all<TrackedOrder>(db,`SELECT ${trackedOrderColumns()},f.display_name AS partner_name FROM orders o JOIN applications a ON a.id=o.application_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id WHERE o.store_id=? ORDER BY o.received_at DESC LIMIT 100`,connection.id);
      const totals=await all<{currency:string;decimals:number;commission:number;count:number}>(db,`SELECT o.currency,o.decimals,sum(${effectiveCommission()}) AS commission,count(*) AS count FROM orders o WHERE o.store_id=? GROUP BY o.currency,o.decimals`,connection.id);
      return {connection,visits:visits?.n||0,orders,totals};
    },
    async partnerTracking(){
      const links=await all<{application_id:string;program_id:string;platform:string;store_url:string;business_name:string}>(db,"SELECT a.id AS application_id,p.id AS program_id,c.platform,c.store_url,w.name AS business_name FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN store_connections c ON c.workspace_id=w.id WHERE a.affiliate_user_id=? AND a.status='approved' AND p.active=1 AND c.active=1 AND c.last_seen IS NOT NULL",identity.userId);
      const orders=await all<TrackedOrder>(db,`SELECT ${trackedOrderColumns()},w.name AS business_name FROM orders o JOIN applications a ON a.id=o.application_id JOIN store_connections c ON c.id=o.store_id JOIN workspaces w ON w.id=c.workspace_id WHERE a.affiliate_user_id=? ORDER BY o.received_at DESC LIMIT 100`,identity.userId);
      const totals=await all<{currency:string;decimals:number;commission:number;count:number}>(db,`SELECT o.currency,o.decimals,sum(${effectiveCommission()}) AS commission,count(*) AS count FROM orders o JOIN applications a ON a.id=o.application_id WHERE a.affiliate_user_id=? GROUP BY o.currency,o.decimals`,identity.userId);
      return {links:links.map(l=>({...l,url:l.platform==='shopify'?`${l.store_url}/?ref=af_${l.application_id}&utm_source=affimaro&utm_medium=affiliate&utm_campaign=${l.program_id}&utm_content=${l.application_id}`:`${l.store_url}/?affimaro_ref=${l.application_id}`})),orders,totals};
    },
  };
}

async function rawBody(request:Request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError(415,'JSON is required.');
  if(Number(request.headers.get('content-length')||0)>16384)throw new AppError(413,'Store event is too large.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'Empty store event.');
  let size=0;const parts:Uint8Array[]=[];
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384){await reader.cancel();throw new AppError(413,'Store event is too large.');}parts.push(next.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new AppError(400,'Invalid UTF-8.');}
}
export async function receiveStoreEvent(db:D1Database,request:Request,clock=new Date(),expectedPlatform:'woocommerce'|'shopify'='woocommerce'){
  const storeId=request.headers.get('x-affimaro-store')||'',eventId=request.headers.get('x-affimaro-event')||'',timestamp=request.headers.get('x-affimaro-timestamp')||'',signature=request.headers.get('x-affimaro-signature')||'';
  if(!uuid.safeParse(storeId).success||!uuid.safeParse(eventId).success||!/^\d{10}$/.test(timestamp)||Math.abs(clock.getTime()/1000-Number(timestamp))>300)throw new AppError(401,'Invalid or expired store signature.');
  const connection=await one<PrivateConnection>(db,'SELECT * FROM store_connections WHERE id=?',storeId);
  if(!connection?.active||connection.platform!==expectedPlatform)throw new AppError(401,'Store connection is unavailable.');
  const raw=await rawBody(request);
  if(!await verifySignature(connection.signing_key,`${timestamp}.${eventId}.${raw}`,signature))throw new AppError(401,'Invalid store signature.');
  const hash=hex(await crypto.subtle.digest('SHA-256',encoder.encode(raw)));
  const replay=async()=>{const old=await one<{payload_hash:string;response:string}>(db,'SELECT payload_hash,response FROM store_events WHERE store_id=? AND event_id=?',storeId,eventId);if(old&&old.payload_hash!==hash)throw new AppError(409,'Event ID was already used for another payload.');return old?JSON.parse(old.response):null;};
  const previous=await replay();if(previous)return previous;
  let input:unknown;try{input=JSON.parse(raw);}catch{throw new AppError(400,'Invalid JSON.');}
  const event=parse(eventSchema,input),at=clock.toISOString(),statements:D1PreparedStatement[]=[];let result:Record<string,unknown>;
  if(event.kind==='ping'){
    if(event.storeUrl!==connection.store_url)throw new AppError(409,'The store home URL does not match this connection.');
    result={connected:true};
  }else if(event.kind==='referral'){
    const application=await one<{rate_bps:number;window_days:number}>(db,"SELECT p.rate_bps,p.window_days FROM applications a JOIN programs p ON p.id=a.program_id WHERE a.id=? AND a.status='approved' AND p.active=1 AND p.workspace_id=?",event.applicationId,connection.workspace_id);
    if(!application)throw new AppError(403,'This partner is not active in this store program.');
    const referralId=crypto.randomUUID(),expiresAt=new Date(clock.getTime()+application.window_days*86400000).toISOString();
    statements.push(db.prepare('INSERT INTO referrals (id,store_id,application_id,rate_bps,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(referralId,storeId,event.applicationId,application.rate_bps,at,expiresAt));
    result={referralId,expiresAt};
  }else{
    if(event.refundedBasis>event.basis)throw new AppError(400,'The merchandise refund exceeds its basis.');
    const createdAt=new Date(event.createdAt).toISOString();
    const existing=await one<TrackedOrder>(db,'SELECT * FROM orders WHERE store_id=? AND external_id=?',storeId,event.orderId);
    const referral=await one<Referral>(db,'SELECT * FROM referrals WHERE id=? AND store_id=?',event.referralId,storeId);
    if(!referral)throw new AppError(403,'Referral does not belong to this store.');
    if(existing&&(existing.referral_id!==referral.id||existing.currency!==event.currency||existing.decimals!==event.decimals||existing.created_at!==createdAt))throw new AppError(409,'Order attribution, creation time and currency cannot be changed.');
    if(new Date(event.createdAt).getTime()>clock.getTime()+300000)throw new AppError(400,'Order creation time is in the future.');
    const eligible=existing?existing.commission_state!=='ineligible':
      new Date(createdAt).getTime()>=new Date(referral.created_at).getTime()-1000&&createdAt<=referral.expires_at&&!!await one(db,"SELECT a.id FROM applications a JOIN programs p ON p.id=a.program_id WHERE a.id=? AND a.status='approved' AND p.active=1",referral.application_id);
    const rate=existing?.rate_bps??referral.rate_bps;
    const reversed=['cancelled','failed','refunded'].includes(event.status);
    const state=!eligible?'ineligible':reversed?'reversed':event.refundUnallocated?'review':['processing','completed'].includes(event.status)?'accrued':'pending';
    const commission=state==='accrued'?commissionFor(event.basis,event.refundedBasis,rate):0;
    if(existing&&event.revision<=existing.revision){
      if(event.revision===existing.revision&&(event.basis!==existing.basis||event.refundedBasis!==existing.refunded_basis||event.status!==existing.status||Number(event.refundUnallocated)!==existing.needs_review))throw new AppError(409,'An order revision cannot be reused with different values.');
      result={orderId:event.orderId,stale:true};
    }else{
      statements.push(db.prepare('INSERT INTO orders (id,store_id,referral_id,application_id,external_id,revision,currency,decimals,basis,refunded_basis,rate_bps,commission,status,commission_state,needs_review,created_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(store_id,external_id) DO UPDATE SET revision=excluded.revision,basis=excluded.basis,refunded_basis=excluded.refunded_basis,commission=excluded.commission,status=excluded.status,commission_state=excluded.commission_state,needs_review=excluded.needs_review,received_at=excluded.received_at WHERE excluded.revision > orders.revision AND excluded.referral_id=orders.referral_id AND excluded.currency=orders.currency AND excluded.decimals=orders.decimals AND excluded.created_at=orders.created_at').bind(existing?.id??crypto.randomUUID(),storeId,referral.id,referral.application_id,event.orderId,event.revision,event.currency,event.decimals,event.basis,event.refundedBasis,rate,commission,event.status,state,event.refundUnallocated?1:0,createdAt,at));
      result={orderId:event.orderId,accepted:true};
    }
  }
  statements.unshift(db.prepare('INSERT INTO store_events (store_id,event_id,payload_hash,response,created_at) VALUES (?,?,?,?,?)').bind(storeId,eventId,hash,JSON.stringify(result),at));
  statements.push(db.prepare('UPDATE store_connections SET last_seen=? WHERE id=? AND active=1').bind(at,storeId));
  try{await db.batch(statements);}catch(error){const raced=await replay();if(raced)return raced;throw error;}
  return result;
}
