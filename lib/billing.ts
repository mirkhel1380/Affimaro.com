import {planCatalog} from './pricing-catalog.mjs';
import type {Plan} from './plan-requests.ts';
import {z} from 'zod';
import {AppError,service,type Identity} from './service.ts';
import {openPayment,sealPayment} from './payment-crypto.ts';
import {STRIPE_VERSION} from './payment-connections.ts';
import {trustedPublicOrigin} from './public-origin.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';

type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
export type BillingConfig={plan?:Plan;secret?:string;platformId?:string;priceId?:string;mode:'test'|'live';liveEnabled:boolean;required:boolean;origin?:string;portalConfigurationId?:string};
export const BILLING_ORIGIN='https://affimaro-preview.kindsky66.chatgpt.site';
export type BillingAccount={id:string;workspace_id:string;platform_id:string;mode:'test'|'live';customer_id:string|null;subscription_id:string|null;price_id:string|null;amount:number|null;status:string;invoice_paid:number;period_start:number|null;period_end:number|null;cancel_at_period_end:number;last_verified_at:string|null;last_error:string|null};
type LockedAccount=BillingAccount&{lease_id:string|null;lease_until:string|null};
export type BillingCheckout={id:string;account_id:string;workspace_id:string;price_id:string;amount:number;return_origin:string;customer_snapshot:string|null;payload_version:number;integration_suffix:string|null;state:string;session_id:string|null;expires_at:number|null;first_submitted_at:string;last_error:string|null};
export type BillingQuote={amount:number;currency:'USD';interval:'month';mode:'live'|'test';reviewToken:string;expiresAt:string};
const uuid=z.string().uuid(),id=(prefix:string)=>z.string().regex(new RegExp('^'+prefix+'[A-Za-z0-9]{6,160}$'));
const accountId=id('acct_'),priceId=id('price_'),customerId=id('cus_'),subscriptionId=id('sub_'),sessionId=z.string().regex(/^cs_(?:test|live)_[A-Za-z0-9]{6,200}$/);
const epoch=z.number().int().positive().max(253402300799),amount=z.number().int().positive().max(99_999_999);
const priceSchema=z.object({id:priceId,object:z.literal('price'),active:z.boolean(),livemode:z.boolean(),currency:z.literal('usd'),type:z.literal('recurring'),billing_scheme:z.literal('per_unit'),unit_amount:amount,custom_unit_amount:z.null(),transform_quantity:z.null(),recurring:z.object({interval:z.literal('month'),interval_count:z.literal(1),usage_type:z.literal('licensed')})});
const sessionSchema=z.object({id:sessionId,object:z.literal('checkout.session'),livemode:z.boolean(),mode:z.literal('subscription'),client_reference_id:uuid,metadata:z.record(z.string()),status:z.enum(['open','complete','expired']),payment_status:z.enum(['paid','unpaid','no_payment_required']),customer:customerId.nullable(),subscription:subscriptionId.nullable(),currency:z.literal('usd'),amount_subtotal:amount,amount_total:z.number().int().min(0).max(99_999_999),expires_at:epoch,url:z.string().nullable()});
const subSchema=z.object({id:subscriptionId,object:z.literal('subscription'),livemode:z.boolean(),customer:customerId,status:z.enum(['incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused']),metadata:z.record(z.string()),cancel_at_period_end:z.boolean(),items:z.object({data:z.array(z.object({quantity:z.literal(1),current_period_start:epoch,current_period_end:epoch,price:priceSchema})).length(1),has_more:z.literal(false)}),latest_invoice:z.object({object:z.literal('invoice'),status:z.string().nullable(),customer:customerId,currency:z.literal('usd')}).nullable()});
const reviewSchema=z.object({workspace:uuid,owner:z.string(),platform:accountId,price:priceId,amount,mode:z.enum(['test','live']),at:z.string().datetime()}).strict();
const accountFields='id,workspace_id,platform_id,mode,customer_id,subscription_id,price_id,amount,status,invoice_paid,period_start,period_end,cancel_at_period_end,last_verified_at,last_error';
const checkoutFields='id,account_id,workspace_id,price_id,amount,return_origin,customer_snapshot,payload_version,integration_suffix,state,session_id,expires_at,first_submitted_at,last_error';
const now=()=>new Date().toISOString();
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,'Check the subscription request.');return r.data;}
const one=<T>(db:D1Database,q:string,...args:unknown[])=>db.prepare(q).bind(...args).first<T>();
export function starterEntitled(row:BillingAccount|null,clock=Date.now()){
  return !!row&&row.mode==='live'&&row.status==='active'&&row.invoice_paid===1&&(row.period_start??Infinity)*1000<=clock+5000&&(row.period_end||0)*1000>clock&&!!row.last_verified_at&&Date.parse(row.last_verified_at)<=clock+5000&&Date.parse(row.last_verified_at)>=clock-900000;
}
export function billingConfigured(config:BillingConfig){return !!config.secret&&accountId.safeParse(config.platformId).success&&priceId.safeParse(config.priceId).success&&new RegExp(`^(?:sk|rk)_${config.mode}_[A-Za-z0-9]{12,240}$`).test(config.secret)&&(config.mode==='test'||config.liveEnabled);}
export function billingRedirect(value:string,kind:'checkout'|'portal'){
  let url:URL;try{url=new URL(value);}catch{throw new AppError(502,'Stripe returned an invalid billing link.');}
  const allowedPath=kind==='checkout'?(url.pathname.startsWith('/c/')||url.pathname.startsWith('/g/pay/')):url.pathname.startsWith('/p/');
  if(url.protocol!=='https:'||url.hostname!==(kind==='checkout'?'checkout.stripe.com':'billing.stripe.com')||url.port||url.username||url.password||!allowedPath)throw new AppError(502,'Stripe returned an unsupported billing link.');return url.href;
}
async function api(fetcher:Fetcher,config:BillingConfig,path:string,body?:URLSearchParams,idem?:string){
  const url=new URL('https://api.stripe.com'+path);
  const allowed=body?['/v1/checkout/sessions','/v1/billing_portal/sessions'].includes(path):path==='/v1/account'||path==='/v1/balance'||/^\/v1\/prices\/price_[A-Za-z0-9]{6,160}$/.test(path)||/^\/v1\/checkout\/sessions\/cs_(?:live|test)_[A-Za-z0-9]{6,200}$/.test(path)||/^\/v1\/subscriptions\/sub_[A-Za-z0-9]{6,160}\?expand%5B%5D=latest_invoice$/.test(path);
  if(url.origin!=='https://api.stripe.com'||!allowed)throw new AppError(500,'Unsupported subscription endpoint.');
  let response:Response;try{response=await fetcher(url.href,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.secret}`,'Stripe-Version':STRIPE_VERSION,Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded',...(idem?{'Idempotency-Key':idem}:{})}:{})},...(body?{body:body.toString()}:{})});}catch{throw new AppError(502,'Stripe did not confirm this billing request. Check its saved status before trying again.');}
  if(!response.ok){await response.body?.cancel();throw new AppError(response.status===429?429:502,'Stripe could not confirm billing. Check the configured account, permissions and saved status.');}
  const reader=response.body?.getReader();if(!reader)throw new AppError(502,'Stripe returned an empty billing response.');const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>262144){await reader.cancel();throw new AppError(502,'Stripe billing response exceeds the supported size.');}chunks.push(part.value);}}catch(error){if(error instanceof AppError)throw error;throw new AppError(502,'The billing response could not be read. Check its saved status.');}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new AppError(502,'Stripe returned an invalid billing response.');}
}
async function verifySource(config:BillingConfig,fetcher:Fetcher){
  if(!billingConfigured(config))throw new AppError(503,'Affimaro subscription checkout is not configured yet. No payment was started.');
  const a=z.object({id:accountId,object:z.literal('account')}).safeParse(await api(fetcher,config,'/v1/account'));
  const b=z.object({object:z.literal('balance'),livemode:z.boolean()}).safeParse(await api(fetcher,config,'/v1/balance'));
  if(!a.success||!b.success||a.data.id!==config.platformId||b.data.livemode!==(config.mode==='live'))throw new AppError(409,'The Affimaro billing account or environment could not be verified.');
}
async function verifyPrice(config:BillingConfig,fetcher:Fetcher){
  const parsed=priceSchema.safeParse(await api(fetcher,config,`/v1/prices/${config.priceId}`));
  if(!parsed.success||parsed.data.id!==config.priceId||!parsed.data.active||parsed.data.livemode!==(config.mode==='live')||parsed.data.unit_amount!==planCatalog[config.plan||'starter'].amount*100)throw new AppError(409,'The configured '+planCatalog[config.plan||'starter'].name+' price must match its approved fixed USD monthly package price.');
  return parsed.data;
}
// Read-only provider inspection. It never creates a customer, checkout or payment.
export async function inspectBillingConfiguration(config:BillingConfig,fetcher:Fetcher=fetch){
  const result={plan:config.plan||'starter',mode:config.mode,required:config.required,configured:billingConfigured(config)};
  if(!result.configured)return {...result,status:'not_configured' as const,message:'Connect the billing account and configure this monthly package.'};
  try{await verifySource(config,fetcher);await verifyPrice(config,fetcher);return {...result,status:config.mode==='live'?'live_ready' as const:'test_ready' as const,message:config.mode==='live'?'Account and monthly price verified with Stripe.':'Test account and monthly price verified. Live payments remain separate.'};}
  catch(error){return {...result,status:error instanceof AppError&&error.status===409?'attention' as const:'unavailable' as const,message:error instanceof AppError?error.message:'Stripe verification is temporarily unavailable.'};}
}
export function billing(db:D1Database,identity:Identity,config:BillingConfig,key?:string,fetcher:Fetcher=fetch){
  const s=service(db,identity),workspace=async()=>{const portal=await accountPortal(db,identity.userId);if(portal&&!businessPortal(portal))throw new AppError(403,'Affiliate and creator accounts are free. Subscriptions are only for brand and agency accounts.');const w=await s.workspace();if(!w)throw new AppError(404,'Create a business workspace before choosing a business subscription.');return w;};
  const current=(wid:string)=>one<BillingAccount>(db,`SELECT ${accountFields} FROM billing_accounts WHERE workspace_id=? AND platform_id=? AND mode=?`,wid,config.platformId||'',config.mode);
  const pending=(aid:string)=>one<BillingCheckout>(db,`SELECT ${checkoutFields} FROM billing_checkouts WHERE account_id=? AND state IN ('creating','open','review') ORDER BY rowid DESC LIMIT 1`,aid);
  const audit=(wid:string,action:string)=>db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),wid,identity.userId,action,now());
  const source=()=>verifySource(config,fetcher);
  const returnPath=async()=>await accountPortal(db,identity.userId)==='agency'?'/agency/billing':'/billing';
  const paidForPlan=(a:BillingAccount|null)=>starterEntitled(a)&&a?.price_id===config.priceId&&a?.amount===planCatalog[config.plan||'starter'].amount*100;
  async function quote(){await source();return verifyPrice(config,fetcher);}
  async function ensureAccount(wid:string){await db.prepare('INSERT OR IGNORE INTO billing_accounts (id,workspace_id,platform_id,mode,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),wid,config.platformId,config.mode,now(),now()).run();return (await current(wid))!;}
  async function lock(row:BillingAccount){const token=crypto.randomUUID();await db.prepare('UPDATE billing_accounts SET lease_id=?,lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)').bind(token,new Date(Date.now()+120000).toISOString(),row.id,now()).run();if((await one<LockedAccount>(db,'SELECT * FROM billing_accounts WHERE id=?',row.id))?.lease_id!==token)throw new AppError(409,'A billing operation is already running. Wait before checking again.');return token;}
  const unlock=(id:string,lease:string)=>db.prepare('UPDATE billing_accounts SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(id,lease).run();
  async function hold(a:BillingAccount,attempt:BillingCheckout|undefined,error:AppError){await db.batch([db.prepare('UPDATE billing_accounts SET last_error=?,updated_at=? WHERE id=?').bind(error.message,now(),a.id),...(attempt?[db.prepare("UPDATE billing_checkouts SET state='review',last_error=?,updated_at=? WHERE id=? AND state IN ('creating','open','review')").bind(error.message,now(),attempt.id)]:[]),audit(a.workspace_id,'subscription_needs_review')]);}
  function canStart(a:BillingAccount|null){if(a?.subscription_id&&!['canceled','incomplete_expired'].includes(a.status))throw new AppError(409,'Manage or recheck your existing subscription. A second subscription will not be created.');}
  async function saveSubscription(a:BillingAccount,raw:unknown,attempt?:BillingCheckout){
    const parsed=subSchema.safeParse(raw);if(!parsed.success)throw new AppError(502,'Stripe returned an unsupported subscription record.');const sub=parsed.data,item=sub.items.data[0];
    const correlation=attempt||await one<BillingCheckout>(db,`SELECT ${checkoutFields} FROM billing_checkouts WHERE id=? AND account_id=? AND workspace_id=?`,sub.metadata.affimaro_checkout||'',a.id,a.workspace_id);
    if(!correlation||sub.metadata.affimaro_workspace!==a.workspace_id||sub.metadata.affimaro_checkout!==correlation.id||sub.livemode!==(a.mode==='live')||sub.customer!==(attempt?attempt.customer_snapshot||sub.customer:a.customer_id)||a.subscription_id&&!['canceled','incomplete_expired'].includes(a.status)&&a.subscription_id!==sub.id||item.price.id!==correlation.price_id||item.price.unit_amount!==correlation.amount||item.price.livemode!==sub.livemode||item.current_period_end<=item.current_period_start||sub.latest_invoice&&sub.latest_invoice.customer!==sub.customer)throw new AppError(409,'Stripe subscription identity, customer, price or period does not match the saved checkout.');
    const paid=sub.latest_invoice?.status==='paid';
    await db.batch([db.prepare('UPDATE billing_accounts SET customer_id=?,subscription_id=?,price_id=?,amount=?,status=?,invoice_paid=?,period_start=?,period_end=?,cancel_at_period_end=?,last_verified_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(sub.customer,sub.id,item.price.id,item.price.unit_amount,sub.status,paid?1:0,item.current_period_start,item.current_period_end,sub.cancel_at_period_end?1:0,now(),now(),a.id),db.prepare("UPDATE billing_checkouts SET state='completed',last_error=NULL,updated_at=? WHERE id=? AND account_id=?").bind(now(),correlation.id,a.id),audit(a.workspace_id,'subscription_checked')]);
    return current(a.workspace_id);
  }
  async function readSubscription(a:BillingAccount,subscription:string,attempt?:BillingCheckout){const raw=await api(fetcher,config,`/v1/subscriptions/${subscription}?expand%5B%5D=latest_invoice`);if(!raw||typeof raw!=='object'||!('id' in raw)||raw.id!==subscription)throw new AppError(409,'Stripe returned another subscription.');return saveSubscription(a,raw,attempt);}
  async function acceptSession(a:BillingAccount,attempt:BillingCheckout,raw:unknown){
    const parsed=sessionSchema.safeParse(raw);if(!parsed.success)throw new AppError(502,'Stripe returned an unsupported subscription checkout.');const session=parsed.data;
    if(session.client_reference_id!==a.workspace_id||session.metadata.affimaro_workspace!==a.workspace_id||session.metadata.affimaro_checkout!==attempt.id||session.livemode!==(a.mode==='live')||!session.id.startsWith(`cs_${a.mode}_`)||attempt.session_id&&session.id!==attempt.session_id||attempt.customer_snapshot&&session.customer!==attempt.customer_snapshot||session.amount_subtotal!==attempt.amount||session.amount_total!==attempt.amount)throw new AppError(409,'Stripe checkout identity, environment or amount does not match the saved review.');
    if(session.status==='complete'){
      if(session.payment_status!=='paid'||!session.subscription||!session.customer)throw new AppError(409,'Stripe has not confirmed a paid subscription. Check billing status again later.');
      const updated=await readSubscription({...a,customer_id:session.customer},session.subscription,{...attempt,customer_snapshot:session.customer});
      if(updated?.customer_id!==session.customer||updated.subscription_id!==session.subscription)throw new AppError(409,'The paid subscription could not be linked safely.');return {outcome:'subscription',account:updated};
    }
    if(session.payment_status!=='unpaid'||session.subscription)throw new AppError(409,'The checkout payment and subscription state need review.');
    if(session.status==='expired'){await db.batch([db.prepare("UPDATE billing_checkouts SET state='expired',session_id=?,encrypted_url=NULL,expires_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(session.id,session.expires_at,now(),attempt.id),audit(a.workspace_id,'subscription_checkout_expired')]);return {outcome:'expired'};}
    if(!session.url||session.expires_at*1000<=Date.now())throw new AppError(409,'The saved checkout is no longer open. Check its billing status.');
    const url=billingRedirect(session.url,'checkout'),encrypted=await sealPayment(url,key,`billing-url/${a.workspace_id}/${attempt.id}`);
    await db.batch([db.prepare("UPDATE billing_checkouts SET state='open',session_id=?,encrypted_url=?,expires_at=?,last_error=NULL,updated_at=? WHERE id=? AND state IN ('creating','open','review')").bind(session.id,encrypted,session.expires_at,now(),attempt.id),audit(a.workspace_id,'subscription_checkout_opened')]);return {outcome:'checkout',url};
  }
  const apiObject={
    async dashboard(){
      const w=await workspace(),a=await current(w.id)||await one<BillingAccount>(db,`SELECT ${accountFields} FROM billing_accounts WHERE workspace_id=? ORDER BY CASE mode WHEN 'live' THEN 0 ELSE 1 END,updated_at DESC LIMIT 1`,w.id);
      const usage=await one<{stores:number;programs:number;approved_partners:number;orders:number}>(db,"SELECT (SELECT COUNT(*) FROM store_connections WHERE workspace_id=w.id) AS stores,(SELECT COUNT(*) FROM programs WHERE workspace_id=w.id) AS programs,(SELECT COUNT(*) FROM applications a JOIN programs p ON p.id=a.program_id WHERE p.workspace_id=w.id AND a.status='approved') AS approved_partners,(SELECT COUNT(*) FROM orders o JOIN store_connections c ON c.id=o.store_id WHERE c.workspace_id=w.id) AS orders FROM workspaces w WHERE w.id=? AND w.owner_id=?",w.id,identity.userId);
      const p=a?await pending(a.id):null;
      const currentContext=!!a&&a.platform_id===config.platformId&&a.mode===config.mode;
      return {business:w.name,configured:billingConfigured(config),required:config.required,mode:config.mode,currentContext,account:a,entitled:currentContext&&paidForPlan(a),pending:p?{id:p.id,state:p.state,amount:p.amount,expires_at:p.expires_at,last_error:p.last_error}:null,usage,limits:{stores:1,programs:1,business_users:1}};
    },
    async preview(input:unknown):Promise<BillingQuote>{parse(z.object({}).strict(),input);const w=await workspace(),a=await current(w.id);canStart(a);const price=await quote(),at=now();const token=await sealPayment({workspace:w.id,owner:identity.userId,platform:config.platformId,price:price.id,amount:price.unit_amount,mode:config.mode,at},key,`billing-review/${w.id}/${identity.userId}`);return {amount:price.unit_amount,currency:'USD',interval:'month',mode:config.mode,reviewToken:token,expiresAt:new Date(Date.parse(at)+300000).toISOString()};},
    async checkout(input:unknown){
      const value=parse(z.object({reviewToken:z.string().min(20).max(6000),confirmed:z.literal(true)}).strict(),input),w=await workspace();let review:z.output<typeof reviewSchema>;
      try{review=reviewSchema.parse(await openPayment(value.reviewToken,key,`billing-review/${w.id}/${identity.userId}`));}catch{throw new AppError(400,'Open a new subscription review before continuing.');}
      if(review.workspace!==w.id||review.owner!==identity.userId||review.platform!==config.platformId||review.price!==config.priceId||review.mode!==config.mode||Date.now()-Date.parse(review.at)>300000||Date.parse(review.at)>Date.now()+5000)throw new AppError(409,'This subscription review expired or the billing configuration changed.');
      const price=await quote();if(price.unit_amount!==review.amount)throw new AppError(409,'The price changed. Review it again.');let a=await ensureAccount(w.id);const lease=await lock(a);let attempt:BillingCheckout|undefined;
      try{
        a=(await current(w.id))!;canStart(a);attempt=await pending(a.id)||undefined;
        if(attempt?.session_id){const result=await acceptSession(a,attempt,await api(fetcher,config,`/v1/checkout/sessions/${attempt.session_id}`));if(result.outcome!=='expired')return result;attempt=undefined;}
        if(attempt&&(attempt.price_id!==review.price||attempt.amount!==review.amount))throw new AppError(409,'An earlier checkout needs review before changing its price.');
        if(attempt&&Date.now()-Date.parse(attempt.first_submitted_at)>23*3600000)throw new AppError(409,'This unknown checkout is older than the safe retry window. Review it in Stripe before creating another subscription.');
        if(!attempt){const id=crypto.randomUUID(),at=now();await db.batch([db.prepare("INSERT INTO billing_checkouts (id,account_id,workspace_id,price_id,amount,return_origin,customer_snapshot,payload_version,integration_suffix,state,first_submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,2,?,'creating',?,?,?)").bind(id,a.id,w.id,review.price,review.amount,trustedPublicOrigin(config.origin),a.customer_id,Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>String.fromCharCode(97+n%26)).join(''),at,at,at),audit(w.id,'subscription_checkout_started')]);attempt=(await pending(a.id))!;}
        // Legacy unknown POSTs are held instead of changing their frozen payload.
        if(attempt.payload_version!==2||!attempt.integration_suffix||!/^[a-z]{8}$/.test(attempt.integration_suffix))throw new AppError(409,'This older checkout needs reconciliation before a new payment can be opened.');
        const path='/billing';
        const body=new URLSearchParams({mode:'subscription','line_items[0][price]':attempt.price_id,'line_items[0][quantity]':'1',integration_identifier:'affimaro_checkout_'+attempt.integration_suffix,'subscription_data[billing_mode][type]':'flexible','allow_promotion_codes':'false','adaptive_pricing[enabled]':'false','automatic_tax[enabled]':'false',success_url:trustedPublicOrigin(attempt.return_origin)+path+'?checkout_return=1',cancel_url:trustedPublicOrigin(attempt.return_origin)+path+'?checkout_cancelled=1',client_reference_id:w.id,'metadata[affimaro_workspace]':w.id,'metadata[affimaro_checkout]':attempt.id,'subscription_data[metadata][affimaro_workspace]':w.id,'subscription_data[metadata][affimaro_checkout]':attempt.id,...(attempt.customer_snapshot?{customer:attempt.customer_snapshot}:{})});
        return await acceptSession(a,attempt,await api(fetcher,config,'/v1/checkout/sessions',body,`affimaro-subscription-${attempt.id}`));
      }catch(error){if(error instanceof AppError)await hold(a,attempt,error);throw error;}finally{await unlock(a.id,lease);}
    },
    async refresh(input:unknown){
      parse(z.object({}).strict(),input);const w=await workspace();let a=await current(w.id);if(!a)throw new AppError(404,'No saved subscription checkout is available to check.');const lease=await lock(a);let attempt:BillingCheckout|undefined;
      try{a=(await current(w.id))!;await source();attempt=await pending(a.id)||undefined;if(attempt){if(!attempt.session_id)throw new AppError(409,'The checkout result is unknown. Open a fresh review to retry the same saved attempt safely.');return await acceptSession(a,attempt,await api(fetcher,config,`/v1/checkout/sessions/${attempt.session_id}`));}if(!a.subscription_id)throw new AppError(404,'No subscription is saved.');return {outcome:'subscription',account:await readSubscription(a,a.subscription_id)};}
      catch(error){if(error instanceof AppError)await hold(a,attempt,error);throw error;}finally{await unlock(a.id,lease);}
    },
    // Only the signed webhook handler calls this; it is not a browser API action.
    async notification(reference:{checkoutId?:string;sessionId?:string}){
      const w=await workspace();let a=await current(w.id);if(!a)return {outcome:'ignored'};
      const lease=await lock(a);try{
        a=(await current(w.id))!;await source();
        if(a.subscription_id)return {outcome:'subscription',account:await readSubscription(a,a.subscription_id)};
        let attempt=reference.checkoutId?await one<BillingCheckout>(db,`SELECT ${checkoutFields} FROM billing_checkouts WHERE id=? AND account_id=? AND workspace_id=?`,reference.checkoutId,a.id,w.id):await pending(a.id);
        if(!attempt)return {outcome:'ignored'};
        const session=reference.sessionId||attempt.session_id;if(!session)return {outcome:'awaiting_payment'};
        if(attempt.session_id&&session!==attempt.session_id)throw new AppError(409,'The notification does not match the saved checkout.');
        const raw=await api(fetcher,config,`/v1/checkout/sessions/${session}`),checked=sessionSchema.safeParse(raw);
        if(!checked.success||checked.data.id!==session)throw new AppError(409,'The notified checkout could not be verified.');
        // Asynchronous completion is not fulfillment until Stripe confirms paid.
        if(checked.data.status==='complete'&&checked.data.payment_status!=='paid')return {outcome:'awaiting_payment'};
        return await acceptSession(a,attempt,raw);
      }finally{await unlock(a.id,lease);}
    },
    async portal(input:unknown){parse(z.object({}).strict(),input);const w=await workspace(),a=await current(w.id);if(!a?.customer_id||!a.subscription_id)throw new AppError(404,'A verified Stripe subscription customer is required.');await source();const raw=z.object({object:z.literal('billing_portal.session'),customer:customerId,livemode:z.boolean(),url:z.string()}).safeParse(await api(fetcher,config,'/v1/billing_portal/sessions',new URLSearchParams({customer:a.customer_id,...(config.portalConfigurationId?{configuration:config.portalConfigurationId}:{}),return_url:trustedPublicOrigin(config.origin)+await returnPath()})));if(!raw.success||raw.data.customer!==a.customer_id||raw.data.livemode!==(a.mode==='live'))throw new AppError(502,'Stripe could not verify the subscription portal.');return {url:billingRedirect(raw.data.url,'portal')};},
    async ensureEntitlement(){if(!config.required)return;if(!billingConfigured(config)||config.mode!=='live')throw new AppError(503,'Live subscription billing must be configured before new paid business activity can be enabled.');const w=await workspace();let a=await current(w.id);if(paidForPlan(a))return;try{await apiObject.refresh({});}catch(error){if(error instanceof AppError&&[404,409].includes(error.status))throw new AppError(402,'An active subscription matching your approved package is required. Open Plans & billing to check or manage your subscription.');throw error;}a=await current(w.id);if(!paidForPlan(a))throw new AppError(402,'An active paid subscription matching your approved package is required for this action. Open Plans & billing.');},
  };
  return apiObject;
}
