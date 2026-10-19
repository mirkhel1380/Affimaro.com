import { AppError } from "./service.ts";
export function assertSameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(!origin||origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Open the form on this site and try again.');
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError(415,'This endpoint requires JSON.');
}
export async function readJson(request:Request,maximum=16384) {
  const length=Number(request.headers.get('content-length')||0);
  if(length>maximum)throw new AppError(413,'The request is too large.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'The request is not valid JSON.');
  const chunks:Uint8Array[]=[];let bytes=0;
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maximum){await reader.cancel();throw new AppError(413,'The request is too large.');}chunks.push(part.value);}
  const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{throw new AppError(400,'The request is not valid JSON.');}
}
