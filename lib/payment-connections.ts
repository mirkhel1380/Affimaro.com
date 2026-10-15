import {z} from 'zod';
import {AppError,service,type Identity} from './service.ts';
import {sealPayment,openPayment} from './payment-crypto.ts';

export const STRIPE_VERSION='2026-09-30.endive';
export const WISE_VERSION='2026Q4';
export type PaymentProvider='stripe'|'wise';
export type PaymentConnection={id:string;workspace_id:string;provider:PaymentProvider;mode:'test'|'live';external_id:string;label:string;country:string|null;currency:string|null;payouts_enabled:number|null;status:'verified'|'attention';last_error:string|null;last_verified_at:string;last_checked_at:string;created_at:string;updated_at:string};
type PrivateConnection=PaymentConnection&{encrypted_credential:string};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
type Verified={externalId:string;label:string;country:string|null;currency:string|null;payoutsEnabled:number|null};
const fields='id,workspace_id,provider,mode,external_id,label,country,currency,payouts_enabled,status,last_error,last_verified_at,last_checked_at,created_at,updated_at';
const provider=z.enum(['stripe','wise']),mode=z.enum(['test','live']);
const connectSchema=z.discriminatedUnion('provider',[
  z.object({provider:z.literal('stripe'),mode,secret:z.string().trim().regex(/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{12,240}$/,'Use a Stripe secret or restricted key for the selected mode.')}).strict(),
  z.object({provider:z.literal('wise'),mode,secret:z.string().trim().min(16).max(4096).regex(/^[A-Za-z0-9._-]+$/,'Use a Wise personal API token.'),profileId:z.string().regex(/^[1-9][0-9]{0,15}$/,'Use the numeric Wise business profile ID.').refine(v=>Number.isSafeInteger(Number(v)),'Wise profile ID is outside the supported range.')}).strict(),
]);
const existingSchema=z.object({provider,connectionId:z.string().uuid()}).strict();
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,r.error.issues[0]?.message||'Check the connection settings.');return r.data;}
const one=<T>(db:D1Database,q:string,...args:unknown[])=>db.prepare(q).bind(...args).first<T>();

