import {getChatGPTUser} from '../app/chatgpt-auth';
import {getRawDb} from '../db';
import {AppError,type Identity} from './service';
import {assertSameOrigin,readJson} from './request';

export async function admissionAction(request:Request,operation:(db:D1Database,identity:Identity,body:unknown)=>Promise<unknown>){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  try{
    const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');
    assertSameOrigin(request);const body=await readJson(request);
    return Response.json({ok:true,data:await operation(getRawDb(),user,body)},{headers});
  }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'We could not save the application. Please try again.'},{status:error instanceof AppError?error.status:500,headers});}
}
