"use client";
import {useState,type FormEvent} from 'react';
import type {PaymentConnection,PaymentProvider} from '../lib/payment-connections';

async function post<T>(action:string,data:unknown):Promise<T>{
  const response=await fetch('/api/payment-connections',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action,data})});
  const result=await response.json() as {ok?:boolean;error?:string;data?:T};
  if(!response.ok||!result.ok||result.data===undefined)throw new Error(result.error||'The account connection could not be updated.');return result.data;
}
export function PaymentConnections({connections}:{connections:PaymentConnection[]}){
  return <div className="a-card-body" id="payment-connections">
    <p className="a-muted">Check access to your business’s Stripe or Wise account. Account access checks do not enable automatic commission payments.</p>
    <div className="a-provider-grid">{(['stripe','wise'] as const).map(provider=><ProviderCard key={provider} provider={provider} initial={connections.find(c=>c.provider===provider)||null}/>)}</div>
    <p className="a-fine-print">Only your business owner can manage these connections. Saved keys are never displayed. <a href="/downloads/payments-setup.md" download>Read the payment setup guide ↗</a></p>
  </div>;
}
function ProviderCard({provider,initial}:{provider:PaymentProvider;initial:PaymentConnection|null}){
  const [connection,setConnection]=useState(initial),[editing,setEditing]=useState(!initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[removing,setRemoving]=useState(false);
  const stripe=provider==='stripe',name=stripe?'Stripe':'Wise';
  async function connect(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');const form=event.currentTarget,data=new FormData(form);
    try{const saved=await post<PaymentConnection>('connect',{provider,mode:String(data.get('mode')||'test'),secret:String(data.get('secret')||''),...(!stripe?{profileId:String(data.get('profileId')||'')}: {})});form.reset();setConnection(saved);setEditing(false);setRemoving(false);setNotice('Account access checked and credential saved securely.');}
    catch(e){setError(e instanceof Error?e.message:'The account could not be connected.');}finally{setBusy(false);}
  }
  async function check(){
    if(busy||!connection)return;setBusy(true);setError('');setNotice('');
    try{const saved=await post<PaymentConnection>('check',{provider,connectionId:connection.id});setConnection(saved);setNotice(saved.status==='verified'?'Account access checked again.':'The saved account needs attention.');}
    catch(e){setError(e instanceof Error?e.message:'The account could not be checked.');}finally{setBusy(false);}
  }
  async function remove(){
    if(busy||!connection)return;setBusy(true);setError('');setNotice('');
    try{await post('remove',{provider,connectionId:connection.id});setConnection(null);setEditing(true);setRemoving(false);setNotice('Saved connection and credential removed. Existing commission and payment records are retained.');}
    catch(e){setError(e instanceof Error?e.message:'The connection could not be removed.');}finally{setBusy(false);}
  }
  const old=connection&&Date.now()-Date.parse(connection.last_checked_at)>86400000;
  return <article className={`a-provider a-provider-${provider}`} aria-labelledby={`provider-${provider}`}>
    <div className="a-provider-heading"><span className="a-provider-symbol" aria-hidden="true">{stripe?'S':'W'}</span><div><h3 id={`provider-${provider}`}>{name}</h3><p>{stripe?'Business account access':'Business profile access'}</p></div><span className={`a-provider-tag ${connection?.status==='attention'?'needs-attention':''}`}>{connection?connection.mode==='test'?'Test / sandbox':'Live account':'Not connected'}</span></div>
    {connection&&<>
      <div className="a-provider-account"><strong>{connection.label}</strong><span className="a-mono">{connection.external_id}</span></div>
      <p className={`a-provider-state ${connection.status==='attention'?'needs-attention':''}`}>{connection.status==='attention'?'Access needs attention':old?'Last check is over 24 hours old':'Account access checked'}</p>
      <dl className="a-detail-list"><div><dt>Last checked</dt><dd>{new Date(connection.last_checked_at).toUTCString()}</dd></div>{connection.country&&<div><dt>Account country</dt><dd>{connection.country}</dd></div>}{connection.currency&&<div><dt>Default currency</dt><dd>{connection.currency}</dd></div>}{stripe&&<div><dt>Stripe account payouts</dt><dd>{connection.payouts_enabled?'Enabled by Stripe':'Not enabled by Stripe'}</dd></div>}</dl>
      {connection.last_error&&<p className="a-form-error" role="status">{connection.last_error}</p>}
      <div className="a-inline-actions"><button className="a-btn a-btn-outline a-btn-small" type="button" disabled={busy} onClick={check}>{busy?'Checking…':'Check access again'}</button><button className="a-text-link" type="button" disabled={busy} onClick={()=>{setEditing(!editing);setRemoving(false);}}>{editing?'Cancel replacement':'Replace connection'}</button><button className="a-text-link" type="button" disabled={busy} onClick={()=>{setRemoving(!removing);setEditing(false);}}>Remove</button></div>
      {removing&&<div className="a-provider-remove"><p>Remove this saved connection and its encrypted credential from Affimaro? Revoke the key in {name} separately if you no longer need it.</p><button className="a-btn a-btn-outline a-btn-small" type="button" disabled={busy} onClick={remove}>Remove saved connection</button><button className="a-text-link" type="button" disabled={busy} onClick={()=>setRemoving(false)}>Keep connection</button></div>}
    </>}
    {editing&&<form className="a-form a-provider-form" onSubmit={connect}>
      <div className="a-field"><label htmlFor={`mode-${provider}`}>Account environment</label><select id={`mode-${provider}`} name="mode" defaultValue={connection?.mode||'test'} disabled={busy}><option value="test">Test / sandbox</option><option value="live">Live</option></select></div>
      {!stripe&&<div className="a-field"><label htmlFor="wise-profile-id">Wise business profile ID</label><input id="wise-profile-id" name="profileId" required inputMode="numeric" pattern="[1-9][0-9]*" maxLength={16} defaultValue={connection?.external_id||''} disabled={busy}/><small>Use your numeric business profile ID from the same Wise environment as the token.</small></div>}
      <div className="a-field"><label htmlFor={`secret-${provider}`}>{stripe?'Stripe restricted or secret API key':'Wise personal API token'}</label><input id={`secret-${provider}`} name="secret" type="password" required minLength={16} maxLength={stripe?256:4096} autoComplete="new-password" spellCheck={false} disabled={busy}/><small>{stripe?'The selected key needs account and balance read access. A restricted key is preferred.':'Use a token for your own Wise business account. Sandbox and live tokens are separate.'}</small></div>
      <button className="a-btn a-btn-dark a-btn-small" disabled={busy}>{busy?`Checking with ${name}…`:`Check and save ${name} account`} <span aria-hidden="true">→</span></button>
    </form>}
    <div className="a-provider-limit"><strong>{stripe?'USD commission transfers':'Commission payments: manual'}</strong><p>{stripe?'Enable affiliate receiving-account setup below. A live account with transfer read/write permissions can then send approved USD requests after a separate review and confirmation.':'The business can complete a Wise bank transfer outside Affimaro, then record its receipt. This connection does not create, fund or verify a transfer.'}</p></div>
    <a className="a-text-link" href={stripe?'https://dashboard.stripe.com/apikeys':'https://wise.com/'} target="_blank" rel="noopener noreferrer">Open {name} ↗</a>
    {error&&<p className="a-form-error" role="alert">{error}</p>}{notice&&<p className="a-form-status" role="status">{notice}</p>}
  </article>;
}
