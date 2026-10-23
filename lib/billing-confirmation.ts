export type ConfirmationStatus='active'|'processing'|'open'|'expired'|'attention'|'test_complete';
export type BillingConfirmation={status:ConfirmationStatus;mode:'live'|'test'};
export const confirmationDelays=[0,1500,2500,4000,7000,10000] as const;

// Bounded checks only reconcile the saved payment. They never create a checkout.
export async function confirmSavedPayment(check:()=>Promise<BillingConfirmation>,options:{update:(result:BillingConfirmation)=>void;wait:(milliseconds:number)=>Promise<void>;cancelled:()=>boolean}){
 let last:BillingConfirmation|undefined,error:unknown;
 for(const delay of confirmationDelays){
  if(options.cancelled())return null;
  if(delay)await options.wait(delay);
  if(options.cancelled())return null;
  try{const result=await check();if(options.cancelled())return null;last=result;error=undefined;options.update(result);if(result.status!=='processing')return result;}
  catch(cause){if(options.cancelled())return null;error=cause;}
 }
 if(error)throw error;
 return last||null;
}
