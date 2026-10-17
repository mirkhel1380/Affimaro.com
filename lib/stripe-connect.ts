import {z} from 'zod';
import {trustedPublicOrigin} from './public-origin.ts';
import {AppError,service,type Identity} from './service.ts';
import {openPayment} from './payment-crypto.ts';
import {STRIPE_VERSION,type PaymentConnection} from './payment-connections.ts';

export const STRIPE_RETURN_ORIGIN='https://affimaro-preview.kindsky66.chatgpt.site';
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Source=PaymentConnection&{encrypted_credential:string};
type Recipient={id:string;workspace_id:string;application_id:string;affiliate_user_id:string;platform_id:string;mode:'test'|'live';country:string;account_id:string|null;state:string;details_submitted:number;payouts_enabled:number;transfers_active:number;requirements_count:number;last_error:string|null;last_checked_at:string|null;create_started_at:string|null;lease_id:string|null;lease_until:string|null;created_at:string;updated_at:string};
export type RecipientCard={application_id:string;business_name:string;partner_name:string;membership_status:string;country:string;mode:'test'|'live';setup_enabled:number;payment_ready:number;id:string|null;account_id:string|null;state:string|null;details_submitted:number|null;payouts_enabled:number|null;transfers_active:number|null;requirements_count:number|null;last_error:string|null;last_checked_at:string|null};
export type StripeMerchant={connection:Pick<PaymentConnection,'id'|'mode'|'external_id'|'country'|'status'>|null;enabled:boolean;recipients:RecipientCard[]};
const one=<T>(db:D1Database,q:string,...args:unknown[])=>db.prepare(q).bind(...args).first<T>();
const all=async<T>(db:D1Database,q:string,...args:unknown[])=>(await db.prepare(q).bind(...args).all<T>()).results;
const uuid=z.string().uuid(),target=z.object({recipientId:uuid}).strict();
function parse<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>{const r=schema.safeParse(input);if(!r.success)throw new AppError(400,r.error.issues[0]?.message||'Check the Stripe setup form.');return r.data;}
const accountSchema=z.object({id:z.string().regex(/^acct_[A-Za-z0-9]{6,80}$/),object:z.literal('account'),country:z.string().regex(/^[A-Z]{2}$/),details_submitted:z.boolean(),payouts_enabled:z.boolean(),capabilities:z.object({transfers:z.enum(['active','inactive','pending']).optional()}),controller:z.object({stripe_dashboard:z.object({type:z.literal('express')}),requirement_collection:z.literal('stripe')}),metadata:z.record(z.string()),requirements:z.object({currently_due:z.array(z.string()).max(200),pending_verification:z.array(z.string()).max(200).optional(),disabled_reason:z.string().nullable().optional()})});

