import {z} from 'zod';
export const phonePacketSchema=z.object({portal:z.enum(['affiliate','creator']),ticket:z.string().min(20).max(2048).regex(/^[A-Za-z0-9_.-]+$/),documentType:z.enum(['passport','national_id','driving_licence']),revision:z.string().regex(/^(0|[1-9][0-9]{0,9})$/)}).strict();
export type PhonePacket=z.infer<typeof phonePacketSchema>;
export const phoneStorageKey='affimaro.identity.phone.v1';
export function parsePhoneFragment(fragment:string){if(fragment.length>2800)return null;try{const q=new URLSearchParams(fragment.replace(/^#/,''));if([...q.keys()].some(key=>q.getAll(key).length!==1))return null;const parsed=phonePacketSchema.safeParse(Object.fromEntries(q));return parsed.success?parsed.data:null;}catch{return null;}}
