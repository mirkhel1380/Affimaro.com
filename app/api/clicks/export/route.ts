import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {clickExport,clickSearchParams} from '../../../../lib/link-clicks';
import {AppError} from '../../../../lib/service';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
 const user=await getChatGPTUser();if(!user)return Response.json({ok:false,error:'Sign in to export your clicks.'},{status:401,headers});
 try{const result=await clickExport(getRawDb(),user,clickSearchParams(new URL(request.url).searchParams));return new Response(result.csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="affimaro-clicks-${result.filters.days}d.csv"`}});}
 catch(error){const known=error instanceof AppError;if(!known)console.error('Affimaro click export failed.',error instanceof Error?error.name:'UnknownError');return Response.json({ok:false,error:known?error.message:'The click export could not be prepared. Please try again.'},{status:known?error.status:500,headers});}
}
