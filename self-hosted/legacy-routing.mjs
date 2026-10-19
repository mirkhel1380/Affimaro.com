import {independentRouting} from './routing.mjs';
import {ownerPath} from './owner-routing.mjs';
export function legacyRouting(publicOrigin,value){
 if(!value)return {origin:null,workersSubdomain:null};
 const legacy=independentRouting(value),main=independentRouting(publicOrigin);
 if(!legacy.workersSubdomain||main.workersSubdomain||main.origin===legacy.origin)throw new Error('LEGACY_ORIGIN must retain this Worker’s original workers.dev origin alongside its custom domain.');
 return {origin:legacy.origin,workersSubdomain:legacy.workersSubdomain};
}
export function legacyHostRoute(request,publicOrigin,ownerOrigin,legacyOrigin){
 const url=new URL(request.url);if(!legacyOrigin||url.origin!==legacyOrigin)return null;
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
 // These endpoints verify original request bytes, signatures and saved account IDs.
 if(request.method==='POST'&&['/api/billing/webhook','/api/woocommerce/event','/api/custom/event'].includes(url.pathname))return null;
 if(['GET','HEAD'].includes(request.method)&&!url.pathname.startsWith('/api/')){
  let path;try{path=decodeURIComponent(url.pathname);}catch{return Response.json({ok:false,error:'Invalid address.'},{status:400,headers});}
  return new Response(null,{status:307,headers:{...headers,Location:(ownerOrigin&&ownerPath(path)?ownerOrigin:publicOrigin)+url.pathname+url.search}});
 }
 return Response.json({ok:false,error:'Open the current Affimaro website before submitting this request.'},{status:409,headers});
}
