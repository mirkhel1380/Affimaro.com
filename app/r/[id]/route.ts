import {getRawDb} from '../../../db';
import {referralRedirect} from '../../../lib/link-clicks';
import {AppError} from '../../../lib/service';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await referralRedirect(getRawDb(),request,(await params).id);}catch(e){return Response.json({ok:false,error:e instanceof AppError?e.message:'This referral link is temporarily unavailable.'},{status:e instanceof AppError?e.status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});}}
export const HEAD=GET;
