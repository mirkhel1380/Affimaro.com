import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {payments,payoutCsv} from '../../../../lib/payments';
export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({ok:false,error:'Sign in to export payment records.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const p=payments(getRawDb(),user),view=new URL(request.url).searchParams.get('view');
  const data=view==='merchant'?await p.merchantDashboard():view==='partner'?await p.partnerDashboard():null;
  if(!data)return Response.json({ok:false,error:'Payment export not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
  return new Response(payoutCsv(data.requests),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="affimaro-payment-records.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
}
