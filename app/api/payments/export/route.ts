import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {payments,payoutCsv} from '../../../../lib/payments';
import {AppError} from '../../../../lib/service';
import {requireAccountPortal} from '../../../../lib/portal-access';
import {requireApprovedAccount} from '../../../../lib/admissions';
export async function GET(request:Request){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  const user=await getChatGPTUser();if(!user)return Response.json({ok:false,error:'Sign in to export payment records.'},{status:401,headers});
  try{
    const db=getRawDb(),view=new URL(request.url).searchParams.get('view');
    await requireApprovedAccount(db,user);
    if(!['merchant','partner'].includes(view||''))throw new AppError(404,'Payment export not found.');
    await requireAccountPortal(db,user,view==='merchant'?'brand':'affiliate');
    const p=payments(db,user),data=view==='merchant'?await p.merchantDashboard():await p.partnerDashboard();
    if(!data)throw new AppError(404,'Payment export not found.');
    return new Response(payoutCsv(data.requests),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="affimaro-payment-records.csv"'}});
  }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'The export could not be generated.'},{status:error instanceof AppError?error.status:500,headers});}
}
