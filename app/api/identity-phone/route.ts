import {getChatGPTUser} from '../../chatgpt-auth';
import {getRawDb} from '../../../db';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {emailSignIn} from '../../../lib/auth-mode';
import {identityPhoneEndpoint} from '../../../lib/identity-phone';
export const dynamic='force-dynamic';
export async function POST(request:Request){return identityPhoneEndpoint(request,{db:getRawDb(),user:await getChatGPTUser(),key:paymentDataKey(),independent:emailSignIn});}
