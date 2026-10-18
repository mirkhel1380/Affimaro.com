import type {Identity} from './service.ts';
import {isPlatformAdmin,getAdmission} from './admissions.ts';
import {accountPortal,businessPortal,portalHome} from './portal-policy.ts';
import {planCatalog} from './pricing-catalog.mjs';
export async function checkoutDestination(db:D1Database,user:Identity,plan?:string){
 if(await isPlatformAdmin(db,user.userId))return '/owner';
 const portal=await accountPortal(db,user.userId);if(!portal)return '/application';
 const selected=Object.hasOwn(planCatalog,plan||'')?plan:null,path=businessPortal(portal)?(portal==='agency'?'/agency/billing':'/billing')+(selected?'?plan='+selected:''):portalHome(portal);
 if((await getAdmission(db,user.userId))?.status!=='approved')return '/application?return_to='+encodeURIComponent(path);
 return businessPortal(portal)&&selected?path:portalHome(portal);
}
