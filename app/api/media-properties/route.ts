import {z} from 'zod';
import {admissionAction} from '../../../lib/admission-http';
import {mediaProperties} from '../../../lib/media-properties';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return admissionAction(request,async(db,user,body)=>{const v=z.object({action:z.enum(['add','verifyDns','requestReview','renew','archive']),data:z.unknown()}).strict().safeParse(body);if(!v.success)throw new AppError(400,'Choose a valid property action.');return mediaProperties(db,user)[v.data.action](v.data.data);});}
