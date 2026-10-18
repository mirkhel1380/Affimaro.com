import { getChatGPTUser } from "../app/chatgpt-auth";
import { getRawDb } from "../db";
import { AppError,service,type Identity } from "./service";

import { assertSameOrigin,readJson } from "./request";
import {writePortal} from './portal-policy';
import {requireAccountPortal} from './portal-access';

type Service=ReturnType<typeof service>;
export async function action(request:Request,operation:(s:Service,body:unknown,identity:Identity)=>Promise<unknown>) {
  try {
    const user=await getChatGPTUser();
    if(!user)throw new AppError(401,'Sign in to continue.');
    assertSameOrigin(request);
    const body=await readJson(request);
    const scope=writePortal(new URL(request.url).pathname,request.method,body);
    if(scope)await requireAccountPortal(getRawDb(),user,scope.portal,scope.allowUnset);
    const data=await operation(service(getRawDb(),user),body,user);
    return Response.json({ok:true,data},{headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
  }catch(error){
    const known=error instanceof AppError;
    if(!known)console.error('Affimaro request failed.',error instanceof Error?error.name:'UnknownError');
    return Response.json({ok:false,error:known?error.message:'We could not save this change. Please try again.'},{status:known?error.status:500,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
  }
}
