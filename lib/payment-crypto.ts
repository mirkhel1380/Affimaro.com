import {AppError} from './service.ts';
const enc=new TextEncoder();
const hex=(data:Uint8Array)=>Array.from(data,n=>n.toString(16).padStart(2,'0')).join('');
const unhex=(data:string)=>Uint8Array.from(data.match(/../g)||[],s=>parseInt(s,16));
async function dataKey(value:string|undefined){
  if(!value||!/^[a-f0-9]{64}$/.test(value))throw new AppError(503,'Secure payment storage is unavailable. Please try again later.');
  return crypto.subtle.importKey('raw',unhex(value),'AES-GCM',false,['encrypt','decrypt']);
}
export async function sealPayment(value:unknown,key:string|undefined,context:string){
  const secret=await dataKey(key),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(`Affimaro/payment/v1/${context}`)},secret,enc.encode(JSON.stringify(value)));
  return `v1.${hex(iv)}.${hex(new Uint8Array(ciphertext))}`;
}
export async function openPayment<T>(value:string,key:string|undefined,context:string):Promise<T>{
  const secret=await dataKey(key),parts=value.split('.');
  try{
    if(parts.length!==3||parts[0]!=='v1'||!/^[a-f0-9]{24}$/.test(parts[1])||!/^(?:[a-f0-9]{2}){16,4096}$/.test(parts[2]))throw new Error('Invalid encrypted value.');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(parts[1]),additionalData:enc.encode(`Affimaro/payment/v1/${context}`)},secret,unhex(parts[2]));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }catch{throw new AppError(503,'These payment details could not be opened. Contact the workspace owner.');}
}
export async function referenceHash(reference:string,workspaceId:string){
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(`${workspaceId}\n${reference.trim().toUpperCase().replace(/\s+/g,' ')}`))));
}
