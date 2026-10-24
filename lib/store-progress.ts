import type {Connection} from './woocommerce';
import type {ShopifyStatus} from './shopify';
export type StorePortal='brand'|'agency';
export function storeWorkspacePath(portal:StorePortal,tab:'store'|'orders'|'program'='store'){return (portal==='agency'?'/agency/program':'/workspace')+'?tab='+tab;}
type Evidence={connection:Pick<Connection,'platform'|'active'|'last_seen'>|null;programActive:boolean;referrals:number;orders:number;shopify?:Pick<ShopifyStatus,'scopes'|'synced_through'|'in_progress'|'last_result'|'pending'>|null};
export function storeConnectionProgress(input:Evidence){
 const {connection,programActive,referrals,orders}=input,isShopify=connection?.platform==='shopify',shop=input.shopify,active=!!connection?.active,verified=!!connection?.last_seen&&(!isShopify||!!shop?.scopes.includes('read_orders')),syncing=!!shop?.in_progress||shop?.last_result?.hasMore===true,held=!!shop?.pending.length,synced=!!shop?.synced_through&&!syncing&&!held;
 const steps=[
  {id:'connection',title:'Create the connection',complete:!!connection,detail:'Keep one store connection in this represented program.'},
  {id:'verification',title:'Verify an active connection',complete:active&&verified,detail:isShopify?'Verify the merchant-owned app and required order access.':'Receive a valid signed delivery from your store.'},
  {id:'program',title:'Activate the partner program',complete:programActive,detail:'The program controls new partner applications and referral links.'},
  ...(isShopify?[{id:'sync',title:'Complete Shopify sync',complete:synced,detail:held?'Orders are waiting for data or review.':syncing?'More batches remain. Continue Shopify sync.':synced?'The saved sync is complete.':'Run the first Shopify sync from the connection panel.'}]:[]),
  {id:'referral',title:'First referral recorded',complete:referrals>0,detail:referrals+' recorded referral '+(referrals===1?'session. ':'sessions. ')+(isShopify?'Shopify sessions come from imported order conversions.':'Referral registration requires a valid store delivery.')},
  {id:'order',title:'First referred order',complete:orders>0,detail:orders+' referred '+(orders===1?'order':'orders')+' recorded. Order eligibility and commission approval are separate checks.'},
 ];
 let state:string,title:string,nextStep:string,badge:string,nextTab:'store'|'orders'|'program'='store';
 if(!connection){state='not_connected';title='Store not connected';badge='unconfigured';nextStep='Choose WooCommerce, Shopify or a custom website and create its connection.';}
 else if(!active){state='connection_paused';title='Connection paused';badge='paused';nextStep='Resume the connection in the panel below before collecting new store data.';}
 else if(!programActive){state='program_paused';title='Partner program paused';badge='paused';nextStep='Review your program settings before enabling new referral links. Existing records are retained.';nextTab='program';}
 else if(!verified){state='verification_pending';title='Waiting for connection verification';badge='waiting';nextStep=isShopify?'Verify the Shopify app credentials and order access in the connection panel.':connection.platform==='custom'?'Run the signed connection test from your website backend.':'Run Test connection in WordPress after saving the connection ID and signing key.';}
 else if(isShopify&&syncing){state='syncing';title='Shopify sync needs another batch';badge='processing';nextStep='Use Continue Shopify sync in the connection panel until the batch is complete.';}
 else if(isShopify&&held){state='review';title='Shopify data needs attention';badge='attention';nextStep='Review the orders waiting for data in the connection panel, then sync again.';}
 else if(isShopify&&!synced){state='sync_pending';title='First Shopify sync pending';badge='waiting';nextStep='Use Sync Shopify orders in the connection panel. Verifying app access alone does not import orders.';}
 else if(referrals===0){state='referral_pending';title='Waiting for referral data';badge='verified';nextStep=isShopify?'The completed sync has no recorded referral sessions yet. Shopify test orders are excluded. Review the setup guide and approved partner links.':'The connection is verified. Follow the setup guide to check an approved partner referral link.';}
 else if(orders===0){state='order_pending';title='Waiting for a referred order';badge='verified';nextStep=isShopify?'An eligible referred order appears after a completed Shopify sync. An empty sync can be valid.':'Referral data has arrived. Referred order data appears when your store delivers its signed order update.';}
 else{state='order_received';title='Referred order data received';badge='received';nextStep='Open referred orders and review their status before approving commission.';nextTab='orders';}
 return {state,title,nextStep,badge,nextTab,steps,completed:steps.filter(step=>step.complete).length,total:steps.length,verifiedAt:connection?.last_seen||null,syncedThrough:shop?.synced_through||null,guidePath:connection?.platform==='shopify'?'/guides/shopify-setup':connection?.platform==='custom'?'/guides/custom-website-setup':'/guides/woocommerce-setup'};
}
export type StoreProgress=ReturnType<typeof storeConnectionProgress>;