async function stripeRequest(fetcher:Fetcher,path:string,secret:string,body?:URLSearchParams,idempotency?:string){
  const read=path==='/v1/account'||path==='/v1/balance'||/^\/v1\/accounts\/acct_[A-Za-z0-9]{6,80}$/.test(path),write=path==='/v1/accounts'||path==='/v1/account_links';
  if(body?!write:!read)throw new AppError(500,'Unsupported Stripe setup endpoint.');
  let response:Response;
  try{response=await fetcher(`https://api.stripe.com${path}`,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${secret}`,'Stripe-Version':STRIPE_VERSION,Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},...(body?{body:body.toString()}:{})});}
  catch{throw new AppError(502,'Stripe setup could not be reached. Your saved progress is retained; try again.');}
  if(!response.ok){await response.body?.cancel();if(response.status===429)throw new AppError(429,'Stripe is rate limiting setup. Wait a moment and try again.');if([400,401,403,404,409].includes(response.status))throw new AppError(409,'Stripe did not accept this setup request. The business should check its Connect registration, account permissions and supported country.');throw new AppError(502,'Stripe could not complete setup. Saved progress is retained.');}
  const reader=response.body?.getReader();if(!reader)throw new AppError(502,'Stripe returned an empty setup response.');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>262144){await reader.cancel();throw new AppError(502,'Stripe setup response exceeds the supported size.');}chunks.push(chunk.value);}}
  catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'Stripe setup response could not be read.');}
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new AppError(502,'Stripe returned an invalid setup response.');}
}
export function stripeConnect(db:D1Database,identity:Identity,key?:string,fetcher:Fetcher=fetch,returnOrigin=STRIPE_RETURN_ORIGIN){
  const s=service(db,identity),now=()=>new Date().toISOString();
  const source=(workspaceId:string)=>one<Source>(db,"SELECT * FROM payment_connections WHERE workspace_id=? AND provider='stripe'",workspaceId);
  const settings=(workspaceId:string)=>one<{connection_id:string;enabled:number}>(db,'SELECT connection_id,enabled FROM stripe_connect_settings WHERE workspace_id=?',workspaceId);
  const audit=(workspaceId:string,action:string)=>db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),workspaceId,identity.userId,action,now());
  async function fresh(c:Source){
    if(c.status!=='verified')throw new AppError(409,'The business must recheck its Stripe account access first.');
    const secret=await openPayment<string>(c.encrypted_credential,key,`provider/${c.workspace_id}/stripe/${c.id}`);
    if(!secret.startsWith(`rk_${c.mode}_`)&&!secret.startsWith(`sk_${c.mode}_`))throw new AppError(409,'The Stripe credential environment changed. Replace the business connection.');
    const account=z.object({id:z.string(),object:z.literal('account'),country:z.string()}).safeParse(await stripeRequest(fetcher,'/v1/account',secret));
    const balance=z.object({object:z.literal('balance'),livemode:z.boolean()}).safeParse(await stripeRequest(fetcher,'/v1/balance',secret));
    if(!account.success||!balance.success)throw new AppError(502,'Stripe returned incomplete platform-account information.');
    if(account.data.id!==c.external_id||account.data.country!==c.country||balance.data.livemode!==(c.mode==='live'))throw new AppError(409,'Stripe account identity or environment changed. The business must replace and re-enable its connection.');
    return secret;
  }
  async function allowed(c:Source,applicationId:string){
    const row=await one(db,"SELECT a.id FROM applications a JOIN programs p ON p.id=a.program_id JOIN payment_connections c ON c.workspace_id=p.workspace_id AND c.provider='stripe' JOIN stripe_connect_settings sc ON sc.workspace_id=c.workspace_id WHERE a.id=? AND a.affiliate_user_id=? AND a.status='approved' AND c.id=? AND c.status='verified' AND sc.connection_id=c.id AND sc.enabled=1",applicationId,identity.userId,c.id);
    if(!row)throw new AppError(409,'The business must enable Stripe recipient setup for your approved membership. Refresh this page.');
  }
  async function lock(row:Recipient){const lease=crypto.randomUUID(),at=now();await db.prepare('UPDATE stripe_recipients SET lease_id=?,lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)').bind(lease,new Date(Date.now()+120000).toISOString(),row.id,at).run();if((await one<Recipient>(db,'SELECT * FROM stripe_recipients WHERE id=?',row.id))?.lease_id!==lease)throw new AppError(409,'A Stripe account operation is already running. Wait and try again.');return lease;}
  async function saveAccount(row:Recipient,raw:unknown){
    const parsed=accountSchema.safeParse(raw);if(!parsed.success)throw new AppError(502,'Stripe returned incomplete receiving-account information.');const account=parsed.data;
    if(account.country!==row.country||row.account_id&&row.account_id!==account.id||account.metadata.affimaro_recipient!==row.id||account.metadata.affimaro_application!==row.application_id||account.metadata.affimaro_workspace!==row.workspace_id)throw new AppError(409,'Stripe receiving-account identity could not be verified.');
    const transfers=account.capabilities.transfers==='active',due=account.requirements.currently_due.length,pending=account.requirements.pending_verification?.length||0,disabled=account.requirements.disabled_reason;
    const restricted=!!disabled&&!['requirements.past_due','requirements.pending_verification','under_review'].includes(disabled);
    const state=restricted?'attention':transfers&&account.payouts_enabled&&account.details_submitted&&!due&&!pending&&!disabled?'ready':due||!account.details_submitted?'needs_information':'pending';
    await db.batch([db.prepare('UPDATE stripe_recipients SET account_id=?,state=?,details_submitted=?,payouts_enabled=?,transfers_active=?,requirements_count=?,last_error=?,last_checked_at=?,updated_at=? WHERE id=?').bind(account.id,state,account.details_submitted?1:0,account.payouts_enabled?1:0,transfers?1:0,due+pending,restricted?'Stripe restricted this receiving account. Review the account in Stripe.':null,now(),now(),row.id),audit(row.workspace_id,'stripe_recipient_checked')]);
    return {...row,account_id:account.id,state};
  }
  const cardFields='r.id,r.account_id,r.state,r.details_submitted,r.payouts_enabled,r.transfers_active,r.requirements_count,r.last_error,r.last_checked_at';
  const cardQuery=`SELECT a.id AS application_id,w.name AS business_name,f.display_name AS partner_name,a.status AS membership_status,c.country,c.mode,CASE WHEN a.status='approved' AND c.status='verified' AND sc.connection_id=c.id AND sc.enabled=1 THEN 1 ELSE 0 END AS setup_enabled,CASE WHEN a.status='approved' AND c.status='verified' AND c.mode='live' AND r.state='ready' AND r.last_checked_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes') THEN 1 ELSE 0 END AS payment_ready,${cardFields} FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id JOIN payment_connections c ON c.workspace_id=w.id AND c.provider='stripe' LEFT JOIN stripe_connect_settings sc ON sc.workspace_id=w.id LEFT JOIN stripe_recipients r ON r.application_id=a.id AND r.platform_id=c.external_id AND r.mode=c.mode`;
  return {
    async affiliate(){return all<RecipientCard>(db,`${cardQuery} WHERE a.affiliate_user_id=? AND (a.status='approved' OR r.id IS NOT NULL) ORDER BY w.name LIMIT 100`,identity.userId);},
    async merchant():Promise<StripeMerchant>{const w=await s.workspace();if(!w)throw new AppError(404,'Create your business workspace first.');const c=await source(w.id),sc=await settings(w.id);return {connection:c?{id:c.id,mode:c.mode,external_id:c.external_id,country:c.country,status:c.status}:null,enabled:!!(c&&c.status==='verified'&&sc?.enabled&&sc.connection_id===c.id),recipients:c?await all<RecipientCard>(db,`${cardQuery} WHERE w.id=? AND (a.status='approved' OR r.id IS NOT NULL) ORDER BY f.display_name LIMIT 100`,w.id):[]};},
    async configure(input:unknown){
      const value=parse(z.object({enabled:z.boolean(),confirmed:z.boolean(),connectionId:uuid.nullable()}).strict(),input),w=await s.workspace();if(!w)throw new AppError(404,'Business workspace not found.');const c=await source(w.id);
      if(value.enabled){if(!value.confirmed)throw new AppError(400,'Confirm your business’s Stripe Connect setup and responsibilities.');if(!c)throw new AppError(409,'Connect a Stripe business account first.');if(c.id!==value.connectionId)throw new AppError(409,'The Stripe connection changed. Refresh before enabling recipient setup.');await fresh(c);}
      await db.batch([db.prepare('INSERT INTO stripe_connect_settings (workspace_id,connection_id,enabled,updated_at) VALUES (?,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET connection_id=excluded.connection_id,enabled=excluded.enabled,updated_at=excluded.updated_at').bind(w.id,c?.id||'',value.enabled?1:0,now()),audit(w.id,value.enabled?'stripe_setup_enabled':'stripe_setup_disabled')]);return {enabled:value.enabled};
    },
    async start(input:unknown){
      const value=parse(z.object({applicationId:uuid,country:z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),consent:z.literal(true)}).strict(),input);
      const membership=await one<{workspace_id:string}>(db,"SELECT p.workspace_id FROM applications a JOIN programs p ON p.id=a.program_id WHERE a.id=? AND a.affiliate_user_id=? AND a.status='approved'",value.applicationId,identity.userId);if(!membership)throw new AppError(404,'Approved membership not found.');const c=await source(membership.workspace_id);if(!c)throw new AppError(409,'The business has no Stripe connection.');await allowed(c,value.applicationId);
      if(value.country!==c.country)throw new AppError(400,'This pilot supports a recipient legally based in the same country as the business Stripe account. Use your actual residence or business country.');
      const secret=await fresh(c),candidate=crypto.randomUUID(),at=now();
      await db.batch([db.prepare("INSERT INTO stripe_recipients (id,workspace_id,application_id,affiliate_user_id,platform_id,mode,country,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'creating',?,?) ON CONFLICT(application_id,platform_id,mode) DO NOTHING").bind(candidate,c.workspace_id,value.applicationId,identity.userId,c.external_id,c.mode,value.country,at,at),db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stripe_recipients WHERE id=?)").bind(crypto.randomUUID(),c.workspace_id,identity.userId,'stripe_recipient_started',at,candidate)]);
      let row=(await one<Recipient>(db,'SELECT * FROM stripe_recipients WHERE application_id=? AND platform_id=? AND mode=?',value.applicationId,c.external_id,c.mode))!;if(row.country!==value.country)throw new AppError(409,'The receiving account country is already fixed.');const lease=await lock(row);
      try{
        row=(await one<Recipient>(db,'SELECT * FROM stripe_recipients WHERE id=? AND lease_id=?',row.id,lease))!;
        await allowed(c,value.applicationId);
        if(!row.account_id){
          if(row.create_started_at&&Date.now()-Date.parse(row.create_started_at)>23*3600000)throw new AppError(409,'An earlier account-creation attempt needs business review in Stripe. A second account will not be created automatically.');
          await db.prepare('UPDATE stripe_recipients SET create_started_at=COALESCE(create_started_at,?),updated_at=? WHERE id=? AND lease_id=?').bind(now(),now(),row.id,lease).run();
          const body=new URLSearchParams({country:row.country,'controller[fees][payer]':'application','controller[losses][payments]':'application','controller[stripe_dashboard][type]':'express','capabilities[transfers][requested]':'true','metadata[affimaro_recipient]':row.id,'metadata[affimaro_application]':row.application_id,'metadata[affimaro_workspace]':row.workspace_id});
          row=await saveAccount(row,await stripeRequest(fetcher,'/v1/accounts',secret,body,`affimaro-recipient-${row.id}`));
        }else row=await saveAccount(row,await stripeRequest(fetcher,`/v1/accounts/${row.account_id}`,secret));
        await allowed(c,value.applicationId);
        const origin=trustedPublicOrigin(returnOrigin),link=await stripeRequest(fetcher,'/v1/account_links',secret,new URLSearchParams({account:row.account_id!,type:'account_onboarding',return_url:`${origin}/payments?view=affiliate&stripe=return`,refresh_url:`${origin}/payments?view=affiliate&stripe=refresh`}),`affimaro-link-${crypto.randomUUID()}`);
        const parsed=z.object({object:z.literal('account_link'),url:z.string().url().max(2048),expires_at:z.number().int().positive()}).safeParse(link);if(!parsed.success)throw new AppError(502,'Stripe returned an invalid onboarding link.');const url=new URL(parsed.data.url);if(url.origin!=='https://connect.stripe.com'||url.username||url.password||!url.pathname.startsWith('/setup/')||parsed.data.expires_at*1000<=Date.now())throw new AppError(502,'Stripe returned an unsupported onboarding link.');
        await allowed(c,value.applicationId);await audit(c.workspace_id,'stripe_onboarding_opened').run();return {url:parsed.data.url,expiresAt:parsed.data.expires_at};
      }catch(e){if(e instanceof AppError)await db.batch([db.prepare("UPDATE stripe_recipients SET state='attention',last_error=?,updated_at=? WHERE id=? AND lease_id=?").bind(e.message,now(),row.id,lease),audit(row.workspace_id,'stripe_recipient_check_failed')]);throw e;}
      finally{await db.prepare('UPDATE stripe_recipients SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(row.id,lease).run();}
    },
    async check(input:unknown){
      const value=parse(target,input),row=await one<Recipient>(db,'SELECT r.* FROM stripe_recipients r JOIN workspaces w ON w.id=r.workspace_id WHERE r.id=? AND (r.affiliate_user_id=? OR w.owner_id=?)',value.recipientId,identity.userId,identity.userId);if(!row||!row.account_id)throw new AppError(404,'Receiving account not found.');const c=await source(row.workspace_id);if(!c||c.external_id!==row.platform_id||c.mode!==row.mode)throw new AppError(409,'This receiving account belongs to another Stripe connection or environment.');const lease=await lock(row);
      try{const secret=await fresh(c);await saveAccount(row,await stripeRequest(fetcher,`/v1/accounts/${row.account_id}`,secret));return {checked:true};}
      catch(e){if(e instanceof AppError)await db.batch([db.prepare("UPDATE stripe_recipients SET state='attention',last_error=?,updated_at=? WHERE id=? AND lease_id=?").bind(e.message,now(),row.id,lease),audit(row.workspace_id,'stripe_recipient_check_failed')]);throw e;}
      finally{await db.prepare('UPDATE stripe_recipients SET lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=?').bind(row.id,lease).run();}
    },
  };
}
