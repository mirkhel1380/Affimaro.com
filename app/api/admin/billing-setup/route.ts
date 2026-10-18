import {admissionAction} from '../../../../lib/admission-http';
import {connectPlatformBilling} from '../../../../lib/platform-billing';
import {paymentDataKey} from '../../../../lib/payment-runtime';
import {publicOrigin} from '../../../../lib/public-origin-runtime';
export const dynamic='force-dynamic';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>connectPlatformBilling(db,user,paymentDataKey(),publicOrigin(),body));}
