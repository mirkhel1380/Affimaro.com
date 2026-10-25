import {recipientIdentityApproved,requireRecipientIdentity} from './identity-policy.ts';
import {z} from 'zod';
import {AppError,service,type Identity} from './service.ts';
import {effectiveCommission,shopifyHold,sourceReady} from './commission-query.ts';
import {approvedFor,committedFor,coverageFor,netDisbursed} from './payment-balance.ts';
import {stripeDestinationSchema,STRIPE_PILOT_LIMIT,type StripeDestination,type StripeTransferReceipt} from './stripe-destination.ts';
import {sealPayment,openPayment,referenceHash} from './payment-crypto.ts';

export type BankProfile={user_id:string;account_hint:string;currency:string;updated_at:string};
export type BankDetails={beneficiary:string;bank:string;country:string;currency:string;account:string;swift:string;routing:string;address:string};
export type Payout={id:string;workspace_id:string;application_id:string;affiliate_user_id:string;currency:string;decimals:number;amount:number;status:string;method:'bank'|'stripe';reversed_amount:number;stripe_transfer_id:string|null;account_hint:string;reason:string|null;paid_date:string|null;created_at:string;updated_at:string;business_name?:string;partner_name?:string;covered?:number;sync_ready?:number;identity_approved?:number};
type PrivatePayout=Payout&{encrypted_destination:string;encrypted_receipt:string|null;reference_hash:string|null};
export type Wallet={application_id:string;workspace_id:string;business_name:string;partner_name:string;affiliate_user_id:string;application_status:string;currency:string;decimals:number;estimated:number;approved:number;paid:number;reserved:number;available:number;debt:number;identity_approved?:number};
export type ApprovalOrder={id:string;external_id:string;application_id:string;currency:string;decimals:number;commission:number;revision:number;commission_state:string;approved_amount:number;approved_revision:number|null;partner_name:string;created_at:string;sync_ready?:number};
const uuid=z.string().uuid(),currency=z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/,'Use a three-letter currency code.'),short=z.string().trim().min(2).max(100);
const bankSchema=z.object({beneficiary:short,bank:short,country:z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/,'Use a two-letter bank country code.').refine(v=>{try{const label=new Intl.DisplayNames(['en'],{type:'region'}).of(v);return v!=='ZZ'&&label!==v;}catch{return false;}},'Use a valid bank country code.'),currency,account:z.string().trim().min(6).max(50).regex(/^[A-Za-z0-9 -]+$/,'Use the account number or IBAN, without other punctuation.').refine(v=>v.replace(/[^A-Za-z0-9]/g,'').length>=6,'Use at least six account characters.'),swift:z.string().trim().toUpperCase().max(11).refine(v=>!v||/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v),'Use an 8- or 11-character SWIFT/BIC, or leave blank.'),routing:z.string().trim().max(35).regex(/^[A-Za-z0-9 -]*$/),address:z.string().trim().max(200)}).strict();
const receiptSchema=z.object({method:z.enum(['bank','wise']).default('bank'),reference:z.string().trim().min(3).max(100),paidDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;},'Use a valid payment date.'),receiptUrl:z.string().trim().max(500).refine(v=>{if(!v)return true;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use an HTTPS receipt link, or leave blank.'),confirmed:z.literal(true,{error:'Confirm that the bank transfer has already been completed.'})}).strict();
const requestSchema=z.object({requestId:uuid,applicationId:uuid,currency,decimals:z.number().int().min(0).max(6),method:z.enum(['bank','stripe']).default('bank')}).strict();
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.output<S>{const r=schema.safeParse(value);if(!r.success)throw new AppError(400,r.error.issues[0]?.message||'Check the payment form.');return r.data;}
const one=<T>(db:D1Database,query:string,...args:unknown[])=>db.prepare(query).bind(...args).first<T>();
const all=async<T>(db:D1Database,query:string,...args:unknown[])=>(await db.prepare(query).bind(...args).all<T>()).results;
export const payoutPublicFields='id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,method,reversed_amount,stripe_transfer_id,account_hint,reason,paid_date,created_at,updated_at';
const coverage=coverageFor();
const walletQuery=`SELECT a.id AS application_id,p.workspace_id,w.name AS business_name,f.display_name AS partner_name,a.affiliate_user_id,a.status AS application_status,${recipientIdentityApproved('a.affiliate_user_id')} AS identity_approved,o.currency,o.decimals,SUM(${effectiveCommission()}) AS estimated,SUM(MIN(${effectiveCommission()},COALESCE(ca.amount,0))) AS approved,(SELECT COALESCE(SUM(${netDisbursed('pr')}),0) FROM payout_requests pr WHERE pr.application_id=a.id AND pr.currency=o.currency AND pr.decimals=o.decimals AND pr.status IN ('paid','transferred')) AS paid,(SELECT COALESCE(SUM(pr.amount),0) FROM payout_requests pr WHERE pr.application_id=a.id AND pr.currency=o.currency AND pr.decimals=o.decimals AND pr.status IN ('requested','approved','processing')) AS reserved FROM orders o JOIN applications a ON a.id=o.application_id JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id LEFT JOIN commission_approvals ca ON ca.order_id=o.id`;
function wallet(row:Omit<Wallet,'available'|'debt'>):Wallet{const net=row.approved-row.paid-row.reserved;return {...row,available:Math.max(0,net),debt:Math.max(0,row.paid-row.approved)};}

export const closureBalanceHoldsSql=`${walletQuery} WHERE (a.affiliate_user_id=(SELECT user_id FROM closing) OR w.owner_id=(SELECT user_id FROM closing)) GROUP BY a.id,o.currency,o.decimals HAVING estimated<>paid OR reserved<>0 OR paid>approved`;

export function payments(db:D1Database,identity:Identity,key?:string){
  const s=service(db,identity),at=()=>new Date().toISOString();
  const profile=()=>one<BankProfile>(db,'SELECT user_id,account_hint,currency,updated_at FROM bank_profiles WHERE user_id=?',identity.userId);
  const publicRequest=(id:string)=>one<Payout>(db,`SELECT ${payoutPublicFields} FROM payout_requests WHERE id=?`,id);
  const audit=(workspaceId:string,action:string,time=at())=>db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),workspaceId,identity.userId,action,time);
  const merchantRequest=async(id:string)=>{const row=await one<PrivatePayout>(db,'SELECT pr.* FROM payout_requests pr JOIN workspaces w ON w.id=pr.workspace_id WHERE pr.id=? AND w.owner_id=?',id,identity.userId);if(!row)throw new AppError(404,'Payment request not found in your business.');return row;};
  async function requestStripe(value:z.output<typeof requestSchema>){
    if(value.currency!=='USD'||value.decimals!==2)throw new AppError(400,'Stripe commission transfers currently support USD with two decimal places.');
    const since=new Date(Date.now()-300000).toISOString();
    const recipient=await one<{id:string;workspace_id:string;application_id:string;account_id:string;platform_id:string;country:string;connection_id:string}>(db,"SELECT r.id,r.workspace_id,r.application_id,r.account_id,r.platform_id,r.country,c.id AS connection_id FROM stripe_recipients r JOIN applications a ON a.id=r.application_id JOIN payment_connections c ON c.workspace_id=r.workspace_id AND c.provider='stripe' AND c.external_id=r.platform_id AND c.mode=r.mode WHERE r.application_id=? AND r.affiliate_user_id=? AND a.status='approved' AND r.mode='live' AND r.state='ready' AND r.details_submitted=1 AND r.payouts_enabled=1 AND r.transfers_active=1 AND r.last_checked_at>=? AND c.status='verified' AND c.country=r.country",value.applicationId,identity.userId,since);
    if(!recipient)throw new AppError(409,'Check your live Stripe receiving-account status before requesting USD commission.');
    const destination=stripeDestinationSchema.parse({kind:'stripe',accountId:recipient.account_id,platformId:recipient.platform_id,recipientId:recipient.id,workspaceId:recipient.workspace_id,applicationId:value.applicationId,country:recipient.country,mode:'live'}),ciphertext=await sealPayment(destination,key,`stripe-destination/${identity.userId}/${value.requestId}`),time=at();
    const balance=`${approvedFor('a.id',"'USD'",'2')}-${committedFor('a.id',"'USD'",'2')}`;
    try{await db.batch([
      db.prepare(`WITH payable AS (SELECT a.id AS application_id,a.affiliate_user_id,p.workspace_id,(${balance}) AS available FROM applications a JOIN programs p ON p.id=a.program_id JOIN stripe_recipients r ON r.application_id=a.id JOIN payment_connections c ON c.workspace_id=p.workspace_id AND c.provider='stripe' WHERE a.id=? AND a.affiliate_user_id=? AND a.status='approved' AND ${recipientIdentityApproved('a.affiliate_user_id')} AND r.id=? AND c.id=? AND r.account_id=? AND r.platform_id=c.external_id AND r.mode='live' AND c.mode='live' AND c.status='verified' AND r.state='ready' AND r.last_checked_at>=?) INSERT INTO payout_requests (id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,encrypted_destination,account_hint,method,created_at,updated_at) SELECT ?,workspace_id,application_id,affiliate_user_id,'USD',2,available,'requested',?,?,'stripe',?,? FROM payable WHERE available BETWEEN 1 AND ${STRIPE_PILOT_LIMIT} AND NOT EXISTS(SELECT 1 FROM payout_requests pr WHERE pr.application_id=payable.application_id AND pr.currency='USD' AND pr.decimals=2 AND pr.status IN ('requested','approved','processing'))`).bind(value.applicationId,identity.userId,recipient.id,recipient.connection_id,recipient.account_id,since,value.requestId,ciphertext,recipient.account_id.slice(-4),time,time),
      db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,workspace_id,?,?,? FROM payout_requests WHERE id=? AND affiliate_user_id=?').bind(crypto.randomUUID(),identity.userId,'payout_requested',time,value.requestId,identity.userId),
    ]);}catch(error){const raced=await publicRequest(value.requestId);if(raced?.affiliate_user_id===identity.userId&&raced.application_id===value.applicationId&&raced.method==='stripe'&&raced.currency==='USD'&&raced.decimals===2)return raced;throw error;}
    const saved=await publicRequest(value.requestId);if(!saved)throw new AppError(409,'No available USD commission within the Stripe pilot limit, the receiving account changed, or another request is open.');return saved;
  }
  return {
    profile,
    async saveBank(input:unknown){
      const details=parse(bankSchema,input);if(!await s.profile())throw new AppError(409,'Create your affiliate profile first.');
      const ciphertext=await sealPayment(details,key,`bank/${identity.userId}`),hint=details.account.replace(/[^A-Za-z0-9]/g,'').slice(-4),time=at();
      await db.prepare('INSERT INTO bank_profiles (user_id,encrypted_details,account_hint,currency,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_details=excluded.encrypted_details,account_hint=excluded.account_hint,currency=excluded.currency,updated_at=excluded.updated_at').bind(identity.userId,ciphertext,hint,details.currency,time).run();
      return profile();
    },
    async bankDetails(){
      const row=await one<{encrypted_details:string}>(db,'SELECT encrypted_details FROM bank_profiles WHERE user_id=?',identity.userId);if(!row)throw new AppError(404,'No bank account is saved.');return openPayment<BankDetails>(row.encrypted_details,key,`bank/${identity.userId}`);
    },
    async approveCommission(input:unknown){
      const value=parse(z.object({orderId:uuid,revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict(),input),business=await s.workspace();if(!business)throw new AppError(404,'Business workspace not found.');
      const time=at();
      await db.batch([
        db.prepare(`INSERT INTO commission_approvals (order_id,amount,revision,approved_by,approved_at) SELECT o.id,o.commission,o.revision,?,? FROM orders o JOIN store_connections c ON c.id=o.store_id WHERE o.id=? AND o.revision=? AND c.workspace_id=? AND o.commission_state='accrued' AND o.commission>0 AND NOT ${shopifyHold()} AND ${sourceReady('o.application_id')} ON CONFLICT(order_id) DO UPDATE SET amount=excluded.amount,revision=excluded.revision,approved_by=excluded.approved_by,approved_at=excluded.approved_at`).bind(identity.userId,time,value.orderId,value.revision,business.id),
        db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM commission_approvals WHERE order_id=? AND approved_at=?)").bind(crypto.randomUUID(),business.id,identity.userId,'commission_approved',time,value.orderId,time),
      ]);
      const row=await one<{amount:number;revision:number}>(db,'SELECT ca.amount,ca.revision FROM commission_approvals ca JOIN orders o ON o.id=ca.order_id JOIN store_connections c ON c.id=o.store_id WHERE ca.order_id=? AND c.workspace_id=? AND o.revision=? AND ca.revision=?',value.orderId,business.id,value.revision,value.revision);
      if(!row)throw new AppError(409,'This order changed, needs review, or its store sync is incomplete or stale. Finish a recent Shopify sync before approving.');return row;
    },
    async request(input:unknown){
      const value=parse(requestSchema,input);
      const existing=await one<Payout>(db,`SELECT ${payoutPublicFields} FROM payout_requests WHERE id=?`,value.requestId);
      if(existing){if(existing.affiliate_user_id!==identity.userId||existing.application_id!==value.applicationId||existing.currency!==value.currency||existing.decimals!==value.decimals||existing.method!==value.method)throw new AppError(409,'The request ID is already in use.');return existing;}
      await requireRecipientIdentity(db,identity.userId);
      if(value.method==='stripe')return requestStripe(value);
      const bank=await profile();if(!bank)throw new AppError(409,'Save your bank details before requesting payment.');if(bank.currency!==value.currency)throw new AppError(409,'Your bank account currency must match this commission balance.');
      // Verify the encryption key is available before creating a destination snapshot.
      await this.bankDetails();
      const balance=`${approvedFor('a.id','?','?')}-${committedFor('a.id','?','?')}`,time=at();
      try{await db.batch([
        db.prepare(`INSERT INTO payout_requests (id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,encrypted_destination,account_hint,created_at,updated_at) SELECT ?,p.workspace_id,a.id,a.affiliate_user_id,?,?,MIN(1000000000000,${balance}),'requested',b.encrypted_details,b.account_hint,?,? FROM applications a JOIN programs p ON p.id=a.program_id JOIN bank_profiles b ON b.user_id=a.affiliate_user_id WHERE a.id=? AND a.affiliate_user_id=? AND a.status='approved' AND ${recipientIdentityApproved('a.affiliate_user_id')} AND b.currency=? AND (${balance})>0 AND NOT EXISTS(SELECT 1 FROM payout_requests pr WHERE pr.application_id=a.id AND pr.currency=? AND pr.decimals=? AND pr.status IN ('requested','approved','processing'))`).bind(value.requestId,value.currency,value.decimals,value.currency,value.decimals,value.currency,value.decimals,time,time,value.applicationId,identity.userId,value.currency,value.currency,value.decimals,value.currency,value.decimals,value.currency,value.decimals),
        db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,workspace_id,?,?,? FROM payout_requests WHERE id=? AND affiliate_user_id=?').bind(crypto.randomUUID(),identity.userId,'payout_requested',time,value.requestId,identity.userId),
      ]);}catch(error){const raced=await publicRequest(value.requestId);if(raced?.affiliate_user_id===identity.userId&&raced.application_id===value.applicationId&&raced.currency===value.currency&&raced.decimals===value.decimals&&raced.method===value.method)return raced;throw error;}
      const row=await publicRequest(value.requestId);if(!row)throw new AppError(409,'No available approved commission, or another request is already open. Refresh your balances.');return row;
    },
    async cancel(input:unknown){
      const value=parse(z.object({requestId:uuid}).strict(),input),time=at();
      const row=await one<Payout>(db,`SELECT ${payoutPublicFields} FROM payout_requests WHERE id=? AND affiliate_user_id=?`,value.requestId,identity.userId);if(!row)throw new AppError(404,'Payment request not found.');if(row.status==='cancelled')return row;
      await db.batch([
        db.prepare("UPDATE payout_requests SET status='cancelled',updated_at=? WHERE id=? AND affiliate_user_id=? AND status='requested'").bind(time,value.requestId,identity.userId),
        db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,workspace_id,?,?,? FROM payout_requests WHERE id=? AND status='cancelled' AND updated_at=?").bind(crypto.randomUUID(),identity.userId,'payout_cancelled',time,value.requestId,time),
      ]);
      const after=await publicRequest(value.requestId);if(after?.status!=='cancelled')throw new AppError(409,'Only a request still waiting for approval can be cancelled.');return after;
    },
    async review(input:unknown){
      const value=parse(z.object({requestId:uuid,status:z.enum(['approved','rejected']),reason:z.string().trim().max(200)}).strict(),input),row=await merchantRequest(value.requestId),time=at();
      if(value.status==='rejected'&&value.reason.length<3)throw new AppError(400,'Add a short reason for declining the request.');
      if(row.status===value.status)return publicRequest(row.id);
      if(value.status==='approved')await requireRecipientIdentity(db,row.affiliate_user_id);
      const from=value.status==='approved'?"status='requested'":"status IN ('requested','approved')";
      await db.batch([
        db.prepare(`UPDATE payout_requests SET status=?,reason=?,updated_at=? WHERE id=? AND workspace_id=? AND ${from}${value.status==='approved'?` AND ${coverage} AND ${sourceReady('payout_requests.application_id')} AND ${recipientIdentityApproved()}`:''}`).bind(value.status,value.status==='rejected'?value.reason:null,time,row.id,row.workspace_id),
        db.prepare('INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,workspace_id,?,?,? FROM payout_requests WHERE id=? AND status=? AND updated_at=?').bind(crypto.randomUUID(),identity.userId,value.status==='approved'?'payout_approved':'payout_rejected',time,row.id,value.status,time),
      ]);
      const after=await publicRequest(row.id);if(after?.status!==value.status)throw new AppError(409,'The request changed or refunds reduced its balance. Decline it and let the affiliate request the corrected amount.');return after;
    },
    async recordPaid(input:unknown){
      const value=parse(z.object({requestId:uuid,receipt:receiptSchema}).strict(),input),row=await merchantRequest(value.requestId),time=at(),today=new Date().toISOString().slice(0,10);
      if(row.method!=='bank')throw new AppError(409,'Stripe requests must use the verified Stripe transfer workflow.');
      if(value.receipt.paidDate>today||value.receipt.paidDate<row.created_at.slice(0,10))throw new AppError(400,'The payment date must be between the request date and today.');
      const hash=await referenceHash(value.receipt.reference,row.workspace_id);if(row.status==='paid'){if(row.reference_hash!==hash)throw new AppError(409,'This request is already recorded with another payment reference.');return publicRequest(row.id);}
      await requireRecipientIdentity(db,row.affiliate_user_id);
      const receipt=await sealPayment(value.receipt,key,`receipt/${row.affiliate_user_id}/${row.id}`);
      try{await db.batch([
        db.prepare(`UPDATE payout_requests SET status='paid',encrypted_receipt=?,reference_hash=?,paid_date=?,paid_by=?,updated_at=? WHERE id=? AND workspace_id=? AND method='bank' AND status='approved' AND ${coverage} AND ${sourceReady('payout_requests.application_id')} AND ${recipientIdentityApproved()}`).bind(receipt,hash,value.receipt.paidDate,identity.userId,time,row.id,row.workspace_id),
        db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,workspace_id,?,?,? FROM payout_requests WHERE id=? AND status='paid' AND reference_hash=? AND updated_at=?").bind(crypto.randomUUID(),identity.userId,'payout_recorded_paid',time,row.id,hash,time),
      ]);}catch(error){if(await one(db,'SELECT id FROM payout_requests WHERE workspace_id=? AND reference_hash=? AND id<>?',row.workspace_id,hash,row.id))throw new AppError(409,'That bank reference is already used by another payment in your business.');throw error;}
      const after=await publicRequest(row.id);if(after?.status!=='paid')throw new AppError(409,'Approval, commission coverage or a complete recent store sync is missing. Sync Shopify before recording its payment.');return after;
    },
    async details(input:unknown){
      const value=parse(z.object({requestId:uuid}).strict(),input);
      const row=await one<PrivatePayout>(db,'SELECT pr.* FROM payout_requests pr JOIN workspaces w ON w.id=pr.workspace_id WHERE pr.id=? AND (pr.affiliate_user_id=? OR w.owner_id=?)',value.requestId,identity.userId,identity.userId);if(!row)throw new AppError(404,'Payment request not found.');
      if(row.affiliate_user_id!==identity.userId&&!['paid','transferred'].includes(row.status))await requireRecipientIdentity(db,row.affiliate_user_id);
      if(row.method==='stripe'){const destination=stripeDestinationSchema.parse(await openPayment<StripeDestination>(row.encrypted_destination,key,`stripe-destination/${row.affiliate_user_id}/${row.id}`)),receipt=row.encrypted_receipt?await openPayment<StripeTransferReceipt>(row.encrypted_receipt,key,`receipt/${row.affiliate_user_id}/${row.id}`):null;await audit(row.workspace_id,'payment_details_viewed').run();return {method:'stripe' as const,destination,receipt};}
      const destination=await openPayment<BankDetails>(row.encrypted_destination,key,`bank/${row.affiliate_user_id}`),receipt=row.encrypted_receipt?await openPayment<z.output<typeof receiptSchema>>(row.encrypted_receipt,key,`receipt/${row.affiliate_user_id}/${row.id}`):null;
      await audit(row.workspace_id,'payment_details_viewed').run();return {method:'bank' as const,destination,receipt};
    },
    async partnerDashboard(){
      const rows=await all<Omit<Wallet,'available'|'debt'>>(db,`${walletQuery} WHERE a.affiliate_user_id=? GROUP BY a.id,o.currency,o.decimals`,identity.userId);
      const requests=await all<Payout>(db,`SELECT ${payoutPublicFields.split(',').map(f=>'pr.'+f).join(',')},${recipientIdentityApproved('pr.affiliate_user_id')} AS identity_approved,w.name AS business_name,f.display_name AS partner_name FROM payout_requests pr JOIN workspaces w ON w.id=pr.workspace_id JOIN affiliate_profiles f ON f.user_id=pr.affiliate_user_id WHERE pr.affiliate_user_id=? ORDER BY pr.created_at DESC LIMIT 100`,identity.userId);
      return {bank:await profile(),wallets:rows.map(wallet),requests};
    },
    async merchantDashboard(){
      const business=await s.workspace();if(!business)return null;
      const rows=await all<Omit<Wallet,'available'|'debt'>>(db,`${walletQuery} WHERE w.id=? AND w.owner_id=? GROUP BY a.id,o.currency,o.decimals`,business.id,identity.userId);
      const requests=await all<Payout>(db,`SELECT ${payoutPublicFields.split(',').map(f=>'pr.'+f).join(',')},${recipientIdentityApproved('pr.affiliate_user_id')} AS identity_approved,f.display_name AS partner_name,? AS business_name,CASE WHEN ${approvedFor('pr.application_id','pr.currency','pr.decimals')}>=${committedFor('pr.application_id','pr.currency','pr.decimals')} THEN 1 ELSE 0 END AS covered,CASE WHEN ${sourceReady('pr.application_id')} THEN 1 ELSE 0 END AS sync_ready FROM payout_requests pr JOIN affiliate_profiles f ON f.user_id=pr.affiliate_user_id WHERE pr.workspace_id=? ORDER BY CASE pr.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END,pr.created_at DESC LIMIT 100`,business.name,business.id);
      const orders=await all<ApprovalOrder>(db,`SELECT o.id,o.external_id,o.application_id,o.currency,o.decimals,${effectiveCommission()} AS commission,o.revision,CASE WHEN ${shopifyHold()} THEN 'review' ELSE o.commission_state END AS commission_state,o.created_at,CASE WHEN ${sourceReady('o.application_id')} THEN 1 ELSE 0 END AS sync_ready,MIN(${effectiveCommission()},COALESCE(ca.amount,0)) AS approved_amount,ca.revision AS approved_revision,f.display_name AS partner_name FROM orders o JOIN store_connections c ON c.id=o.store_id JOIN applications a ON a.id=o.application_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id LEFT JOIN commission_approvals ca ON ca.order_id=o.id WHERE c.workspace_id=? ORDER BY CASE WHEN o.commission_state='accrued' AND o.commission>COALESCE(ca.amount,0) THEN 0 ELSE 1 END,o.received_at DESC LIMIT 100`,business.id);
      return {wallets:rows.map(wallet),requests,orders};
    },
  };
}
export function payoutCsv(rows:Payout[]){
  const cell=(value:unknown)=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const amount=(r:Payout)=>{const raw=String(r.amount).padStart(r.decimals+1,'0');return r.decimals?raw.slice(0,-r.decimals)+'.'+raw.slice(-r.decimals):raw;};
  const data=[['Request ID','Business','Partner','Amount','Currency','Status','Destination ending','Requested UTC','Recorded payment date','Decline reason','Method','Reversed minor units','Stripe transfer ID'],...rows.map(r=>[r.id,r.business_name||'',r.partner_name||'',amount(r),r.currency,r.status,r.account_hint,r.created_at,r.paid_date||'',r.reason||'',r.method||'bank',r.reversed_amount||0,r.stripe_transfer_id||''])];
  return '\ufeff'+data.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
