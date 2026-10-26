import {applicationRequestContext} from '../../../lib/application-context';
import {deviceReportSchema} from '../../../lib/application-context-catalog';
import {emailSignIn} from '../../../lib/auth-mode';
import {z} from 'zod';
import {admissionAction} from '../../../lib/admission-http';
import {admissions} from '../../../lib/admissions';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return admissionAction(request,async(db,user,body)=>{
  const result=z.object({action:z.enum(['start','submit','edit','save']),data:z.unknown(),device:deviceReportSchema.optional()}).strict().safeParse(body);if(!result.success)throw new AppError(400,'Check your application request.');
  const api=admissions(db,user),value=result.data;if(value.action!=='submit'&&value.device!==undefined)throw new AppError(400,'Device details are only accepted with a final submission.');
  if(value.action==='start'){
    const data=z.object({portal:z.enum(['brand','affiliate','creator','agency'])}).strict().safeParse(value.data);if(!data.success)throw new AppError(400,'Choose your account type.');return api.start(data.data.portal);
  }
  return value.action==='submit'?api.submit(value.data,applicationRequestContext(request,value.device,emailSignIn)):value.action==='save'?api.save(value.data):api.edit(value.data);
});}
