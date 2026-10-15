// Separate domain and key from stored payment details. Provider tokens stay server-side.
const encoder=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>Uint8Array.from(value.match(/../g)!,x=>parseInt(x,16));
async function key(value:string){return crypto.subtle.importKey('raw',bytes(value),'AES-GCM',false,['encrypt','decrypt']);}
export async function sealAuth(value:unknown,secret:string,context:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('Affimaro/auth/v1/'+context)},await key(secret),encoder.encode(JSON.stringify(value)));
  return `a1.${hex(iv)}.${hex(new Uint8Array(cipher))}`;
}
export async function openAuth(value:string,secret:string,context:string):Promise<unknown>{
  const parts=value.split('.');
  if(parts.length!==3||parts[0]!=='a1'||!/^[a-f0-9]{24}$/.test(parts[1])||!/^(?:[a-f0-9]{2}){16,24576}$/.test(parts[2]))throw new Error('Invalid authentication envelope.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[1]),additionalData:encoder.encode('Affimaro/auth/v1/'+context)},await key(secret),bytes(parts[2]));
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
}
