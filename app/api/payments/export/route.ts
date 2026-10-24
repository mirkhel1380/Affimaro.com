import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {paymentHistoryExport,paymentHistorySearchParams} from '../../../../lib/payment-history';
import {AppError} from '../../../../lib/service';
import {requireAccountPortal} from '../../../../lib/portal-access';
import {requireApprovedAccount} from '../../../../lib/admissions';
export async function GET(request:Request){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  const user=await getChatGPTUser();if(!user)return Response.json({ok:false,error:'Sign in to export payment records.'},{status:401,headers});
  try{
    const db=getRawDb(),query=new URL(request.url).searchParams,view=query.get('view');
    await requireApprovedAccount(db,user);
    if(!['merchant','partner'].includes(view||''))throw new AppError(404,'Payment export not found.');
    if(query.getAll('view').length!==1)throw new AppError(400,'Choose one payment export view.');
    await requireAccountPortal(db,user,view==='merchant'?'brand':'affiliate');
    query.delete('view');const filters=paymentHistorySearchParams(query,false),data=await paymentHistoryExport(db,user,filters);
    return new Response(data.csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="affimaro-payment-records.csv"'}});
  }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'The export could not be generated.'},{status:error instanceof AppError?error.status:500,headers});}
}
