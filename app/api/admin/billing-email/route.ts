import {action} from '../../../../lib/http';
import {getRawDb} from '../../../../db';
import {paymentDataKey} from '../../../../lib/payment-runtime';
import {saveBillingEmailSetup} from '../../../../lib/billing-email';
export const dynamic='force-dynamic';
export async function POST(request:Request){return action(request,async(_s,body,user)=>saveBillingEmailSetup(getRawDb(),user,paymentDataKey(),body));}
