import {getRawDb} from '../../../../db';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {emailSignIn} from '../../../../lib/auth-mode';
import {nativeEmailConfirmation} from '../../../../self-hosted/native-email-confirmation';
import {supabaseSettings} from '../../../../self-hosted/provider-settings.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(emailSignIn)return Response.json({ok:false,error:'This page could not be found.'},{status:404,headers:{'Cache-Control':'private, no-store'}});
  return nativeEmailConfirmation(request,{native:true,db:getRawDb(),user:await getChatGPTUser(),provider:supabaseSettings()});
}
