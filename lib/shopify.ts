import {z} from 'zod';
import {AppError,service,type Identity} from './service.ts';
import {sealPayment,openPayment} from './payment-crypto.ts';
import {receiveStoreEvent,signStoreRequest,type Connection} from './woocommerce.ts';
import {SHOPIFY_VERSION,ORDER_FIELDS,normalizeShopifyOrder,referralCandidate,shopDomainSchema,sourceRevision,ShopifyReview} from './shopify-model.ts';

type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Account={store_id:string;shop_domain:string;shop_id:string;client_id:string;encrypted_secret:string;encrypted_token:string;token_expires_at:string;scopes:string;synced_through:string|null;sync_since:string|null;sync_until:string|null;sync_cursor:string|null;lease_id:string|null;lease_until:string|null;last_result:string|null};
type Store=Connection&{workspace_id:string;signing_key:string};
export type ShopifyStatus={shop_domain:string;client_id:string;scopes:string[];synced_through:string|null;in_progress:boolean;last_result:SyncResult|null;pending:{order_id:string;reason:string}[]};
export type SyncResult={checked:number;imported:number;deferred:number;unattributed:number;testOrders:number;hasMore:boolean;at:string};
const one=<T>(db:D1Database,q:string,...args:unknown[])=>db.prepare(q).bind(...args).first<T>();
const all=async<T>(db:D1Database,q:string,...args:unknown[])=>(await db.prepare(q).bind(...args).all<T>()).results;
const parse=<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>=>{const r=schema.safeParse(input);if(!r.success)throw new AppError(400,r.error.issues[0]?.message||'Check the Shopify settings.');return r.data;};
const credentialsSchema=z.object({shopDomain:shopDomainSchema,clientId:z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/),clientSecret:z.string().min(16).max(256).regex(/^[\x21-\x7e]+$/)}).strict();
async function responseJson(response:Response){
  if(!response.ok){await response.body?.cancel();throw new AppError(response.status===429?429:502,`Shopify did not accept the request (HTTP ${response.status}). Check the app installation, read_orders access and store organization.`);}
  const reader=response.body?.getReader();if(!reader)throw new AppError(502,'Shopify returned an empty response.');const parts:Uint8Array[]=[];let size=0;
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>1048576){await reader.cancel();throw new AppError(502,'Shopify response exceeds the pilot limit.');}parts.push(next.value);}
  const bytes=new Uint8Array(size);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new AppError(502,'Shopify returned an invalid response.');}
}
async function requestJson(fetcher:Fetcher,url:string,init:RequestInit){try{return await responseJson(await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)}));}catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'The Shopify request could not be completed. Check the store connection and try again.');}}
async function graph<T>(fetcher:Fetcher,domain:string,token:string,query:string,variables:Record<string,unknown>={}){
  const result=await requestJson(fetcher,`https://${domain}/admin/api/${SHOPIFY_VERSION}/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables})});
  const r=result as {data?:T;errors?:{extensions?:{code?:string}}[]};if(Array.isArray(r?.errors)&&r.errors.some(e=>e.extensions?.code==='THROTTLED'))throw new AppError(429,'Shopify is rate limiting this sync. Progress is saved; wait a few seconds and continue.');if(!r||typeof r!=='object'||r.errors?.length||!r.data)throw new AppError(502,'Shopify could not provide the requested order or session data. Check app scopes and protected-data permissions.');return r.data;
}
async function exchange(fetcher:Fetcher,domain:string,clientId:string,secret:string){
  const raw=await requestJson(fetcher,`https://${domain}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:secret}).toString()});
  const token=z.object({access_token:z.string().min(8).max(512),scope:z.string().max(5000),expires_in:z.number().int().min(60).max(86400)}).safeParse(raw);if(!token.success)throw new AppError(502,'Shopify returned an invalid access token response.');const scopes=token.data.scope.split(',').map(s=>s.trim());if(!scopes.includes('read_orders'))throw new AppError(409,'Install the app with read_orders access before connecting.');return {...token.data,scopes};
}
async function stableId(value:string){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}

export function shopify(db:D1Database,identity:Identity,key:string|undefined,fetcher:Fetcher=fetch){
  const s=service(db,identity),now=()=>new Date().toISOString();
  const workspace=async()=>{const w=await s.workspace();if(!w)throw new AppError(404,'Create your business workspace first.');return w;};
  const store=async()=>{const w=await workspace();return one<Store>(db,'SELECT * FROM store_connections WHERE workspace_id=?',w.id);};
  const account=(id:string)=>one<Account>(db,'SELECT * FROM shopify_accounts WHERE store_id=?',id);
  async function tokenFor(a:Account){
    if(Date.parse(a.token_expires_at)>Date.now()+60000)return openPayment<string>(a.encrypted_token,key,`shopify/token/${a.store_id}`);
    const secret=await openPayment<string>(a.encrypted_secret,key,`shopify/secret/${a.store_id}`),fresh=await exchange(fetcher,a.shop_domain,a.client_id,secret),encrypted=await sealPayment(fresh.access_token,key,`shopify/token/${a.store_id}`);
    await db.prepare('UPDATE shopify_accounts SET encrypted_token=?,token_expires_at=?,scopes=? WHERE store_id=? AND encrypted_secret=?').bind(encrypted,new Date(Date.now()+fresh.expires_in*1000).toISOString(),fresh.scopes.join(','),a.store_id,a.encrypted_secret).run();return fresh.access_token;
  }
  async function defer(c:Store,gid:string,reason:string,revision?:number){
    const external=/^gid:\/\/shopify\/Order\/([1-9][0-9]{0,19})$/.exec(gid)?.[1];if(!external)throw new AppError(502,'Invalid Shopify order ID.');
    const known=await one<{revision:number}>(db,'SELECT revision FROM orders WHERE store_id=? AND external_id=?',c.id,external);
    const statements=[db.prepare('INSERT INTO shopify_pending (store_id,order_id,reason,updated_at,source_revision) VALUES (?,?,?,?,?) ON CONFLICT(store_id,order_id) DO UPDATE SET reason=CASE WHEN excluded.source_revision>=shopify_pending.source_revision THEN excluded.reason ELSE shopify_pending.reason END,source_revision=MAX(shopify_pending.source_revision,excluded.source_revision),updated_at=excluded.updated_at').bind(c.id,gid,reason,now(),revision||known?.revision||0)];
    // Pending source data holds payable commission through shared read/approval SQL.
    // The last verified financial snapshot stays intact so an identical healthy retry can release the hold.
    await db.batch(statements);
  }
  async function ingest(c:Store,gid:string,raw:unknown):Promise<'imported'|'deferred'|'unattributed'|'testOrders'>{
    const external=gid.split('/').at(-1)!,existing=await one<{referral_id:string;revision:number}>(db,'SELECT referral_id,revision FROM orders WHERE store_id=? AND external_id=?',c.id,external);
    try{
      let incomingRevision:number|undefined;try{if(raw&&typeof raw==='object'&&'updatedAt' in raw&&typeof raw.updatedAt==='string')incomingRevision=sourceRevision(raw.updatedAt);}catch{}
      if(existing&&incomingRevision&&incomingRevision<existing.revision)return 'imported';
      const hold=await one<{source_revision:number}>(db,'SELECT source_revision FROM shopify_pending WHERE store_id=? AND order_id=?',c.id,gid);if(hold&&incomingRevision&&incomingRevision<hold.source_revision)return 'deferred';
      const normalized=normalizeShopifyOrder(raw);if(normalized.order.id!==gid)throw new ShopifyReview('Shopify returned another order ID.');
      if(normalized.test){await db.prepare('DELETE FROM shopify_pending WHERE store_id=? AND order_id=?').bind(c.id,gid).run();return 'testOrders';}
      const {order:o,snapshot}=normalized;
      if(Date.parse(o.createdAt)<Date.parse(c.created_at)){await db.prepare('DELETE FROM shopify_pending WHERE store_id=? AND order_id=?').bind(c.id,gid).run();return 'unattributed';}
      let referralId=existing?.referral_id;
      if(!referralId){
        const program=await one<{id:string;rate_bps:number;window_days:number}>(db,'SELECT id,rate_bps,window_days FROM programs WHERE workspace_id=?',c.workspace_id);if(!program)throw new AppError(409,'Store program is missing.');
        const candidate=referralCandidate(o,program.id,30);if(!candidate||Date.parse(candidate.occurredAt)<Date.parse(c.created_at)){await db.prepare('DELETE FROM shopify_pending WHERE store_id=? AND order_id=?').bind(c.id,gid).run();return 'unattributed';}
        const application=await one(db,'SELECT id FROM applications WHERE id=? AND program_id=?',candidate.applicationId,program.id);if(!application){await db.prepare('DELETE FROM shopify_pending WHERE store_id=? AND order_id=?').bind(c.id,gid).run();return 'unattributed';}
        const rule=await one<{rate_bps:number;window_days:number;active:number}>(db,'SELECT rate_bps,window_days,active FROM program_rule_revisions WHERE program_id=? AND effective_at<=? ORDER BY effective_at DESC,rowid DESC LIMIT 1',program.id,candidate.occurredAt);if(!rule)throw new ShopifyReview('Historical program rules are unavailable for this session.');
        if(!rule.active||Date.parse(o.createdAt)-Date.parse(candidate.occurredAt)>Math.min(30,rule.window_days)*86400000){await db.prepare('DELETE FROM shopify_pending WHERE store_id=? AND order_id=?').bind(c.id,gid).run();return 'unattributed';}
        referralId=await stableId(`${c.id}/visit/${candidate.visitId}/${candidate.applicationId}`);
        await db.prepare('INSERT INTO referrals (id,store_id,application_id,rate_bps,created_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(referralId,c.id,candidate.applicationId,rule.rate_bps,candidate.occurredAt,new Date(Date.parse(candidate.occurredAt)+Math.min(30,rule.window_days)*86400000).toISOString()).run();
      }
      const body=JSON.stringify({...snapshot,referralId}),event=await stableId(`${c.id}/order/${gid}/${snapshot.revision}`),timestamp=String(Math.floor(Date.now()/1000)),signature=await signStoreRequest(c.signing_key,timestamp,event,body);
      await receiveStoreEvent(db,new Request('https://internal.affimaro/api/shopify/import',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':c.id,'X-Affimaro-Event':event,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Signature':signature},body}),new Date(),'shopify');
      await db.prepare('DELETE FROM shopify_pending WHERE store_id=? AND order_id=?').bind(c.id,gid).run();return 'imported';
    }catch(e){if(!(e instanceof ShopifyReview)&&!(e instanceof AppError&&[400,403,409].includes(e.status)))throw e;let revision:number|undefined;try{if(raw&&typeof raw==='object'&&'updatedAt' in raw&&typeof raw.updatedAt==='string')revision=sourceRevision(raw.updatedAt);}catch{}await defer(c,gid,e.message,revision);return 'deferred';}
  }
  return {
    async status():Promise<ShopifyStatus|null>{
      const c=await store();if(!c||c.platform!=='shopify')return null;const a=await account(c.id);if(!a)return null;
      return {shop_domain:a.shop_domain,client_id:a.client_id,scopes:a.scopes.split(','),synced_through:a.synced_through,in_progress:!!a.sync_until,last_result:a.last_result?JSON.parse(a.last_result):null,pending:await all(db,'SELECT order_id,reason FROM shopify_pending WHERE store_id=? ORDER BY updated_at ASC LIMIT 20',c.id)};
    },
    async connect(input:unknown){
      const value=parse(credentialsSchema,input),w=await workspace(),existing=await store();if(existing&&existing.platform!=='shopify')throw new AppError(409,'This workspace already has a WooCommerce store. One store is supported per workspace.');
      const p=await one<{window_days:number}>(db,'SELECT window_days FROM programs WHERE workspace_id=?',w.id);if(p&&p.window_days>30)throw new AppError(409,'Set your program attribution window to 30 days or less before connecting Shopify.');
      const previous=existing?await account(existing.id):null;if(previous?.lease_until&&Date.parse(previous.lease_until)>Date.now())throw new AppError(409,'Wait for the current sync before replacing credentials.');
      const id=existing?.id||crypto.randomUUID(),secret=await sealPayment(value.clientSecret,key,`shopify/secret/${id}`),token=await exchange(fetcher,value.shopDomain,value.clientId,value.clientSecret);
      const meta=await graph<{shop:{id:string;myshopifyDomain:string;primaryDomain:{url:string}};orders:unknown}>(fetcher,value.shopDomain,token.access_token,'query AffimaroVerify { shop { id myshopifyDomain primaryDomain { url } } orders(first:1) { nodes { id } } }');
      const metadata=z.object({shop:z.object({id:z.string().regex(/^gid:\/\/shopify\/Shop\/[0-9]+$/),myshopifyDomain:shopDomainSchema,primaryDomain:z.object({url:z.string().url()})})}).safeParse(meta);if(!metadata.success||metadata.data.shop.myshopifyDomain!==value.shopDomain||previous&&previous.shop_id!==metadata.data.shop.id)throw new AppError(409,'Shopify identity does not match the specified store.');
      const url=new URL(metadata.data.shop.primaryDomain.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new AppError(409,'The Shopify storefront must use HTTPS.');const encryptedToken=await sealPayment(token.access_token,key,`shopify/token/${id}`),time=now();
      const statements=[existing?db.prepare('UPDATE store_connections SET store_url=?,active=1,last_seen=? WHERE id=? AND workspace_id=?').bind(url.origin,time,id,w.id):db.prepare("INSERT INTO store_connections (id,workspace_id,store_url,signing_key,active,last_seen,created_at,platform) VALUES (?,?,?,?,1,?,?,'shopify')").bind(id,w.id,url.origin,Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),time,time),
        db.prepare('INSERT INTO shopify_accounts (store_id,shop_domain,shop_id,client_id,encrypted_secret,encrypted_token,token_expires_at,scopes) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET shop_domain=excluded.shop_domain,client_id=excluded.client_id,encrypted_secret=excluded.encrypted_secret,encrypted_token=excluded.encrypted_token,token_expires_at=excluded.token_expires_at,scopes=excluded.scopes').bind(id,value.shopDomain,metadata.data.shop.id,value.clientId,secret,encryptedToken,new Date(Date.now()+token.expires_in*1000).toISOString(),token.scopes.join(',')),
        db.prepare('INSERT INTO program_rule_revisions (id,program_id,rate_bps,window_days,active,effective_at) SELECT ?,id,rate_bps,window_days,active,? FROM programs WHERE workspace_id=?').bind(crypto.randomUUID(),time,w.id),
        db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),w.id,identity.userId,'shopify_connected',time)];
      await db.batch(statements);return {connected:true};
    },
    async setActive(input:unknown){
      const {active}=parse(z.object({active:z.boolean()}).strict(),input),c=await store();if(!c||c.platform!=='shopify')throw new AppError(404,'Shopify store not found.');await db.batch([db.prepare('UPDATE store_connections SET active=? WHERE id=? AND workspace_id=?').bind(active?1:0,c.id,c.workspace_id),db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),c.workspace_id,identity.userId,active?'shopify_resumed':'shopify_paused',now())]);return {active};
    },
    async sync(){
      const c=await store();if(!c||c.platform!=='shopify'||!c.active)throw new AppError(409,'Connect and resume Shopify before syncing.');const lease=crypto.randomUUID(),start=now();
      await db.prepare('UPDATE shopify_accounts SET lease_id=?,lease_until=? WHERE store_id=? AND (lease_until IS NULL OR lease_until<=?)').bind(lease,new Date(Date.now()+120000).toISOString(),c.id,start).run();
      const a=await account(c.id);if(!a||a.lease_id!==lease)throw new AppError(409,'A Shopify sync is already running.');
      const result:SyncResult={checked:0,imported:0,deferred:0,unattributed:0,testOrders:0,hasMore:false,at:start};
      try{
        const token=await tokenFor(a),since=a.sync_since||new Date(Math.max(Date.parse(c.created_at)-300000,Date.parse(a.synced_through||c.created_at)-900000)).toISOString(),until=a.sync_until||start;
        await db.prepare('UPDATE shopify_accounts SET sync_since=?,sync_until=? WHERE store_id=? AND lease_id=?').bind(since,until,c.id,lease).run();
        const retries=await all<{order_id:string}>(db,'SELECT order_id FROM shopify_pending WHERE store_id=? ORDER BY updated_at ASC LIMIT 2',c.id),seen=new Set<string>();
        for(const pending of retries){await db.prepare('UPDATE shopify_pending SET updated_at=? WHERE store_id=? AND order_id=?').bind(now(),c.id,pending.order_id).run();const data=await graph<{order:unknown}>(fetcher,a.shop_domain,token,`query AffimaroRetry($id:ID!) { order(id:$id) { ${ORDER_FIELDS} } }`,{id:pending.order_id});if(!data.order){await defer(c,pending.order_id,'Order unavailable. Check historical-order permissions.');result.deferred++;continue;}result[await ingest(c,pending.order_id,data.order)]++;result.checked++;seen.add(pending.order_id);}
        const page=await graph<{orders:{edges:{cursor:string;node:{id:string}}[];pageInfo:{hasNextPage:boolean;endCursor:string|null}}}>(fetcher,a.shop_domain,token,'query AffimaroOrderPage($after:String,$filter:String!) { orders(first:3,after:$after,sortKey:UPDATED_AT,query:$filter) { edges { cursor node { id } } pageInfo { hasNextPage endCursor } } }',{after:a.sync_cursor,filter:`updated_at:>='${since}' updated_at:<='${until}'`});
        const parsed=z.object({orders:z.object({edges:z.array(z.object({cursor:z.string().min(1).max(4096),node:z.object({id:z.string().regex(/^gid:\/\/shopify\/Order\/[1-9][0-9]{0,19}$/)})})).max(3),pageInfo:z.object({hasNextPage:z.boolean(),endCursor:z.string().nullable()})})}).safeParse(page);if(!parsed.success||parsed.data.orders.pageInfo.hasNextPage&&!parsed.data.orders.edges.length)throw new AppError(502,'Shopify returned an invalid order page.');
        for(const edge of parsed.data.orders.edges){if(!seen.has(edge.node.id)){const data=await graph<{order:unknown}>(fetcher,a.shop_domain,token,`query AffimaroOrder($id:ID!) { order(id:$id) { ${ORDER_FIELDS} } }`,{id:edge.node.id});if(!data.order){await defer(c,edge.node.id,'Order unavailable. Check historical-order permissions.');result.deferred++;}else{result[await ingest(c,edge.node.id,data.order)]++;result.checked++;}}await db.prepare('UPDATE shopify_accounts SET sync_cursor=? WHERE store_id=? AND lease_id=?').bind(edge.cursor,c.id,lease).run();}
        result.hasMore=parsed.data.orders.pageInfo.hasNextPage;result.at=now();
        await db.batch([db.prepare('UPDATE shopify_accounts SET last_result=?,synced_through=CASE WHEN ?=0 THEN ? ELSE synced_through END,sync_since=CASE WHEN ?=0 THEN NULL ELSE sync_since END,sync_until=CASE WHEN ?=0 THEN NULL ELSE sync_until END,sync_cursor=CASE WHEN ?=0 THEN NULL ELSE sync_cursor END WHERE store_id=? AND lease_id=?').bind(JSON.stringify(result),result.hasMore?1:0,until,result.hasMore?1:0,result.hasMore?1:0,result.hasMore?1:0,c.id,lease),db.prepare('UPDATE store_connections SET last_seen=? WHERE id=?').bind(result.at,c.id),db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),c.workspace_id,identity.userId,'shopify_synced',result.at)]);return result;
      }finally{await db.prepare('UPDATE shopify_accounts SET lease_id=NULL,lease_until=NULL WHERE store_id=? AND lease_id=?').bind(c.id,lease).run();}
    },
  };
}
