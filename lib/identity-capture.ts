import {z} from 'zod';
import {AppError} from './service.ts';
import {identityMaxImageBytes} from './identity-catalog.ts';
import {sealIdentityProfile,openIdentityProfile} from './identity-crypto.ts';
const ticketSchema=z.object({id:z.string().uuid(),userId:z.string().min(1).max(200),revision:z.number().int().min(0).safe(),documentType:z.enum(['passport','national_id','driving_licence']),movement:z.enum(['left','right','blink']),issued:z.number().int().positive(),expires:z.number().int().positive()}).strict();
export async function issueIdentityCapture(userId:string,revision:number,documentType:'passport'|'national_id'|'driving_licence',key?:string){
 const issued=Math.floor(Date.now()/1000),movement=(['left','right','blink'] as const)[crypto.getRandomValues(new Uint8Array(1))[0]%3],value={id:crypto.randomUUID(),userId,revision,documentType,movement,issued,expires:issued+300};
 return {ticket:await sealIdentityProfile(value,key,'capture/'+userId),expiresAt:new Date(value.expires*1000).toISOString(),movement,documentType,revision};
}
export async function readIdentityCapture(ticket:string,userId:string,revision:number,documentType:string,key?:string){
 let value:z.infer<typeof ticketSchema>;try{value=ticketSchema.parse(await openIdentityProfile(ticket,key,'capture/'+userId));}catch{throw new AppError(400,'Start a fresh camera session from the identity form.');}
 const now=Math.floor(Date.now()/1000);if(value.userId!==userId||value.revision!==revision||value.documentType!==documentType||value.issued>now+5||value.expires<=now||value.expires-value.issued!==300)throw new AppError(409,'Your camera session expired or changed. Start again.');return value;
}
export function identityVideo(bytes:Uint8Array,mime:'video/webm'|'video/mp4'){
 if(bytes.length<1000||bytes.length>identityMaxImageBytes)throw new AppError(400,'Record a clear short selfie clip in the identity camera.');
 const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.subarray(a,b));
 const valid=mime==='video/webm'?bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163&&ascii(0,Math.min(256,bytes.length)).includes('webm'):ascii(4,8)==='ftyp'&&['isom','iso2','iso5','iso6','mp41','mp42','avc1','M4V ','qt  '].includes(ascii(8,12));
 if(!valid)throw new AppError(400,'This selfie clip could not be read. Record it again.');return bytes;
}
