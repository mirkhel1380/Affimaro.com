import {requireBusinessSubscription} from '../../../lib/billing-runtime';
import {z} from 'zod';
import {admissionAction} from '../../../lib/admission-http';
import {audienceTools} from '../../../lib/audience-tools';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return admissionAction(request,async(db,user,body)=>{const v=z.object({action:z.enum(['saveClient','saveContent']),data:z.unknown()}).strict().safeParse(body);if(!v.success)throw new AppError(400,'Check your portal request.');if(v.data.action==='saveClient')await requireBusinessSubscription(user);return audienceTools(db,user)[v.data.action](v.data.data);});}
