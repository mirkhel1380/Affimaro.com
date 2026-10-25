import {businessPortal,type Portal} from './portal-policy.ts';
import {payoutStatus} from './payment-status.ts';

export const updateCategories={all:'All updates',applications:'Partnership applications',invitations:'Invitations',payments:'Payment requests'} as const;
export type UpdateCategory=Exclude<keyof typeof updateCategories,'all'>;
export type PortalUpdate={id:string;category:UpdateCategory;name:string;program:string;program_id:string;status:string;created_at:string;updated_at:string;application_status:string|null;superseded:number;program_active:number;counterparty_closed:number;amount:number|null;currency:string|null;decimals:number|null;method:string|null;reversed_amount:number|null};
export const updatesPath=(p:Portal)=>({brand:'/workspace/updates',agency:'/agency/updates',affiliate:'/partner/updates',creator:'/creator/updates'})[p];
export function updatePresentation(row:PortalUpdate,portal:Portal){
 const business=businessPortal(portal),relationships=({brand:'/workspace/partners',agency:'/agency/partners',affiliate:'/partner/brands',creator:'/creator/brands'})[portal],prefix=updatesPath(portal).replace(/\/updates$/,'');
 if(row.category==='payments'){
  const state=payoutStatus({status:row.status,method:row.method as 'bank'|'stripe',amount:row.amount||0,reversed_amount:row.reversed_amount||0});
  return {title:state.label,description:state.description,href:prefix+'/payment-history?'+new URLSearchParams({request:row.id}),link:'Open payment request',icon:'shield'};
 }
 if(row.category==='invitations'){
  const title=row.counterparty_closed?'Invitation · account closed':row.superseded?'Invitation · application decision changed':({pending:business?'Invitation awaiting reply':'Invitation received',accepted:'Invitation accepted',declined:'Invitation declined',withdrawn:'Invitation withdrawn'}[row.status]||'Invitation updated');
  const description=row.counterparty_closed?'The other account has closed. The invitation is kept in your records.':row.superseded?'A later application decision replaced this invitation. Open the record for the current partnership status.':row.status==='accepted'?'The invitation was accepted. Partnership approval is a separate decision.':row.status==='pending'?(business?'Your invitation is waiting for the recipient.':'Review the program before deciding whether to apply.'):'Review the invitation in your partnership inbox.';
  return {title,description,href:relationships+'?'+new URLSearchParams({tab:'invitations',invitationStatus:row.status}),link:business?'Open sent invitations':'Open invitations',icon:'link'};
 }
 const title=({pending:business?'Application awaiting your review':'Application under review',approved:'Partnership approved',rejected:'Application declined',suspended:'Partnership suspended'}[row.status]||'Partnership updated'),description=row.counterparty_closed?'The other account has closed. Existing partnership records are retained.':row.status==='approved'?(row.program_active?'Open the partnership to review its current resources and terms.':'The partnership is approved, but its program is currently paused.'):row.status==='pending'?(business?'Open the application to review the partner’s profile.':'The program owner has not decided on this application yet.'):'Open the program record to review its current status.';
 return {title,description,href:row.counterparty_closed?relationships+'?'+new URLSearchParams({tab:row.status}):business||row.status==='approved'?relationships+'/'+encodeURIComponent(row.id):'/join/'+encodeURIComponent(row.program_id),link:row.counterparty_closed?'Open partnership records':business?'Open partner application':row.status==='approved'?'Open partnership':'Open program',icon:'users'};
}
