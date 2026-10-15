import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {getChatGPTUser} from '../../chatgpt-auth';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {stripeTransfers} from '../../../lib/stripe-transfers';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return action(request,async(_s,body)=>{
  const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(k=>!['action','data'].includes(k)))throw new AppError(400,'Invalid Stripe transfer request.');const api=stripeTransfers(getRawDb(),user,paymentDataKey());
  if(body.action==='preview')return api.preview(body.data);if(body.action==='send')return api.send(body.data);if(body.action==='reconcile')return api.reconcile(body.data);throw new AppError(400,'Unknown Stripe transfer action.');
});}
