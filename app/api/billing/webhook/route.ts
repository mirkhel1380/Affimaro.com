import {getRawDb} from '../../../../db';
import {billingWebhook} from '../../../../lib/billing-webhook';
import {billingConfig} from '../../../../lib/billing-runtime';
import {paymentDataKey} from '../../../../lib/payment-runtime';
import {publicOrigin} from '../../../../lib/public-origin-runtime';
export const dynamic='force-dynamic';
export async function POST(request:Request){return billingWebhook(request,{db:getRawDb(),key:paymentDataKey(),origin:publicOrigin(),config:billingConfig});}
