import {admissionAction} from '../../../../lib/admission-http';
import {reviewMediaProperty} from '../../../../lib/media-properties';
export async function POST(request:Request){return admissionAction(request,(db,user,body)=>reviewMediaProperty(db,user,body));}
