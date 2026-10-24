'use client';
import {useState} from 'react';
export function ClickExportButton({query,filename,disabled=false}:{query:string;filename:string;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span className="a-action"><button type="button" className="a-btn a-btn-outline a-btn-small" disabled={disabled||busy} onClick={async()=>{setBusy(true);setError('');try{
  const response=await fetch('/api/clicks/export?'+query,{credentials:'same-origin'});
  if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(body?.error||'Your click export could not be prepared. Please try again.');}
  if(!response.headers.get('Content-Type')?.includes('text/csv'))throw new Error('Sign in again before downloading your click report.');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}}>{busy?'Preparing CSV…':'Download clicks CSV'}</button>{error&&<small className="a-action-error" role="alert">{error}</small>}</span>;
}
