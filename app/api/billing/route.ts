import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {billing} from '../../../lib/billing';
import {billingConfig} from '../../../lib/billing-runtime';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {AppError} from '../../../lib/service';
export const dynamic='force-dynamic';
export async function POST(request:Request){return action(request,async(_s,body,user)=>{
  if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(key=>!['action','data'].includes(key)))throw new AppError(400,'Invalid billing request.');
  const api=billing(getRawDb(),user,billingConfig(),paymentDataKey());
  if(body.action==='preview')return api.preview(body.data);if(body.action==='checkout')return api.checkout(body.data);if(body.action==='refresh')return api.refresh(body.data);if(body.action==='portal')return api.portal(body.data);throw new AppError(400,'Unknown billing action.');
});}
