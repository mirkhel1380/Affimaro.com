import {recipientIdentityApproved,requireRecipientIdentity} from './identity-policy.ts';
import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {sealPayment,openPayment,referenceHash} from './payment-crypto.ts';
import {STRIPE_VERSION,type PaymentConnection} from './payment-connections.ts';
import {stripeConnect} from './stripe-connect.ts';
import {stripeDestinationSchema,STRIPE_PILOT_LIMIT,type StripeDestination,type StripeTransferReceipt} from './stripe-destination.ts';
import {payoutPublicFields,type Payout} from './payments.ts';
import {coverageFor} from './payment-balance.ts';
import {sourceReady} from './commission-query.ts';

type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type RequestRow=Payout&{encrypted_destination:string};
type Source=PaymentConnection&{encrypted_credential:string};
type Attempt={id:string;request_id:string;workspace_id:string;recipient_id:string;platform_id:string;account_id:string;amount:number;state:string;stripe_transfer_id:string|null;first_submitted_at:string;last_error:string|null;lease_id:string|null;lease_until:string|null};
export type TransferPreview={requestId:string;amount:number;currency:'USD';destination:string;platform:string;available:number;reviewToken:string;expiresAt:string;retry:boolean};
const one=<T>(db:D1Database,q:string,...args:unknown[])=>db.prepare(q).bind(...args).first<T>();
const uuid=z.string().uuid(),requestSchema=z.object({requestId:uuid}).strict();
const reviewSchema=z.object({requestId:uuid,amount:z.number().int().positive(),destination:z.string(),platform:z.string(),recipientId:uuid,connectionId:uuid,at:z.string().datetime()}).strict();
const transferSchema=z.object({id:z.string().regex(/^tr_[A-Za-z0-9]{6,100}$/),object:z.literal('transfer'),amount:z.number().int().positive().max(STRIPE_PILOT_LIMIT),amount_reversed:z.number().int().min(0),created:z.number().int().positive().safe(),currency:z.literal('usd'),destination:z.string(),livemode:z.literal(true),metadata:z.record(z.string(),z.string()),transfer_group:z.string(),reversed:z.boolean(),source_transaction:z.null()});
function parse<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>{const r=schema.safeParse(input);if(!r.success)throw new AppError(400,'Check the Stripe transfer request.');return r.data;}
class RejectedBalance extends AppError{constructor(){super(409,'Stripe rejected the transfer because the business has insufficient available balance. Add funds or review your Stripe balance before trying again.');}}
async function api(fetcher:Fetcher,path:string,secret:string,body?:URLSearchParams,idempotency?:string){
  const url=new URL(`https://api.stripe.com${path}`),list=url.pathname==='/v1/transfers'&&!body;
  const allowed=url.origin==='https://api.stripe.com'&&(body?url.pathname==='/v1/transfers'&&!url.search:path==='/v1/account'||path==='/v1/balance'||/^\/v1\/transfers\/tr_[A-Za-z0-9]{6,100}$/.test(path)||list&&url.searchParams.get('limit')==='2'&&/^affimaro_[a-f0-9-]{36}$/.test(url.searchParams.get('transfer_group')||'')&&[...url.searchParams.keys()].length===2);
  if(!allowed)throw new AppError(500,'Unsupported Stripe transfer endpoint.');let response:Response;
  try{response=await fetcher(url.toString(),{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':STRIPE_VERSION,Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency!}:{})},...(body?{body:body.toString()}:{})});}
  catch{throw new AppError(502,'Stripe did not confirm the transfer result. Check its status before retrying.');}
  const reader=response.body?.getReader();if(!reader)throw new AppError(502,'Stripe returned an empty response.');const parts:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();throw new AppError(502,'Stripe response exceeds the supported size.');}parts.push(part.value);}}
  catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'Stripe response could not be read. Check the saved transfer status.');}
  const bytes=new Uint8Array(size);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError(502,'Stripe returned an invalid response.');}
  if(!response.ok){const error=z.object({error:z.object({code:z.string().optional()})}).safeParse(raw);if(body&&response.status===400&&error.success&&error.data.error.code==='balance_insufficient')throw new RejectedBalance();throw new AppError(response.status===429?429:502,'Stripe did not confirm this request. Check the business account permissions and saved transfer status.');}return raw;
}
export function stripeTransfers(db:D1Database,identity:Identity,key?:string,fetcher:Fetcher=fetch){
  const now=()=>new Date().toISOString();
  const owned=async(id:string)=>{const row=await one<RequestRow>(db,'SELECT pr.* FROM payout_requests pr JOIN workspaces w ON w.id=pr.workspace_id WHERE pr.id=? AND w.owner_id=?',id,identity.userId);if(!row)throw new AppError(404,'Payment request not found in your business.');if(row.method!=='stripe'||row.currency!=='USD'||row.decimals!==2||row.amount>STRIPE_PILOT_LIMIT)throw new AppError(409,'This request does not support the USD Stripe transfer pilot.');return row;};
  const publicRequest=(id:string)=>one<Payout>(db,`SELECT ${payoutPublicFields} FROM payout_requests WHERE id=?`,id);
  const audit=(workspace:string,action:string)=>db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),workspace,identity.userId,action,now());
  async function destination(row:RequestRow){const raw=await openPayment<StripeDestination>(row.encrypted_destination,key,`stripe-destination/${row.affiliate_user_id}/${row.id}`),parsed=stripeDestinationSchema.safeParse(raw);if(!parsed.success||parsed.data.workspaceId!==row.workspace_id||parsed.data.applicationId!==row.application_id)throw new AppError(409,'The saved Stripe destination could not be verified.');return parsed.data;}
  async function source(row:RequestRow,d:StripeDestination){
    const c=await one<Source>(db,"SELECT * FROM payment_connections WHERE workspace_id=? AND provider='stripe'",row.workspace_id);if(!c||c.status!=='verified'||c.mode!=='live'||c.external_id!==d.platformId||c.country!==d.country)throw new AppError(409,'Recheck the original live Stripe business account before sending or checking this request.');
    const secret=await openPayment<string>(c.encrypted_credential,key,`provider/${c.workspace_id}/stripe/${c.id}`);if(!secret.startsWith('rk_live_')&&!secret.startsWith('sk_live_'))throw new AppError(409,'A live Stripe credential is required.');
    const account=z.object({id:z.string(),object:z.literal('account'),country:z.string()}).safeParse(await api(fetcher,'/v1/account',secret)),balance=z.object({object:z.literal('balance'),livemode:z.literal(true),available:z.array(z.object({currency:z.string(),amount:z.number().int().safe()})).max(100)}).safeParse(await api(fetcher,'/v1/balance',secret));
    if(!account.success||!balance.success||account.data.id!==d.platformId||account.data.country!==d.country)throw new AppError(409,'Stripe business identity or live environment could not be confirmed.');const usd=balance.data.available.filter(item=>item.currency==='usd');if(usd.length>1)throw new AppError(502,'Stripe returned an ambiguous USD balance.');return {c,secret,available:usd[0]?.amount||0};
  }
  async function eligible(row:RequestRow,d:StripeDestination){
    await requireRecipientIdentity(db,row.affiliate_user_id);
    await stripeConnect(db,identity,key,fetcher).check({recipientId:d.recipientId});
    const recipient=await one(db,"SELECT r.id FROM stripe_recipients r WHERE r.id=? AND r.workspace_id=? AND r.application_id=? AND r.affiliate_user_id=? AND r.account_id=? AND r.platform_id=? AND r.mode='live' AND r.country=? AND r.state='ready' AND r.last_checked_at>=?",d.recipientId,row.workspace_id,row.application_id,row.affiliate_user_id,d.accountId,d.platformId,d.country,new Date(Date.now()-300000).toISOString());if(!recipient)throw new AppError(409,'The original Stripe receiving account is not ready.');
    const funding=await source(row,d);if(funding.available<row.amount)throw new AppError(409,'The business Stripe account has insufficient available USD balance.');
    if(!await one(db,`SELECT id FROM payout_requests WHERE id=? AND status IN ('approved','processing') AND ${coverageFor()} AND ${sourceReady('payout_requests.application_id')}`,row.id))throw new AppError(409,'Commission coverage changed or a recent complete Shopify sync is required.');return funding;
  }
  const attemptFor=(id:string)=>one<Attempt>(db,"SELECT * FROM stripe_transfer_attempts WHERE request_id=? AND state IN ('processing','review','succeeded') ORDER BY rowid DESC LIMIT 1",id);
  async function lock(a:Attempt){const lease=crypto.randomUUID(),at=now();await db.prepare('UPDATE stripe_transfer_attempts SET lease_id=?,lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)').bind(lease,new Date(Date.now()+120000).toISOString(),a.id,at).run();if((await one<Attempt>(db,'SELECT * FROM stripe_transfer_attempts WHERE id=?',a.id))?.lease_id!==lease)throw new AppError(409,'A transfer operation is already running. Wait before checking or retrying.');return lease;}
  async function lookup(a:Attempt,secret:string){
    if(a.stripe_transfer_id)return api(fetcher,`/v1/transfers/${a.stripe_transfer_id}`,secret);
    const raw=await api(fetcher,`/v1/transfers?transfer_group=affimaro_${a.id}&limit=2`,secret),list=z.object({object:z.literal('list'),data:z.array(z.unknown()).max(2),has_more:z.boolean()}).safeParse(raw);if(!list.success||list.data.has_more||list.data.data.length>1)throw new AppError(409,'Stripe transfer lookup needs review. No new transfer was sent.');return list.data.data[0]||null;
  }
  async function settle(row:RequestRow,a:Attempt,raw:unknown){
    const parsed=transferSchema.safeParse(raw);if(!parsed.success)throw new AppError(502,'Stripe did not provide a verified live USD transfer.');const transfer=parsed.data;
    if(transfer.amount!==row.amount||a.amount!==row.amount||transfer.destination!==a.account_id||transfer.transfer_group!==`affimaro_${a.id}`||transfer.metadata.affimaro_attempt!==a.id||transfer.metadata.affimaro_request!==row.id||transfer.metadata.affimaro_workspace!==row.workspace_id||a.stripe_transfer_id&&a.stripe_transfer_id!==transfer.id||transfer.amount_reversed>transfer.amount||transfer.reversed!==(transfer.amount_reversed===transfer.amount)||transfer.created*1000<Date.parse(a.first_submitted_at)-300000||transfer.created*1000>Date.now()+300000)throw new AppError(409,'Stripe transfer amount, destination or identity does not match the saved request.');
    const reversed=Math.max(row.reversed_amount,transfer.amount_reversed),paidDate=new Date(transfer.created*1000).toISOString().slice(0,10),receipt:StripeTransferReceipt={method:'stripe',reference:transfer.id,paidDate,receiptUrl:'',amount:row.amount,amountReversed:reversed,created:transfer.created},encrypted=await sealPayment(receipt,key,`receipt/${row.affiliate_user_id}/${row.id}`),hash=await referenceHash(`stripe/${transfer.id}`,row.workspace_id);
    await db.batch([
      db.prepare("UPDATE payout_requests SET status='transferred',stripe_transfer_id=?,reversed_amount=MAX(reversed_amount,?),encrypted_receipt=?,reference_hash=?,paid_date=?,paid_by=?,reason=NULL,updated_at=? WHERE id=? AND method='stripe' AND status IN ('processing','transferred') AND (stripe_transfer_id IS NULL OR stripe_transfer_id=?)").bind(transfer.id,reversed,encrypted,hash,paidDate,identity.userId,now(),row.id,transfer.id),
      db.prepare("UPDATE stripe_transfer_attempts SET state='succeeded',stripe_transfer_id=?,last_error=NULL,last_checked_at=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND status='transferred' AND stripe_transfer_id=?)").bind(transfer.id,now(),now(),a.id,row.id,transfer.id),
      db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payout_requests WHERE id=? AND status='transferred' AND stripe_transfer_id=?)").bind(crypto.randomUUID(),row.workspace_id,identity.userId,reversed>row.reversed_amount?'stripe_transfer_reversal_checked':'stripe_transfer_verified',now(),row.id,transfer.id),
    ]);
    const saved=await publicRequest(row.id);if(saved?.status!=='transferred'||saved.stripe_transfer_id!==transfer.id)throw new AppError(409,'Transfer verification could not be saved. Check the existing transfer before retrying.');return {outcome:'transferred',request:saved};
  }
  async function hold(row:RequestRow,a:Attempt,lease:string,error:AppError){
    const failed=error instanceof RejectedBalance;
    await db.batch([db.prepare('UPDATE stripe_transfer_attempts SET state=?,last_error=?,last_checked_at=?,updated_at=? WHERE id=? AND lease_id=? AND state IN (\'processing\',\'review\')').bind(failed?'failed':'review',error.message,now(),now(),a.id,lease),db.prepare("UPDATE payout_requests SET status=?,reason=?,updated_at=? WHERE id=? AND status='processing' AND EXISTS(SELECT 1 FROM stripe_transfer_attempts WHERE id=? AND state=?)").bind(failed?'approved':'processing',error.message,now(),row.id,a.id,failed?'failed':'review'),audit(row.workspace_id,failed?'stripe_transfer_rejected':'stripe_transfer_needs_review')]);return {outcome:failed?'rejected':'review',request:await publicRequest(row.id)};
  }
  return {
    async preview(input:unknown):Promise<TransferPreview>{const {requestId}=parse(requestSchema,input),row=await owned(requestId);if(!['approved','processing'].includes(row.status))throw new AppError(409,'Approve this Stripe request before reviewing a transfer.');const d=await destination(row),funding=await eligible(row,d),at=now(),token=await sealPayment({requestId:row.id,amount:row.amount,destination:d.accountId,platform:d.platformId,recipientId:d.recipientId,connectionId:funding.c.id,at},key,`stripe-review/${row.workspace_id}/${identity.userId}`);return {requestId:row.id,amount:row.amount,currency:'USD',destination:d.accountId,platform:d.platformId,available:funding.available,reviewToken:token,expiresAt:new Date(Date.parse(at)+300000).toISOString(),retry:row.status==='processing'};},
    async send(input:unknown){
      const value=parse(z.object({requestId:uuid,reviewToken:z.string().min(20).max(6000),confirmed:z.literal(true)}).strict(),input);let row=await owned(value.requestId);if(row.status==='transferred')return {outcome:'transferred',request:await publicRequest(row.id)};
      let review:z.output<typeof reviewSchema>;try{review=reviewSchema.parse(await openPayment(value.reviewToken,key,`stripe-review/${row.workspace_id}/${identity.userId}`));}catch{throw new AppError(400,'Open a new transfer review before confirming.');}
      const d=await destination(row);if(review.requestId!==row.id||review.amount!==row.amount||review.destination!==d.accountId||review.platform!==d.platformId||review.recipientId!==d.recipientId||Date.now()-Date.parse(review.at)>300000||Date.parse(review.at)>Date.now()+5000)throw new AppError(409,'This transfer review expired or changed. Review the current request again.');
      if(row.status==='approved'){
        const funding=await eligible(row,d);if(funding.c.id!==review.connectionId)throw new AppError(409,'The Stripe connection changed. Open a new review.');const candidate=crypto.randomUUID(),at=now();
        await db.batch([
          db.prepare(`INSERT INTO stripe_transfer_attempts (id,request_id,workspace_id,recipient_id,platform_id,account_id,amount,state,first_submitted_at,created_at,updated_at) SELECT ?,pr.id,pr.workspace_id,?,?,?,pr.amount,'processing',?,?,? FROM payout_requests pr JOIN payment_connections c ON c.workspace_id=pr.workspace_id AND c.provider='stripe' WHERE pr.id=? AND pr.method='stripe' AND pr.status='approved' AND pr.encrypted_destination=? AND c.id=? AND c.mode='live' AND c.external_id=? AND ${coverageFor('pr')} AND ${sourceReady('pr.application_id')} AND ${recipientIdentityApproved('pr.affiliate_user_id')}`).bind(candidate,d.recipientId,d.platformId,d.accountId,at,at,at,row.id,row.encrypted_destination,review.connectionId,d.platformId),
          db.prepare("UPDATE payout_requests SET status='processing',reason=NULL,updated_at=? WHERE id=? AND status='approved' AND EXISTS(SELECT 1 FROM stripe_transfer_attempts WHERE id=?)").bind(at,row.id,candidate),
          db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stripe_transfer_attempts WHERE id=?)').bind(crypto.randomUUID(),row.workspace_id,identity.userId,'stripe_transfer_started',at,candidate),
        ]);row=await owned(row.id);
      }
      if(row.status==='transferred')return {outcome:'transferred',request:await publicRequest(row.id)};if(row.status!=='processing')throw new AppError(409,'The request changed or commission coverage is missing.');const a=await attemptFor(row.id);if(!a||a.account_id!==d.accountId||a.platform_id!==d.platformId||a.recipient_id!==d.recipientId||a.amount!==row.amount)throw new AppError(409,'The saved transfer attempt needs review.');const lease=await lock(a);
      try{
        const funding=await source(row,d),existing=await lookup(a,funding.secret);if(existing)return await settle(row,a,existing);
        if(Date.now()-Date.parse(a.first_submitted_at)>23*3600000)throw new AppError(409,'This unknown transfer is older than the safe retry window. Use status checks and business review; a new transfer will not be sent.');
        const current=await eligible(row,d);if(current.c.id!==review.connectionId)throw new AppError(409,'The Stripe connection changed. Open a new transfer review.');
        await requireRecipientIdentity(db,row.affiliate_user_id);
        const body=new URLSearchParams({amount:String(a.amount),currency:'usd',destination:a.account_id,transfer_group:`affimaro_${a.id}`,'metadata[affimaro_attempt]':a.id,'metadata[affimaro_request]':row.id,'metadata[affimaro_workspace]':row.workspace_id});
        return await settle(row,a,await api(fetcher,'/v1/transfers',current.secret,body,`affimaro-transfer-${a.id}`));
      }catch(e){if(e instanceof AppError)return await hold(row,a,lease,e);throw e;}
      finally{await db.prepare('UPDATE stripe_transfer_attempts SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(a.id,lease).run();}
    },
    async reconcile(input:unknown){
      const {requestId}=parse(requestSchema,input),row=await owned(requestId);if(!['processing','transferred'].includes(row.status))throw new AppError(409,'No active or completed Stripe transfer is available to check.');const d=await destination(row),a=await attemptFor(row.id);if(!a)throw new AppError(409,'Transfer attempt not found.');const lease=await lock(a);
      try{const funding=await source(row,d),existing=await lookup(a,funding.secret);if(existing)return await settle(row,a,existing);throw new AppError(409,'Stripe has not confirmed a transfer for this request. Funds remain reserved; review before retrying.');}
      catch(e){if(e instanceof AppError&&row.status==='processing')return await hold(row,a,lease,e);throw e;}
      finally{await db.prepare('UPDATE stripe_transfer_attempts SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(a.id,lease).run();}
    },
  };
}
