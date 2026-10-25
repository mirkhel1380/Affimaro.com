import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {paymentDataKey} from '../../../../lib/payment-runtime';
import {emailSignIn} from '../../../../lib/auth-mode';
import {identityEndpoint} from '../../../../lib/identity-http';
export async function GET(request:Request){return identityEndpoint(request,{db:getRawDb(),user:await getChatGPTUser(),key:paymentDataKey(),independent:emailSignIn,owner:true});}
export const POST=GET;
