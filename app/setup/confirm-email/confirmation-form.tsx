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
      if(!result||typeof result!=='object'||!('ok' in result)||result.ok!==true||!response.ok){const detail=result&&typeof result==='object'&&'error' in result&&typeof result.error==='string'?result.error:'تأیید تکمیل نشد. دوباره کوشش کو.';throw new Error(detail);}
      if(action==='verify'){
        if(!('confirmed' in result)||result.confirmed!==true)throw new Error('تأیید تکمیل نشد. دوباره کوشش کو.');
        setConfirmed(true);setMessage('ایمیل تأیید شد. این مرحله تکمیل است؛ می‌توانی به چت برگردی.');
      }else{setCode('');setMessage('کود تازه فرستاده شد. آخرین ایمیل را باز کو و کودش را همین‌جا بنویس.');}
    }catch(e){setError(e instanceof Error?e.message:'ارتباط برقرار نشد. دوباره کوشش کو.');}
    finally{setBusy(null);}
  }
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();void act('verify');}
  return <div>{!confirmed&&<form className="a-form" onSubmit={submit}><div className="a-field"><label htmlFor="setup-email-code">کود تأیید ایمیل</label><input id="setup-email-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={event=>setCode(event.target.value)} required pattern="[0-9]{6,10}" minLength={6} maxLength={10} disabled={busy!==null} style={{fontSize:24,textAlign:'center',letterSpacing:5}}/><small>۶ تا ۱۰ رقمِ کود تازه را وارد کو.</small></div><button className="a-btn a-btn-dark" type="submit" disabled={busy!==null}>{busy==='verify'?'در حال تأیید…':'تأیید ایمیل'}</button><button className="a-btn a-btn-outline" type="button" disabled={busy!==null} onClick={()=>void act('send')}>{busy==='send'?'در حال ارسال…':'ارسال کود تازه'}</button></form>}{message&&<p role="status" style={{marginTop:20,lineHeight:1.9}}>{message}</p>}{error&&<p className="a-form-error" role="alert" style={{marginTop:20,lineHeight:1.9}}>{error}</p>}</div>;
}
