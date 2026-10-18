import {publicMarketingResponse} from '../../lib/marketing';
import {getChatGPTUser} from '../chatgpt-auth';
import {getRawDb} from '../../db';
import {emailSignIn} from '../../lib/auth-mode';
import {checkoutDestination} from '../../lib/checkout-entry';
export async function GET(request:Request){
 const plan=new URL(request.url).searchParams.get('plan')||undefined,user=emailSignIn?await getChatGPTUser():null;
 if(user)return new Response(null,{status:307,headers:{Location:await checkoutDestination(getRawDb(),user,plan),'Cache-Control':'private, no-store',Vary:'Cookie'}});
 return publicMarketingResponse('/get-started',{plan});
}
