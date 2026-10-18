import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {reports,reportCsv,reportSearchParams} from '../../../../lib/reports';
import {AppError} from '../../../../lib/service';
import {accountPortal,portalForView,businessPortal} from '../../../../lib/portal-policy';
import {requireAccountPortal} from '../../../../lib/portal-access';
import {requireApprovedAccount} from '../../../../lib/admissions';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  const user=await getChatGPTUser();
  if(!user)return Response.json({ok:false,error:'Sign in to export your report.'},{status:401,headers});
  try{
    const db=getRawDb(),filters=reportSearchParams(new URL(request.url).searchParams),actual=await accountPortal(db,user.userId);
    await requireApprovedAccount(db,user);
    if(!actual)throw new AppError(403,'Complete your account setup first.');
    const expected=portalForView(filters.view)||actual;await requireAccountPortal(db,user,expected);
    const report=await reports(db,user).get({...filters,view:filters.view||(businessPortal(actual)?'business':'affiliate')});
    return new Response(reportCsv(report),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="affimaro-${report.filters.view}-report-${report.filters.from}-${report.filters.to}.csv"`}});
  }catch(error){
    const known=error instanceof AppError;
    if(!known)console.error('Affimaro report failed.',error instanceof Error?error.name:'UnknownError');
    return Response.json({ok:false,error:known?error.message:'The report could not be generated. Please try again.'},{status:known?error.status:500,headers});
  }
}
