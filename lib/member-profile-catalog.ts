import {z} from 'zod';
export const memberDetailsSchema=z.object({firstName:z.string().trim().max(60).default(''),lastName:z.string().trim().max(60).default(''),jobTitle:z.string().trim().max(100).default(''),workPhone:z.string().trim().max(30).regex(/^[+0-9 ()-]*$/,'Use a contact phone number, including its country code.').default(''),mobilePhone:z.string().trim().max(30).regex(/^[+0-9 ()-]*$/,'Use a contact phone number, including its country code.').default('')}).strict();
export type MemberDetails=z.infer<typeof memberDetailsSchema>;
export type MemberProfile={details:MemberDetails;revision:number;hasAvatar:boolean;updatedAt:string|null};
export const emptyMemberProfile=():MemberProfile=>({details:memberDetailsSchema.parse({}),revision:0,hasAvatar:false,updatedAt:null});
