'use client';
import {useState} from 'react';
export function PaymentHistoryExportButton({query,disabled=false}:{query:string;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span className="a-action"><button type="button" className="a-btn a-btn-outline a-btn-small" disabled={disabled||busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{
  const response=await fetch('/api/payments/export?'+query,{credentials:'same-origin'});if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(body?.error||'The payment history export could not be prepared.');}if(!response.headers.get('Content-Type')?.includes('text/csv'))throw new Error('Sign in again before downloading payment records.');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='affimaro-payment-records.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}}>{busy?'Preparing CSV…':'Download payment CSV'}</button>{error&&<small role="alert" className="a-action-error">{error}</small>}</span>;
}
