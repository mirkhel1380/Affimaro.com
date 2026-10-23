import {accountPortal,businessPortal} from './portal-policy.ts';
import {platformBillingCatalog} from './platform-billing-catalog.ts';
import {plansForRole,planCatalog} from './pricing-catalog.mjs';
import {selectedPlan,type Plan} from './plan-requests.ts';
import {AppError} from './service.ts';

export type BillingSelection={plan:Plan;portal:'brand'|'agency';priceId?:string;savedPrice?:true;legacyPrice?:boolean};
// Price selection comes from the durable account role and this owner's records.
// Browser role, amount and price identifiers never select a billing schedule.
export async function billingSelection(db:D1Database,userId:string,requested?:Plan,existing=false,notificationPrice?:string|null):Promise<BillingSelection>{
 const role=await accountPortal(db,userId);
 if(role&&!businessPortal(role))throw new AppError(403,'Affiliate and creator accounts are free.');
 const portal=role==='agency'?'agency':'brand';
 const row=await db.prepare(`SELECT COALESCE(c.price_id,b.price_id) AS price_id,COALESCE(c.amount,b.amount) AS amount,c.id AS pending_id,b.subscription_id,b.status FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN billing_checkouts c ON c.id=(SELECT x.id FROM billing_checkouts x WHERE x.account_id=b.id AND x.state IN ('creating','open','review') ORDER BY x.rowid DESC LIMIT 1) WHERE w.owner_id=? AND b.platform_id=? AND b.mode='live' ORDER BY b.updated_at DESC LIMIT 1`).bind(userId,platformBillingCatalog.accountId).first<{price_id:string|null;amount:number|null;pending_id:string|null;subscription_id:string|null;status:string}>();
 const saved=!!row&&(!!row.pending_id||existing&&!!row.subscription_id&&!['canceled','incomplete_expired'].includes(row.status));
 if(saved&&row.price_id){
  if(notificationPrice&&notificationPrice!==row.price_id)throw new AppError(409,'The notification price does not match this account’s current billing record.');
  const oldPlan=Object.entries(platformBillingCatalog.prices).find(([id,price])=>price===row.price_id&&planCatalog[id as Plan].amount*100===row.amount)?.[0] as Plan|undefined;
  const newPlan=Object.entries(plansForRole(portal)).find(([,plan])=>plan.amount*100===row.amount)?.[0] as Plan|undefined;
  const plan=oldPlan||newPlan;
  if(!plan||portal==='brand'&&!oldPlan)throw new AppError(409,'The saved subscription price needs reconciliation.');
  // An open legacy checkout retains its frozen price and payload. It cannot
  // become the default price of a later purchase after it expires/cancels.
  if(!requested||requested===plan||existing)return {plan,portal,priceId:row.price_id,savedPrice:true,...(portal==='agency'&&oldPlan?{legacyPrice:true}:{})};
 }
 return {plan:requested||await selectedPlan(db,userId),portal};
}
