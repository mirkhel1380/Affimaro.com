import {admissionAction} from '../../../../lib/admission-http';
import {contactInbox} from '../../../../lib/contact-inbox';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>contactInbox(db,user).update(body));}
