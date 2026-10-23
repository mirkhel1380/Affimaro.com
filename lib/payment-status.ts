import type {ApprovalOrder,Payout} from './payments.ts';

export function commissionReviewStatus(order:Pick<ApprovalOrder,'commission_state'|'commission'|'approved_amount'|'sync_ready'>){
 if(order.commission_state!=='accrued')return {label:order.commission_state==='review'?'Needs source review':order.commission_state,canApprove:false};
 if(order.commission<=0)return {label:'No payable commission',canApprove:false};
 if(order.commission>order.approved_amount)return {label:order.sync_ready===0?'Store sync needed':'Awaiting approval',canApprove:order.sync_ready!==0};
 return {label:'Approved',canApprove:false};
}

export function payoutStatus(request:Pick<Payout,'status'|'method'|'amount'|'reversed_amount'>){
 switch(request.status){
  case 'requested':return {label:'Awaiting business review',description:'The request is waiting for the business. Its amount remains reserved while the request is open.'};
  case 'approved':return {label:'Approved · awaiting payment',description:'The business approved this request. A completed payment has not been recorded yet.'};
  case 'processing':return {label:'Transfer pending',description:'The transfer result is not confirmed. This amount stays reserved; check the existing request before trying another payment.'};
  case 'paid':return {label:'Recorded paid',description:'The business recorded a completed bank or Wise transfer. Affimaro has not independently verified receipt at the bank.'};
  case 'transferred':
   if(request.reversed_amount>=request.amount)return {label:'Stripe reversed',description:'The recorded Stripe transfer was fully reversed. Check the current commission balance for any amount available to request.'};
   if(request.reversed_amount>0)return {label:'Partly reversed',description:'Part of the recorded Stripe transfer was reversed. The remaining amount is credit to the Stripe receiving account; bank payout is separate.'};
   return {label:'Sent to Stripe',description:'The transfer to the Stripe receiving account was verified. This does not confirm a later payout to a bank.'};
  case 'rejected':return {label:'Declined',description:'This request no longer reserves commission. Review the business’s reason and current available balance before creating a replacement.'};
  case 'cancelled':return {label:'Cancelled',description:'This request no longer reserves commission. Check the current available balance before requesting again.'};
  default:return {label:'Needs review',description:'This payment status needs review. Do not treat it as a completed payment.'};
 }
}
