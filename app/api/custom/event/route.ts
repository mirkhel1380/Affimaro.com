import {getRawDb} from '../../../../db';
import {AppError} from '../../../../lib/service';
import {receiveStoreEvent} from '../../../../lib/woocommerce';
export async function POST(request:Request){
  try{return Response.json({ok:true,data:await receiveStoreEvent(getRawDb(),request,new Date(),'custom')},{headers:{'Cache-Control':'no-store'}});}
  catch(error){const known=error instanceof AppError;if(!known)console.error('Affimaro custom site event failed.',error instanceof Error?error.name:'UnknownError');return Response.json({ok:false,error:known?error.message:'The website event could not be processed.'},{status:known?error.status:500,headers:{'Cache-Control':'no-store'}});}
}
