import {getRawDb} from '../../../db';
import {submitContact} from '../../../lib/contact-inbox';
import {publicMarketingResponse} from '../../../lib/marketing';
import {readJson} from '../../../lib/request';
import {AppError} from '../../../lib/service';

const formType='application/x-www-form-urlencoded';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function readForm(request:Request){
 const maximum=65536;if(Number(request.headers.get('content-length')||0)>maximum)throw new AppError(413,'The message is too large.');
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,'Check your message and try again.');
 const parts:Uint8Array[]=[];let length=0;
 while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>maximum){await reader.cancel();throw new AppError(413,'The message is too large.');}parts.push(part.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new AppError(400,'The message is not valid text.');}
 const values=new URLSearchParams(text),data:Record<string,string>=Object.create(null);
 for(const [key,value] of values){if(Object.hasOwn(data,key))throw new AppError(400,'Use one value for each contact field.');data[key]=value;}
 if(data.id==='')delete data.id;return data;
}

export async function POST(request:Request){
 const type=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase(),native=type===formType;let draft:Record<string,string>|undefined;
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Open the contact form on this site and try again.');
  if(type!=='application/json'&&!native)throw new AppError(415,'Use the contact form to send your message.');
  const body=native?await readForm(request):await readJson(request,24576);
  if(native)draft=body as Record<string,string>;
  const result=await submitContact(getRawDb(),body,request.headers.get('cf-connecting-ip'));
  return native?publicMarketingResponse('/contact',{contactReference:result.reference}):Response.json({ok:true,data:result},{headers});
 }catch(error){
  const status=error instanceof AppError?error.status:500,message=error instanceof AppError?error.message:'Your message could not be saved. Please try again.';
  if(native)return publicMarketingResponse('/contact',{contactError:message,contactDraft:draft},status);
  return Response.json({ok:false,error:message},{status,headers});
 }
}
