'use client';
import {useState} from 'react';
export async function downloadReportCsv(query:string,filename:string){
 const response=await fetch('/api/reports/export?'+query,{credentials:'same-origin'});
 if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string}|null;throw new Error(body?.error||'The report export could not be prepared. Please try again.');}
 if(response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='text/csv')throw new Error('Sign in again before downloading your performance report.');
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
 try{link.href=url;link.download=filename;document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function ReportExportButton({query,filename}:{query:string;filename:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <span className="a-action"><button type="button" className="a-btn a-btn-outline a-btn-small" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await downloadReportCsv(query,filename);}catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}}>{busy?'Preparing CSV…':'Export report CSV'}</button>{error&&<small className="a-action-error" role="alert">{error}</small>}</span>;
}
