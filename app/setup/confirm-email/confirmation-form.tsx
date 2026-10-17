'use client';
import {useState,type FormEvent} from 'react';
export function ConfirmationForm(){
  const [code,setCode]=useState(''),[busy,setBusy]=useState<'send'|'verify'|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  async function act(action:'send'|'verify'){
    if(busy)return;
    const entered=code;setBusy(action);setError('');setMessage('');if(action==='verify')setCode('');
    try{
      const response=await fetch('/api/setup/confirm-email',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(action==='verify'?{code:entered}:{})})});
      const result:unknown=await response.json();
      if(!result||typeof result!=='object'||!('ok' in result)||result.ok!==true||!response.ok){const detail=result&&typeof result==='object'&&'error' in result&&typeof result.error==='string'?result.error:'Verification could not be completed. Please try again.';throw new Error(detail);}
      if(action==='verify'){
        if(!('confirmed' in result)||result.confirmed!==true)throw new Error('Verification could not be completed. Please try again.');
        setConfirmed(true);setMessage('Email verified. You can return to the chat to continue setup.');
      }else{setCode('');setMessage('A new code was sent. Open your latest email and enter the code here.');}
    }catch(e){setError(e instanceof Error?e.message:'Could not connect. Please try again.');}
    finally{setBusy(null);}
  }
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void act('verify');}
  return <div>{!confirmed&&<form className="a-form" onSubmit={submit}><div className="a-field"><label htmlFor="setup-email-code">Verification code</label><input id="setup-email-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={event=>setCode(event.target.value)} required pattern="[0-9]{6,10}" minLength={6} maxLength={10} disabled={busy!==null} style={{fontSize:24,textAlign:'center',letterSpacing:5}}/><small>Enter the 6–10 digit code from your latest email.</small></div><button className="a-btn a-btn-dark" type="submit" disabled={busy!==null}>{busy==='verify'?'Verifying…':'Verify email'}</button><button className="a-btn a-btn-outline" type="button" disabled={busy!==null} onClick={()=>void act('send')}>{busy==='send'?'Sending…':'Send a new code'}</button></form>}{message&&<p role="status" style={{marginTop:20,lineHeight:1.9}}>{message}</p>}{error&&<p className="a-form-error" role="alert" style={{marginTop:20,lineHeight:1.9}}>{error}</p>}</div>;
}
