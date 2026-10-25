import {AppError,type Identity} from './service.ts';
import {identityVerification} from './identity-verification.ts';
import {assertSameOrigin,readJson} from './request.ts';
import {identityMaxRequestBytes,identityMaxImageBytes} from './identity-catalog.ts';

const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
export async function readIdentityUpload(request:Request){
 const type=request.headers.get('content-type')||'';
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Open the identity form on this site and try again.');
 if(!/^multipart\/form-data;\s*boundary=/i.test(type)||type.length>250)throw new AppError(415,'Use the private identity upload form.');
 if(Number(request.headers.get('content-length')||0)>identityMaxRequestBytes)throw new AppError(413,'The identity upload is too large.');
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,'Complete the identity upload.');
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>identityMaxRequestBytes){await reader.cancel();throw new AppError(413,'The identity upload is too large.');}chunks.push(part.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':type}}).formData();}catch{throw new AppError(400,'The identity upload could not be read.');}
 const files:Record<string,Uint8Array>={};let profile:unknown;
 for(const name of new Set(form.keys())){
  if(!['profile','front','back','selfie'].includes(name)||form.getAll(name).length!==1)throw new AppError(400,'Use each identity form field once.');
  const value=form.get(name)!;
  if(name==='profile'){if(typeof value!=='string'||value.length>2048)throw new AppError(400,'Complete the identity details.');try{profile=JSON.parse(value);}catch{throw new AppError(400,'The identity details could not be read.');}}
  else{if(typeof value==='string'||value.type!=='image/jpeg'||value.size>identityMaxImageBytes)throw new AppError(400,'Use the identity form to prepare each required JPG photo.');files[name]=new Uint8Array(await value.arrayBuffer());}
 }
 if(!profile)throw new AppError(400,'Complete the identity details.');return {profile,files};
}
export async function identityEndpoint(request:Request,context:{db:D1Database;user:Identity|null;key?:string;independent:boolean;owner?:boolean;document?:boolean}){
 try{
  if(!context.user)throw new AppError(401,'Sign in to continue.');
  if(!context.independent)throw new AppError(503,'Open private identity verification on the independent Affimaro website.');
  const service=identityVerification(context.db,context.user,context.key),url=new URL(request.url);
  if(context.document){
   if(request.method!=='GET'||[...url.searchParams.keys()].length!==1||url.searchParams.getAll('document').length!==1)throw new AppError(400,'Choose one private identity photo.');
   const result=await service.document(url.searchParams.get('document')!,!!context.owner);
   return new Response(result.bytes,{headers:{...headers,'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="identity-'+result.slot+'.jpg"','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
  }
  let data:unknown;
  if(request.method==='GET'){
   if(context.owner){if([...url.searchParams.keys()].length!==1||url.searchParams.getAll('user').length!==1)throw new AppError(400,'Choose one identity submission.');data=await service.ownerDetails(url.searchParams.get('user')!);}
   else{if(url.search)throw new AppError(400,'Use your own identity status page.');data=await service.snapshot();}
  }else if(request.method==='POST'){
   if(url.search)throw new AppError(400,'Use the private identity form.');
   if(context.owner){assertSameOrigin(request);data=await service.review(await readJson(request,4096));}
   else{const upload=await readIdentityUpload(request);data=await service.submit(upload.profile,upload.files);}
  }else throw new AppError(405,'Use the private identity form.');
  return Response.json({ok:true,data},{headers});
 }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'Identity verification is temporarily unavailable. Try again later.'},{status:error instanceof AppError?error.status:503,headers});}
}
