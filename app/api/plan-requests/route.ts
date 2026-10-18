import {admissionAction} from '../../../lib/admission-http';
import {planRequests} from '../../../lib/plan-requests';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>planRequests(db,user).choose(body));}
