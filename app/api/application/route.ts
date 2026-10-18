import {z} from 'zod';
import {admissionAction} from '../../../lib/admission-http';
import {admissions} from '../../../lib/admissions';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return admissionAction(request,async(db,user,body)=>{
  const result=z.object({action:z.enum(['start','submit','edit']),data:z.unknown()}).strict().safeParse(body);if(!result.success)throw new AppError(400,'Check your application request.');
  const api=admissions(db,user),value=result.data;
  if(value.action==='start'){
    const data=z.object({portal:z.enum(['brand','affiliate','creator','agency'])}).strict().safeParse(value.data);if(!data.success)throw new AppError(400,'Choose your account type.');return api.start(data.data.portal);
  }
  return value.action==='submit'?api.submit(value.data):api.edit(value.data);
});}
