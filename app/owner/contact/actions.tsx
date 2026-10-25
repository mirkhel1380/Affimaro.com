'use client';
import {useState,type FormEvent} from 'react';
import type {ContactMessage} from '../../../lib/contact-inbox';
import {contactStatuses} from '../../../lib/contact-catalog.mjs';

export function ContactStatusControl({message,successPath}:{message:Pick<ContactMessage,'id'|'revision'|'status'>;successPath:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/contact',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:message.id,revision:message.revision,status:String(new FormData(event.currentTarget).get('status'))})}),result=await response.json() as {ok?:boolean;error?:string};
   if(!response.ok||!result.ok)throw new Error(result.error||'This message could not be updated.');
   window.location.assign(successPath);
  }catch(cause){setError(cause instanceof Error?cause.message:'The connection failed. Try again.');setBusy(false);}
 }
 return <form className="a-form" method="post" action="/api/admin/contact" onSubmit={save}><label className="a-field"><span>Message status</span><select name="status" defaultValue={message.status} disabled={busy}>{contactStatuses.map(status=><option key={status} value={status}>{status==='new'?'New':status==='in_progress'?'In progress':'Closed'}</option>)}</select></label><button className="a-btn a-btn-dark a-btn-small" disabled={busy}>{busy?'Saving…':'Save message status'}</button>{error&&<p className="a-form-error" role="alert">{error}</p>}<p className="a-fine-print">This updates the private inbox. It does not send a reply or approve an account.</p></form>;
}
