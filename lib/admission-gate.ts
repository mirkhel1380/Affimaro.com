import {portalHome} from './portal-policy.ts';
import type {Identity} from './service.ts';
import {getAdmission,isPlatformAdmin} from './admissions.ts';

// The authenticated entry checks this before dispatching any private page/API.
// Signed store events use their existing HMAC boundary and never enter here.
export async function admissionGate(request:Request,db:D1Database,user:Identity){
  const url=new URL(request.url),path=url.pathname,headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  const owner=await isPlatformAdmin(db,user.userId);
  if(/^\/(owner|admin|api\/(owner|admin))(\/|$)/.test(path))return owner?null:Response.json({ok:false,error:'Only the Affimaro owner can open the control panel.'},{status:403,headers});
  if(owner&&['GET','HEAD'].includes(request.method)&&!path.startsWith('/api/'))return new Response(null,{status:307,headers:{...headers,Location:'/owner'}});
  if(path==='/application'||path==='/api/application')return null;
  const app=await getAdmission(db,user.userId);if(app?.status==='approved'){
    const destination=/^\/creator(\/|$)/.test(path)?'creator':/^\/agency(\/|$)/.test(path)?'agency':/^\/workspace(\/|$)/.test(path)?'brand':/^\/partner(\/|$)/.test(path)?'affiliate':null;
    if(destination&&app.portal!==destination)return new Response(null,{status:307,headers:{...headers,Location:portalHome(app.portal)}});
    return null;
  }
  if(['GET','HEAD'].includes(request.method)&&!path.startsWith('/api/'))return new Response(null,{status:307,headers:{...headers,Location:'/application?return_to='+encodeURIComponent(path+url.search)}});
  return Response.json({ok:false,error:app?.status==='pending'?'Your Affimaro application is under review.':'Complete your application and wait for owner approval.',applicationPath:'/application'},{status:403,headers});
}
