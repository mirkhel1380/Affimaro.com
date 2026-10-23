import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {payments} from '../../../lib/payments';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {getChatGPTUser} from '../../chatgpt-auth';
import {AppError} from '../../../lib/service';
import {accountPortal,businessPortal} from '../../../lib/portal-policy';
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
      case 'details':{
        const portal=await accountPortal(getRawDb(),user.userId);
        if(!portal)throw new AppError(403,'Complete your account setup first.');
        const input=body.data;if(!input||typeof input!=='object'||!('requestId' in input)||typeof input.requestId!=='string')throw new AppError(400,'Invalid payment request.');
        const own=await getRawDb().prepare(`SELECT r.id FROM payout_requests r JOIN applications a ON a.id=r.application_id JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id WHERE r.id=? AND ${businessPortal(portal)?'w.owner_id':'a.affiliate_user_id'}=?`).bind(input.requestId,user.userId).first();
        if(!own)throw new AppError(404,'Payment request not found in your portal.');
        return p.details(input);
      }
      default:throw new AppError(400,'Unknown payment action.');
    }
  });
}
