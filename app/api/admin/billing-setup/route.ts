import {admissionAction} from '../../../../lib/admission-http';
import {connectPlatformBilling,saveBillingPublishableKey} from '../../../../lib/platform-billing';
import {paymentDataKey} from '../../../../lib/payment-runtime';
import {billingOrigin} from '../../../../lib/public-origin-runtime';
export const dynamic='force-dynamic';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>body&&typeof body==='object'&&'action' in body&&body.action==='publishable'?saveBillingPublishableKey(db,user,body):connectPlatformBilling(db,user,paymentDataKey(),billingOrigin(),body));}