// This adapter only reads provider account information. There is no provider write or money-movement operation.
async function readProvider(fetcher:Fetcher,url:string,secret:string,stripe=false){
  const allowed=['https://api.stripe.com/v1/account','https://api.stripe.com/v1/balance',`https://api.wise.com/${WISE_VERSION}/profiles`,`https://api.wise-sandbox.com/${WISE_VERSION}/profiles`];
  if(!allowed.includes(url))throw new AppError(500,'Unsupported provider endpoint.');
  let response:Response;
  try{response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${secret}`,Accept:'application/json',...(stripe?{'Stripe-Version':STRIPE_VERSION}:{'X-External-Correlation-Id':crypto.randomUUID()})}});}
  catch{throw new AppError(502,'The provider could not be reached. Check access and try again.');}
  if(!response.ok){await response.body?.cancel();if([401,403].includes(response.status))throw new AppError(409,'The provider did not authorize account access. Check the credential, its read permissions and the selected environment.');if(response.status===429)throw new AppError(429,'The provider is rate limiting requests. Wait a moment before checking again.');throw new AppError(502,'The provider could not complete the account check. Try again later.');}
  const reader=response.body?.getReader();if(!reader)throw new AppError(502,'The provider returned an empty account response.');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>262144){await reader.cancel();throw new AppError(502,'The provider account response exceeds the supported size.');}chunks.push(chunk.value);}}
  catch(e){if(e instanceof AppError)throw e;throw new AppError(502,'The provider account response could not be read.');}
  const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new AppError(502,'The provider returned an invalid account response.');}
}
async function verify(fetcher:Fetcher,value:z.output<typeof connectSchema>):Promise<Verified>{
  if(value.provider==='stripe'){
    if(!value.secret.startsWith(`sk_${value.mode}_`)&&!value.secret.startsWith(`rk_${value.mode}_`))throw new AppError(400,'The Stripe key mode does not match the selected environment.');
    const raw=await readProvider(fetcher,'https://api.stripe.com/v1/account',value.secret,true);
    const account=z.object({id:z.string().regex(/^acct_[A-Za-z0-9]{6,80}$/),object:z.literal('account'),country:z.string().regex(/^[A-Z]{2}$/),default_currency:z.string().regex(/^[a-z]{3}$/),payouts_enabled:z.boolean(),business_profile:z.object({name:z.string().nullable()}).nullable().optional()}).safeParse(raw);
    if(!account.success)throw new AppError(502,'Stripe returned incomplete account information.');
    const balance=z.object({object:z.literal('balance'),livemode:z.boolean()}).safeParse(await readProvider(fetcher,'https://api.stripe.com/v1/balance',value.secret,true));
    if(!balance.success)throw new AppError(502,'Stripe could not confirm the account environment.');
    if(balance.data.livemode!==(value.mode==='live'))throw new AppError(409,'Stripe reported another environment. Check the key and selected mode.');
    return {externalId:account.data.id,label:account.data.business_profile?.name?.trim().slice(0,120)||'Stripe business account',country:account.data.country,currency:account.data.default_currency.toUpperCase(),payoutsEnabled:account.data.payouts_enabled?1:0};
  }
  const raw=await readProvider(fetcher,`https://${value.mode==='live'?'api.wise.com':'api.wise-sandbox.com'}/${WISE_VERSION}/profiles`,value.secret);
  const profiles=z.array(z.object({id:z.number().int().positive().safe(),type:z.enum(['PERSONAL','BUSINESS']),businessName:z.string().nullable().optional(),currentState:z.enum(['HIDDEN','VISIBLE','DEACTIVATED']).optional(),address:z.object({countryIso2Code:z.string().regex(/^[A-Z]{2}$/)}).passthrough().nullable().optional()})).max(200).safeParse(raw);
  if(!profiles.success)throw new AppError(502,'Wise returned incomplete profile information.');
  const selected=profiles.data.find(p=>String(p.id)===value.profileId);
  if(!selected||selected.type!=='BUSINESS')throw new AppError(409,'That Wise business profile is not available to this token. Use a business profile ID from the selected environment.');
  if(selected.currentState&&selected.currentState!=='VISIBLE')throw new AppError(409,'The selected Wise business profile is not active. Check its status in Wise.');
  return {externalId:value.profileId,label:selected.businessName?.trim().slice(0,120)||'Wise business profile',country:selected.address?.countryIso2Code||null,currency:null,payoutsEnabled:null};
}
export function paymentConnections(db:D1Database,identity:Identity,key?:string,fetcher:Fetcher=fetch){
  const s=service(db,identity),time=()=>new Date().toISOString();
  const workspace=async()=>{const w=await s.workspace();if(!w)throw new AppError(404,'Create your business workspace before connecting payment accounts.');return w;};
  const current=(workspaceId:string,kind:PaymentProvider)=>one<PrivateConnection>(db,'SELECT * FROM payment_connections WHERE workspace_id=? AND provider=?',workspaceId,kind);
  const publicConnection=(workspaceId:string,kind:PaymentProvider)=>one<PaymentConnection>(db,`SELECT ${fields} FROM payment_connections WHERE workspace_id=? AND provider=?`,workspaceId,kind);
  const context=(workspaceId:string,kind:PaymentProvider,id:string)=>`provider/${workspaceId}/${kind}/${id}`;
  const audit=(workspaceId:string,action:string,at:string,id:string)=>db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM payment_connections WHERE id=? AND workspace_id=?)').bind(crypto.randomUUID(),workspaceId,identity.userId,action,at,id,workspaceId);
  return {
    async list(){const w=await workspace();return (await db.prepare(`SELECT ${fields} FROM payment_connections WHERE workspace_id=? ORDER BY provider`).bind(w.id).all<PaymentConnection>()).results;},
    async connect(input:unknown){
      const value=parse(connectSchema,input),w=await workspace(),id=crypto.randomUUID();
      // Check encryption availability before sending any credential to a provider.
      const ciphertext=await sealPayment(value.secret,key,context(w.id,value.provider,id));
      const result=await verify(fetcher,value),at=time();
      await db.batch([
        db.prepare("INSERT INTO payment_connections (id,workspace_id,provider,mode,external_id,label,country,currency,payouts_enabled,status,last_error,encrypted_credential,last_verified_at,last_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'verified',NULL,?,?,?,?,?) ON CONFLICT(workspace_id,provider) DO UPDATE SET id=excluded.id,mode=excluded.mode,external_id=excluded.external_id,label=excluded.label,country=excluded.country,currency=excluded.currency,payouts_enabled=excluded.payouts_enabled,status='verified',last_error=NULL,encrypted_credential=excluded.encrypted_credential,last_verified_at=excluded.last_verified_at,last_checked_at=excluded.last_checked_at,updated_at=excluded.updated_at").bind(id,w.id,value.provider,value.mode,result.externalId,result.label,result.country,result.currency,result.payoutsEnabled,ciphertext,at,at,at,at),
        audit(w.id,`${value.provider}_account_connected`,at,id),
      ]);
      const saved=await publicConnection(w.id,value.provider);if(saved?.id!==id)throw new AppError(409,'The connection changed in another tab. Refresh to see the latest account.');return saved;
    },
    async check(input:unknown){
      const value=parse(existingSchema,input),w=await workspace(),stored=await current(w.id,value.provider);if(!stored||stored.id!==value.connectionId)throw new AppError(409,'This connection changed. Refresh before checking it.');
      const secret=await openPayment<string>(stored.encrypted_credential,key,context(w.id,value.provider,stored.id));let result:Verified|undefined,error:AppError|undefined;
      try{result=await verify(fetcher,parse(connectSchema,{provider:value.provider,mode:stored.mode,secret,...(value.provider==='wise'?{profileId:stored.external_id}:{})}));if(result.externalId!==stored.external_id)throw new AppError(409,'The provider account identity changed. Replace the connection to verify it again.');}
      catch(e){if(!(e instanceof AppError))throw e;error=e;}
      const at=time();
      await db.batch([
        result&&!error?db.prepare("UPDATE payment_connections SET label=?,country=?,currency=?,payouts_enabled=?,status='verified',last_error=NULL,last_verified_at=?,last_checked_at=?,updated_at=? WHERE id=? AND workspace_id=?").bind(result.label,result.country,result.currency,result.payoutsEnabled,at,at,at,stored.id,w.id):db.prepare("UPDATE payment_connections SET status='attention',last_error=?,last_checked_at=?,updated_at=? WHERE id=? AND workspace_id=?").bind(error?.message||'Account access could not be confirmed.',at,at,stored.id,w.id),
        audit(w.id,`${value.provider}_account_${error?'check_failed':'checked'}`,at,stored.id),
      ]);
      const saved=await publicConnection(w.id,value.provider);if(saved?.id!==stored.id)throw new AppError(409,'The connection changed during this check. Refresh to see the latest account.');return saved;
    },
    async remove(input:unknown){
      const value=parse(existingSchema,input),w=await workspace(),stored=await current(w.id,value.provider);if(!stored||stored.id!==value.connectionId)throw new AppError(409,'This connection changed. Refresh before removing it.');const at=time();
      await db.batch([audit(w.id,`${value.provider}_account_removed`,at,stored.id),db.prepare('DELETE FROM payment_connections WHERE id=? AND workspace_id=?').bind(stored.id,w.id)]);
      return {removed:true};
    },
  };
}
