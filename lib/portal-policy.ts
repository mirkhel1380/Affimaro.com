export const portals=['brand','affiliate','creator','agency'] as const;
export type Portal=typeof portals[number];
export const businessPortal=(p:Portal)=>p==='brand'||p==='agency';
export const portalFamily=(p:Portal)=>businessPortal(p)?'brand':'affiliate';
export const portalHome=(p:Portal)=>({brand:'/workspace',affiliate:'/partner',creator:'/creator',agency:'/agency'})[p];
export const portalName=(p:Portal)=>({brand:'Brand',affiliate:'Affiliate',creator:'Creator',agency:'Agency'})[p];
export const portalView=(p:Portal)=>({brand:'business',affiliate:'affiliate',creator:'creator',agency:'agency'})[p];
export const programHome=(p:Portal)=>p==='agency'?'/agency/program':p==='creator'?'/creator/partnerships':portalHome(p);

// A primary business/profile is durable account ownership, not a browser toggle
// or user-editable provider metadata. Preserve legacy dual records as a brand.
export async function accountPortal(db:D1Database,userId:string):Promise<Portal|null>{
  const row=await db.prepare(`SELECT CASE
    WHEN EXISTS(SELECT 1 FROM account_portals WHERE user_id=?) THEN (SELECT portal FROM account_portals WHERE user_id=?)
    WHEN EXISTS(SELECT 1 FROM workspaces WHERE owner_id=?) THEN 'brand'
    WHEN EXISTS(SELECT 1 FROM affiliate_profiles WHERE user_id=?) THEN 'affiliate'
    ELSE (SELECT portal FROM platform_applications WHERE user_id=?) END AS portal`).bind(userId,userId,userId,userId,userId).first<{portal:Portal|null}>();
  return row?.portal||null;
}
export function portalForView(value:unknown):Portal|null{
  return value==='business'||value==='merchant'||value==='brand'?'brand':value==='affiliate'||value==='partner'?'affiliate':value==='creator'?'creator':value==='agency'?'agency':null;
}
export function writePortal(path:string,method:string,body:unknown):{portal:Portal;allowUnset:boolean}|null{
  const action=body&&typeof body==='object'&&'action' in body?body.action:null;
  if(path==='/api/business')return {portal:'brand',allowUnset:method==='POST'};
  if(path==='/api/affiliate')return {portal:'affiliate',allowUnset:true};
  if(['/api/program','/api/store','/api/shopify','/api/billing','/api/payment-connections','/api/stripe-transfers'].includes(path))return {portal:'brand',allowUnset:false};
  if(path==='/api/applications')return {portal:method==='POST'?'affiliate':'brand',allowUnset:false};
  if(path==='/api/stripe-connect'&&['configure','start','check'].includes(String(action)))return {portal:action==='configure'?'brand':'affiliate',allowUnset:false};
  if(path==='/api/payments'){
    if(['saveBank','bankDetails','request','cancel'].includes(String(action)))return {portal:'affiliate',allowUnset:false};
    if(['approveCommission','review','recordPaid'].includes(String(action)))return {portal:'brand',allowUnset:false};
  }
  return null;
}
