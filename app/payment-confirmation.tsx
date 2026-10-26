'use client';
import {useEffect,useState} from 'react';
import {confirmSavedPayment,type BillingConfirmation} from '../lib/billing-confirmation';
export type BillingReturnPath='/billing'|'/agency/billing';
async function checkSavedPayment():Promise<BillingConfirmation>{
 const response=await fetch('/api/billing',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',data:{}})}),body=await response.json().catch(()=>null) as {ok?:boolean;error?:string;data?:BillingConfirmation}|null;
 if(!response.ok||!body?.ok||!body.data)throw new Error(body?.error||'Payment status could not be checked. Please try again.');
 return body.data;
}
export function PaymentConfirmation({returnPath,initialActive=false,verify=checkSavedPayment,onVerified}:{returnPath:BillingReturnPath;initialActive?:boolean;verify?:()=>Promise<BillingConfirmation>;onVerified?:()=>void}){
 const [result,setResult]=useState<BillingConfirmation|null>(initialActive?{status:'active',mode:'live'}:null),[busy,setBusy]=useState(!initialActive),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(initialActive)return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined,finishWait:(()=>void)|undefined;
  setBusy(true);setError('');
  const wait=(milliseconds:number)=>new Promise<void>(resolve=>{finishWait=resolve;timer=setTimeout(resolve,milliseconds);});
  void confirmSavedPayment(verify,{update:value=>setResult(value),wait,cancelled:()=>cancelled}).then(value=>{if(!cancelled&&value?.status==='active'){if(onVerified)onVerified();else window.location.replace(returnPath+'?checkout_return=1');}}).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'Payment status could not be checked. Please try again.');}).finally(()=>{if(!cancelled)setBusy(false);});
  return()=>{cancelled=true;if(timer)clearTimeout(timer);finishWait?.();};
 },[attempt,initialActive,returnPath,verify,onVerified]);
 const status=result?.status,heading=error?'Payment status needs a check':status==='active'?'Your subscription is active.':status==='open'?'Your payment is not complete.':status==='expired'?'This checkout has expired.':status==='attention'?'Your subscription needs attention.':status==='test_complete'?'Test payment confirmed.':busy?'Confirming your payment…':'Your payment is still processing.';
 const description=status==='active'?'Your paid access is verified. You can continue to your portal.':status==='open'?'Return to the saved payment form to finish. No new purchase is needed.':status==='expired'?'No paid subscription was activated by this checkout. Review your package before opening another payment.':status==='attention'?'Paid access is not active. Check your subscription and payment method in billing.':status==='test_complete'?'This was a test payment. It does not activate live paid access.':'Your package activates only after payment is verified. If confirmation takes longer, you can check again here. Checking never starts another payment.';
 return <section className="a-payment-confirmation" aria-label="Payment confirmation"><span className="a-eyebrow">AFFIMARO · PAYMENT STATUS</span><h3 role="status" aria-live="polite">{heading}</h3><p>{description}</p>{error&&<p className="a-form-error" role="alert">{error}</p>}<div className="a-inline-actions">{!initialActive&&status!=='active'&&<button type="button" className="a-btn a-btn-outline" disabled={busy} onClick={()=>setAttempt(n=>n+1)}>{busy?'Checking saved payment…':'Check payment again'}</button>}{status==='active'?<><a className="a-btn a-btn-dark" href={returnPath==='/agency/billing'?'/agency':'/workspace'}>Continue to your portal</a><a className="a-btn a-btn-outline" href={returnPath+'#invoices'}>View your invoice</a></>:(error||status&&['open','expired','attention','test_complete'].includes(status))?<a className="a-btn a-btn-dark" href={returnPath}>{status==='open'?'Return to saved payment':'Return to billing'}</a>:null}</div></section>;
}
