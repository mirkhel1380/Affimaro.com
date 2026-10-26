import {AppError,type Identity} from './service.ts';
import {shopifyHold,sourceReady} from './commission-query.ts';
import {closureBalanceHoldsSql} from './payments.ts';
import {assertAccountOpen} from './account-state.ts';

// A retained tombstone is the authority even while a provider JWT is still valid.
// Every blocker is re-evaluated inside the same transaction that closes the account.
const holds=`WITH closing AS (SELECT ? AS user_id), holds AS (
 SELECT 'owner' AS reason FROM platform_admins WHERE user_id=(SELECT user_id FROM closing)
 UNION ALL SELECT 'billing' FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id WHERE w.owner_id=(SELECT user_id FROM closing) AND b.mode='live' AND b.subscription_id IS NOT NULL AND ((b.status NOT IN ('canceled','incomplete_expired') AND NOT(b.cancel_at_period_end=1 AND b.status IN ('active','trialing') AND b.invoice_paid=1)) OR b.last_verified_at IS NULL OR b.last_verified_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes'))
 UNION ALL SELECT 'billing_operation' FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id WHERE w.owner_id=(SELECT user_id FROM closing) AND b.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 UNION ALL SELECT 'checkout' FROM billing_checkouts c JOIN workspaces w ON w.id=c.workspace_id WHERE w.owner_id=(SELECT user_id FROM closing) AND c.state IN ('creating','open','review')
 UNION ALL SELECT 'payout' FROM payout_requests pr JOIN workspaces w ON w.id=pr.workspace_id WHERE (pr.affiliate_user_id=(SELECT user_id FROM closing) OR w.owner_id=(SELECT user_id FROM closing)) AND pr.status IN ('requested','approved','processing')
 UNION ALL SELECT 'transfer' FROM stripe_transfer_attempts st JOIN workspaces w ON w.id=st.workspace_id JOIN payout_requests pr ON pr.id=st.request_id WHERE (w.owner_id=(SELECT user_id FROM closing) OR pr.affiliate_user_id=(SELECT user_id FROM closing)) AND st.state IN ('processing','review')
 UNION ALL SELECT 'orders' FROM orders o JOIN applications a ON a.id=o.application_id JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id WHERE (a.affiliate_user_id=(SELECT user_id FROM closing) OR w.owner_id=(SELECT user_id FROM closing)) AND (o.commission_state IN ('review','pending') OR ${shopifyHold()} OR NOT ${sourceReady('a.id')})
 UNION ALL SELECT 'balance' FROM (${closureBalanceHoldsSql})
)`;
const messages:Record<string,string>={owner:'The platform owner account cannot be closed here.',billing:'Cancel your subscription in Package & billing. Check the cancellation status again before closing.',billing_operation:'A billing update is in progress. Wait for it to finish, then recheck account closure.',checkout:'Resolve or cancel your saved subscription checkout in Package & billing.',payout:'Finish all open commission payment requests before closing.',transfer:'Resolve pending or uncertain commission transfers with support.',orders:'Complete pending orders, resolve order reviews and finish any required store sync before closing.',balance:'Settle outstanding commission balances and refund adjustments before closing.'};
export async function accountClosureStatus(db:D1Database,userId:string){
 await assertAccountOpen(db,userId);
 const rows=(await db.prepare(`${holds} SELECT DISTINCT reason FROM holds`).bind(userId).all<{reason:string}>()).results;
 return {eligible:rows.length===0,blockers:rows.map(r=>({code:r.reason,message:messages[r.reason]||'Contact support before closing this account.'}))};
}
export async function closeAccount(db:D1Database,identity:Identity,reason:string){
 await assertAccountOpen(db,identity.userId);const status=await accountClosureStatus(db,identity.userId);
 if(!status.eligible)throw new AppError(409,status.blockers.map(b=>b.message).join(' '));
 const at=new Date().toISOString();
 await db.batch([
  db.prepare(`${holds} INSERT INTO account_closures(user_id,reason,closed_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=?) AND NOT EXISTS(SELECT 1 FROM holds) ON CONFLICT(user_id) DO NOTHING`).bind(identity.userId,identity.userId,reason,at,identity.userId),
  db.prepare("UPDATE programs SET active=0 WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id=?) AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)").bind(identity.userId,identity.userId),
  db.prepare("UPDATE applications SET status='suspended',updated_at=? WHERE (affiliate_user_id=? OR program_id IN (SELECT p.id FROM programs p JOIN workspaces w ON w.id=p.workspace_id WHERE w.owner_id=?)) AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)").bind(at,identity.userId,identity.userId,identity.userId),
  db.prepare("UPDATE media_properties SET status='revoked',verified_at=NULL,revision=revision+1,updated_at=? WHERE user_id=? AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)").bind(at,identity.userId,identity.userId),
  db.prepare('DELETE FROM member_profiles WHERE user_id=? AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)').bind(identity.userId,identity.userId),
  db.prepare('DELETE FROM identity_documents WHERE user_id=? AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)').bind(identity.userId,identity.userId),
  db.prepare('DELETE FROM identity_verifications WHERE user_id=? AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)').bind(identity.userId,identity.userId),
  db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)').bind(identity.userId,identity.userId),
  db.prepare("INSERT INTO platform_review_events(id,applicant_id,actor_id,action,revision,note,created_at) SELECT ?,user_id,?,'account_closed',revision,?,? FROM platform_applications WHERE user_id=? AND EXISTS(SELECT 1 FROM account_closures WHERE user_id=?)").bind(crypto.randomUUID(),identity.userId,'Account access closed; financial and review records retained.',at,identity.userId,identity.userId),
 ]);
 if(!await db.prepare('SELECT user_id FROM account_closures WHERE user_id=?').bind(identity.userId).first())throw new AppError(409,'Your account changed. Recheck its outstanding activity before closing.');
 return {closed:true};
}
