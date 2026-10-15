import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {payments} from '../../../lib/payments';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){
  return action(request,async(_s,body)=>{
    const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');
    if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(k=>!['action','data'].includes(k)))throw new AppError(400,'Invalid payment request.');
    const p=payments(getRawDb(),user,paymentDataKey());
    switch(body.action){
      case 'saveBank':return p.saveBank(body.data);
      case 'bankDetails':return p.bankDetails();
      case 'approveCommission':return p.approveCommission(body.data);
      case 'request':return p.request(body.data);
      case 'cancel':return p.cancel(body.data);
      case 'review':return p.review(body.data);
      case 'recordPaid':return p.recordPaid(body.data);
      case 'details':return p.details(body.data);
      default:throw new AppError(400,'Unknown payment action.');
    }
  });
}
