import {admissionAction} from '../../../../lib/admission-http';
import {admissions} from '../../../../lib/admissions';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>admissions(db,user).review(body));}
