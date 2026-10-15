import {getRawDb} from '../../../../db';
import {AppError} from '../../../../lib/service';
import {receiveStoreEvent} from '../../../../lib/woocommerce';
export async function POST(request:Request){
  try{return Response.json({ok:true,data:await receiveStoreEvent(getRawDb(),request)},{headers:{'Cache-Control':'no-store'}});}
  catch(error){const known=error instanceof AppError;if(!known)console.error('Affimaro store event failed.',error instanceof Error?error.name:'UnknownError');return Response.json({ok:false,error:known?error.message:'The store event could not be processed.'},{status:known?error.status:500,headers:{'Cache-Control':'no-store'}});}
}
