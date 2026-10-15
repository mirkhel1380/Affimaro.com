import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {getChatGPTUser} from '../../chatgpt-auth';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {stripeConnect} from '../../../lib/stripe-connect';
import {AppError} from '../../../lib/service';
import {publicOrigin} from '../../../lib/public-origin-runtime';
export async function POST(request:Request){return action(request,async(_s,body)=>{
  const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');
  if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(k=>!['action','data'].includes(k)))throw new AppError(400,'Invalid Stripe setup request.');const api=stripeConnect(getRawDb(),user,paymentDataKey(),fetch,publicOrigin());
  if(body.action==='configure')return api.configure(body.data);if(body.action==='start')return api.start(body.data);if(body.action==='check')return api.check(body.data);throw new AppError(400,'Unknown Stripe setup action.');
});}
