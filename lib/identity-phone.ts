import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {requireApprovedAccount,isPlatformAdmin} from './admissions.ts';
import {accountPortal} from './portal-policy.ts';
import {identityVerification} from './identity-verification.ts';
import {readIdentityCapture} from './identity-capture.ts';
import {assertSameOrigin,readJson} from './request.ts';
const data=z.object({revision:z.number().int().min(0).safe(),documentType:z.enum(['passport','national_id','driving_licence'])}).strict();
const claim=data.extend({portal:z.enum(['affiliate','creator']),ticket:z.string().min(20).max(2048)}).strict();
const bodySchema=z.discriminatedUnion('action',[z.object({action:z.literal('create'),data}).strict(),z.object({action:z.literal('claim'),data:claim}).strict()]);
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function identityPhoneEndpoint(request:Request,context:{db:D1Database;user:Identity|null;key?:string;independent:boolean}){
 try{
  if(!context.user)throw new AppError(401,'Sign in to the same Affimaro account that created this QR code.');
  if(!context.independent)throw new AppError(503,'Continue identity verification on affimaro.com.');
  if(request.method!=='POST'||new URL(request.url).search)throw new AppError(405,'Use the private phone continuation form.');assertSameOrigin(request);
  const parsed=bodySchema.safeParse(await readJson(request,4096));if(!parsed.success)throw new AppError(400,'Create a fresh QR code from your identity form.');
  const {db,user}=context;await requireApprovedAccount(db,user);const portal=await accountPortal(db,user.userId);if(!['affiliate','creator'].includes(portal||'')||await isPlatformAdmin(db,user.userId))throw new AppError(403,'Phone identity verification is for your own affiliate or creator account.');
  const api=identityVerification(db,user,context.key),value=parsed.data;
  if(value.action==='create'){
   const session=await api.createCapture(value.data),url=new URL('/identity/phone',request.url);url.hash=new URLSearchParams({portal:portal!,ticket:session.ticket,documentType:session.documentType,revision:String(session.revision)}).toString();
   return Response.json({ok:true,data:{url:url.href,expiresAt:session.expiresAt,revision:session.revision}},{headers});
  }
  if(value.data.portal!==portal)throw new AppError(403,'Sign in to the same account that created this QR code.');
  const snapshot=await api.snapshot();if(snapshot.revision!==value.data.revision||!snapshot.canResubmit)throw new AppError(409,'This identity form changed. Create a fresh QR code on your computer.');
  const now=Math.floor(Date.now()/1000),id='identity-phone/'+user.userId+'/'+Math.floor(now/300);await db.prepare('INSERT INTO auth_rate_limits(id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').bind(id,(Math.floor(now/300)+1)*300).run();const rate=await db.prepare('SELECT count FROM auth_rate_limits WHERE id=?').bind(id).first<{count:number}>();if((rate?.count||0)>15)throw new AppError(429,'Too many continuation attempts. Wait before trying again.');
  try{await readIdentityCapture(value.data.ticket,user.userId,snapshot.revision,value.data.documentType,context.key);}catch(error){if(error instanceof AppError&&error.status===400)throw new AppError(403,'This QR could not be matched to this account. Sign in to the account that created it, or create a fresh code.');throw error;}
  // This QR never creates or transfers a login session or opens stored evidence.
  const path=(portal==='creator'?'/creator/identity':'/partner/identity')+'#phone-document='+value.data.documentType;
  return Response.json({ok:true,data:{path}},{headers});
 }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'Phone continuation is temporarily unavailable. Try again later.'},{status:error instanceof AppError?error.status:503,headers});}
}
