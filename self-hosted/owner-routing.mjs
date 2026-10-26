// Optional owner host. Keep the working application host until DNS is ready.
export function ownerRouting(publicOrigin,value){
  if(value===undefined||value===null||value==='')return {origin:null,route:null};
  let main,owner;try{main=new URL(publicOrigin);owner=new URL(value);}catch{throw new Error('OWNER_ORIGIN must be the separate HTTPS admin subdomain.');}
  if(owner.protocol!=='https:'||owner.username||owner.password||owner.port||owner.pathname!=='/'||owner.search||owner.hash||owner.hostname!==`admin.${main.hostname}`||main.hostname.endsWith('.workers.dev')||main.hostname.endsWith('.chatgpt.site')||main.hostname.endsWith('.invalid'))throw new Error('OWNER_ORIGIN must be https://admin.YOUR_PUBLIC_DOMAIN with no path.');
  return {origin:owner.origin,route:{pattern:owner.hostname,custom_domain:true}};
}

export const ownerPath=path=>/^\/(owner|admin|auth\/owner|api\/(admin|owner))(\/|$)/.test(path);
export const ownerAsset=path=>path.startsWith('/_next/static/')||/^\/images\/page-(?:partnerships|creators|technology|support|v2-[a-z-]+)(?:-small)?\.webp$/.test(path)||['/portal-theme.js','/site-theme.css','/auth-icons/google.svg','/auth-icons/apple.svg','/auth-icons/sso.svg','/auth-form.js','/demo/favicon.svg','/demo/styles.css','/app.css','/marketing.css','/favicon.ico'].includes(path);

export function ownerHostRoute(request,publicOrigin,ownerOrigin){
  if(!ownerOrigin)return null;
  const url=new URL(request.url),read=['GET','HEAD'].includes(request.method),privateHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
  let path;try{path=decodeURIComponent(url.pathname);}catch{return Response.json({ok:false,error:'The address could not be read.'},{status:400,headers:privateHeaders});}
  if(url.origin===publicOrigin&&ownerPath(path)){
    if(read&&!path.startsWith('/api/'))return new Response(null,{status:307,headers:{...privateHeaders,Location:ownerOrigin+url.pathname+url.search}});
    return Response.json({ok:false,error:'Open the owner portal to perform this action.'},{status:403,headers:privateHeaders});
  }
  if(url.origin!==ownerOrigin)return null;
  if(read&&['/','/account'].includes(url.pathname))return new Response(null,{status:307,headers:{...privateHeaders,Location:'/owner'}});
  if(read&&['/auth/login','/auth/logout'].includes(url.pathname))return new Response(null,{status:307,headers:{...privateHeaders,Location:'/auth/owner/'+url.pathname.split('/').pop()}});
  if(!ownerPath(path)&&!ownerAsset(path))return Response.json({ok:false,error:'This address is reserved for the Affimaro owner portal.'},{status:404,headers:privateHeaders});
  return null;
}
