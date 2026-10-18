import {service,type Identity} from './service.ts';

export type SetupStep={id:string;title:string;detail:string;href:string;action:string;status:'complete'|'waiting'|'todo'};
export type SetupJourney={steps:SetupStep[];completed:number;total:number;next:SetupStep|null};
type BusinessFacts={program_id:string;rate_bps:number;window_days:number;program_active:number;reviewed:number;platform:string|null;connection_active:number|null;last_seen:string|null;approved_partners:number;orders:number};
type AffiliateFacts={applications:number;pending:number;approved:number;links:number};
const journey=(steps:SetupStep[]):SetupJourney=>({steps,completed:steps.filter(step=>step.status==='complete').length,total:steps.length,next:steps.find(step=>step.status!=='complete')||null});

// A read-only summary. Identity comes from server authentication, never a page parameter.
export async function gettingStarted(db:D1Database,identity:Identity){
  const s=service(db,identity);
  const [account,workspace,profile]=await Promise.all([s.account(),s.workspace(),s.profile()]);
  const one=<T>(query:string,...values:unknown[])=>db.prepare(query).bind(...values).first<T>();
  const [businessFacts,affiliateFacts,affiliateOrders]=await Promise.all([
    workspace?one<BusinessFacts>(`SELECT p.id AS program_id,p.rate_bps,p.window_days,p.active AS program_active,c.platform,c.active AS connection_active,c.last_seen,
      EXISTS(SELECT 1 FROM audit_events e WHERE e.workspace_id=w.id AND e.actor_id=w.owner_id AND e.action='program_updated') AS reviewed,
      (SELECT count(*) FROM applications a WHERE a.program_id=p.id AND a.status='approved') AS approved_partners,
      (SELECT count(*) FROM orders o JOIN store_connections sc ON sc.id=o.store_id JOIN applications a ON a.id=o.application_id JOIN programs op ON op.id=a.program_id WHERE sc.workspace_id=w.id AND op.workspace_id=w.id) AS orders
      FROM workspaces w JOIN programs p ON p.workspace_id=w.id LEFT JOIN store_connections c ON c.workspace_id=w.id WHERE w.id=? AND w.owner_id=?`,workspace.id,identity.userId):Promise.resolve(null),
    one<AffiliateFacts>(`SELECT count(*) AS applications,
      coalesce(sum(CASE WHEN a.status='pending' THEN 1 ELSE 0 END),0) AS pending,
      coalesce(sum(CASE WHEN a.status='approved' THEN 1 ELSE 0 END),0) AS approved,
      coalesce(sum(CASE WHEN a.status='approved' AND p.active=1 AND c.active=1 AND c.last_seen IS NOT NULL THEN 1 ELSE 0 END),0) AS links
      FROM applications a JOIN programs p ON p.id=a.program_id LEFT JOIN store_connections c ON c.workspace_id=p.workspace_id WHERE a.affiliate_user_id=?`,identity.userId),
    one<{orders:number}>(`SELECT count(*) AS orders FROM orders o JOIN applications a ON a.id=o.application_id JOIN programs p ON p.id=a.program_id JOIN store_connections c ON c.id=o.store_id AND c.workspace_id=p.workspace_id WHERE a.affiliate_user_id=?`,identity.userId),
  ]);
  const f=businessFacts,a=affiliateFacts,connected=!!f?.connection_active&&!!f.last_seen;
  const step=(id:string,title:string,detail:string,href:string,action:string,complete:boolean,waiting=false):SetupStep=>({id,title,detail,href,action,status:complete?'complete':waiting?'waiting':'todo'});
  const profileStep=()=>step('account','Create your Affimaro profile',account?'Your account profile is saved.':'Add your name so businesses and partners can recognize you.','/account',account?'View profile':'Create profile',!!account);
  const business=journey([
    profileStep(),
    step('workspace','Create your business workspace',workspace?`${workspace.name} is saved as your business workspace.`:'Add your business name. You can connect its store in a later step.','/workspace',workspace?'Open workspace':'Create workspace',!!workspace),
    step('program','Review and activate your program',f?`${f.rate_bps/100}% commission · ${f.window_days}-day attribution. ${!f.program_active?'Your program is paused. Activate it to accept new partners and referrals.':f.reviewed?'Your rules have been saved and your program is active.':'Review these starting rules, then choose Save program settings.'}`:'Choose your commission rate and attribution window after creating a workspace.','/workspace?tab=program','Review program',!!f?.program_active&&!!f.reviewed),
    step('store','Connect and verify your store',connected?`${f?.platform==='shopify'?'Shopify access has been verified. Sync from your store settings to update orders.':'A signed delivery has arrived from WooCommerce.'}`:f?.platform&&!f.connection_active?'Your store connection is paused. Resume it in store settings.':f?.platform?'The connection is saved. Finish its setup and verify it from your store.':'Choose WooCommerce or Shopify and follow its connection guide.','/workspace?tab=store',connected?'Manage store':'Connect store',connected),
    step('partner','Approve your first affiliate',(f?.approved_partners||0)>0?'An approved partner is in your program. Their referral link appears when the program and store are active.':'Share your application page with a partner, then review their application. You cannot apply to your own program.','/workspace?tab=partners','Review partners',(f?.approved_partners||0)>0),
    step('order','Receive your first referred order',(f?.orders||0)>0?'An attributed order has reached Affimaro. Review its status, commission and refund updates in Orders.':'Use an approved partner’s referral link for a staging order. For Shopify, sync afterwards. A connection test alone does not create an order.','/workspace?tab=orders','View orders',(f?.orders||0)>0),
  ]);
  const linkDetail=(a?.links||0)>0?'Your affiliate portal has a referral link for an active program and verified store.':(a?.pending||0)>0?'A business is reviewing your application. Check your affiliate portal for its decision.':(a?.approved||0)>0?'You are approved. The business must activate its program and verify its store before your referral link appears.':'The business reviews each application. Your referral link appears after approval and store setup.';
  const affiliate=journey([
    profileStep(),
    step('profile','Complete your affiliate profile',profile?'Your audience and main channel are saved. You can update them at any time.':'Tell businesses about your audience and how you plan to promote them.','/partner',profile?'Edit affiliate profile':'Create affiliate profile',!!profile),
    step('application','Apply using a business’s invitation link',(a?.applications||0)>0?'Your submitted applications are listed in your affiliate portal.':'Ask a business for its Affimaro application link. You do not need a business workspace or subscription to apply.','/partner','View applications',(a?.applications||0)>0),
    step('link','Get your approved referral link',linkDetail,'/partner','Open affiliate portal',(a?.links||0)>0,(a?.pending||0)>0||(a?.approved||0)>0),
    step('order','See your first referred order',(affiliateOrders?.orders||0)>0?'A referred order is recorded in your affiliate portal. Commission availability depends on the business’s approval and any refunds.':'Share your own referral link. Orders appear after the store sends them; Shopify also needs a business-triggered sync.','/partner','View referred orders',(affiliateOrders?.orders||0)>0),
  ]);
  return {account,businessName:workspace?.name||null,programId:f?.program_id||null,business,affiliate};
}
