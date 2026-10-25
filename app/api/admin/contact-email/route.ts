import {admissionAction} from '../../../../lib/admission-http';
import {saveContactEmailSetup,retryContactReceipt} from '../../../../lib/contact-email';
import {paymentDataKey} from '../../../../lib/payment-runtime';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>body&&typeof body==='object'&&'action' in body&&body.action==='retry'?retryContactReceipt(db,user,paymentDataKey(),body):saveContactEmailSetup(db,user,paymentDataKey(),body));}
