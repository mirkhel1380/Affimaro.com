"use client";
import { useState, type FormEvent } from "react";

export type Field={name:string;label:string;type?:'text'|'url'|'number'|'select'|'textarea'|'checkbox';value?:string|number|boolean;placeholder?:string;hint?:string;required?:boolean;min?:number;max?:number;step?:number;maxLength?:number;options?:string[]};
function apiResult(value:unknown):{ok:boolean;error?:string}{
  if(!value||typeof value!=='object'||!('ok' in value))throw new Error('The server returned an unexpected response. Please try again.');
  return {ok:value.ok===true,error:'error' in value&&typeof value.error==='string'?value.error:undefined};
}
export function ApiForm({endpoint,method='POST',fields,label,redirectTo}:{endpoint:string;method?:string;fields:Field[];label:string;redirectTo?:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[expired,setExpired]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setError('');setExpired(false);setBusy(true);
    const data=new FormData(event.currentTarget),body:Record<string,unknown>={};
    for(const field of fields){const raw=data.get(field.name);body[field.name]=field.type==='checkbox'?raw==='on':field.type==='number'?Number(raw):String(raw??'');}
    try{
      const response=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
      const result=apiResult(await response.json());
      if(!response.ok||!result.ok){setExpired(response.status===401);throw new Error(result.error||'We could not save this change.');}
      if(redirectTo)window.location.assign(redirectTo);else window.location.reload();
    }catch(error){setError(error instanceof Error?error.message:'The connection failed. Please try again.');setBusy(false);}
  }
  return <form className="a-form" onSubmit={submit}>{fields.map(field=>{
    const id=`field-${field.name}`,value=typeof field.value==='boolean'?'':field.value;
    if(field.type==='checkbox')return <label key={field.name} className="a-switch"><span>{field.label}{field.hint&&<small>{field.hint}</small>}</span><input type="checkbox" name={field.name} defaultChecked={!!field.value}/></label>;
    return <div className="a-field" key={field.name}><label htmlFor={id}>{field.label}</label>{field.type==='select'?<select id={id} name={field.name} defaultValue={value} required={field.required}>{field.options?.map(option=><option key={option}>{option}</option>)}</select>:field.type==='textarea'?<textarea id={id} name={field.name} defaultValue={value} maxLength={field.maxLength} placeholder={field.placeholder} rows={3}/>:<input id={id} name={field.name} type={field.type||'text'} defaultValue={value} placeholder={field.placeholder} required={field.required} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength} autoComplete={field.name==='name'?'name':undefined}/>}{field.hint&&<small>{field.hint}</small>}</div>;
  })}{error&&<div className="a-form-error" role="alert">{error}{expired&&<> <a href={redirectTo||'/account'} target="_top">Sign in to continue.</a></>}</div>}<button className="a-btn a-btn-dark" disabled={busy} type="submit">{busy?'Saving…':label}<span aria-hidden="true">→</span></button><span className="a-form-status" role="status">{busy?'Saving your changes…':''}</span></form>;
}
export function ActionButton({endpoint='/api/applications',method='PATCH',body,label,variant='outline',returnTo}:{endpoint?:string;method?:string;body:Record<string,unknown>;label:string;variant?:string;returnTo?:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[expired,setExpired]=useState(false);
  async function act(){if(busy)return;setBusy(true);setError('');setExpired(false);try{const response=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});const result=apiResult(await response.json());if(!response.ok||!result.ok){setExpired(response.status===401);throw new Error(result.error||'Please try again.');}window.location.reload();}catch(e){setError(e instanceof Error?e.message:'The connection failed.');setBusy(false);}}
  return <span className="a-action"><button type="button" onClick={act} className={`a-btn a-btn-${variant} a-btn-small`} disabled={busy}>{busy?'Saving…':label}</button>{error&&<span className="a-action-error" role="alert">{error}{expired&&<> <a href={returnTo||'/account'} target="_top">Sign in to continue.</a></>}</span>}</span>;
}
export function CopyButton({path}:{path:string}){
  const [message,setMessage]=useState('');
  async function copy(){try{await navigator.clipboard.writeText(new URL(path,location.origin).href);setMessage('Copied');}catch{setMessage('Select the displayed link to copy it.');}}
  return <div className="a-copy"><code>{path}</code><button className="a-btn a-btn-lime a-btn-small" type="button" onClick={copy}>Copy link</button><span role="status">{message}</span></div>;
}
