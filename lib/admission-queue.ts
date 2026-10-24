import {z} from 'zod';
import {AppError} from './service.ts';
import {portals} from './portal-policy.ts';

export const admissionStatuses=['pending','changes_requested','approved','rejected','draft'] as const;
export const admissionQueuePageSize=50;
const page=z.union([z.number().int(),z.string().regex(/^[1-9][0-9]{0,6}$/).transform(Number)]).pipe(z.number().int().min(1).max(1_000_000));
const optionalString=z.preprocess(value=>value===''?undefined:value,z.string().trim().min(1).max(200).optional());
export const admissionQueueOptions=z.object({q:z.string().trim().max(120).default(''),page:page.default(1)}).strict();
const schema=admissionQueueOptions.extend({status:z.enum(admissionStatuses).default('pending'),portal:z.preprocess(value=>value===''?undefined:value,z.enum(portals).optional()),applicant:optionalString}).strict();
export type AdmissionQueueFilters=z.infer<typeof schema>;
export function parseAdmissionQueueFilters(input:unknown):AdmissionQueueFilters{
 const result=schema.safeParse(input);if(!result.success)throw new AppError(400,'Choose a valid application status, account type, search and page. Use each filter once.');return result.data;
}
export function admissionQueuePath(filters:AdmissionQueueFilters,changes:Partial<AdmissionQueueFilters>={}){
 const value={...filters,...changes},query=new URLSearchParams({status:value.status});if(value.portal)query.set('portal',value.portal);if(value.q)query.set('q',value.q);if(value.page>1)query.set('page',String(value.page));if(value.applicant)query.set('applicant',value.applicant);return '/owner/applications?'+query;
}
