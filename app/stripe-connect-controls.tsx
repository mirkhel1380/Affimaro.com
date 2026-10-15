"use client";
import {useState,type FormEvent} from 'react';
import type {RecipientCard,StripeMerchant} from '../lib/stripe-connect';

async function post<T>(action:string,data:unknown):Promise<T>{const response=await fetch('/api/stripe-connect',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action,data})});const result=await response.json() as {ok?:boolean;error?:string;data?:T};if(!response.ok||!result.ok||result.data===undefined)throw new Error(result.error||'Stripe setup could not be completed.');return result.data;}
const labels:Record<string,string>={creating:'Setup started',needs_information:'More information needed',pending:'Under Stripe review',ready:'Receiving account ready',attention:'Needs attention'};
export function StripeMerchantSetup({setup}:{setup:StripeMerchant}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function change(event?:FormEvent<HTMLFormElement>){event?.preventDefault();if(busy)return;setBusy(true);setError('');try{await post('configure',{enabled:!setup.enabled,confirmed:!!event,connectionId:setup.connection?.id||null});window.location.reload();}catch(e){setError(e instanceof Error?e.message:'Settings could not be saved.');setBusy(false);}}
  return <div className="a-card-body" id="stripe-recipient-setup">
    <p className="a-muted">Approved affiliates can set up a Stripe Express receiving account under your business’s Stripe platform. They enter verification and bank details on Stripe’s own page.</p>
    {!setup.connection?<p className="a-fine-print">Connect your Stripe business account above before enabling recipient setup.</p>:<>
      <div className="a-stripe-source"><strong>{setup.connection.mode==='test'?'Test / sandbox':'Live'} · {setup.connection.external_id}</strong><span>Recipient country for this pilot: {setup.connection.country}</span></div>
      {setup.enabled?<div className="a-inline-actions"><span className="a-provider-state">Affiliate setup enabled</span><button type="button" className="a-btn a-btn-outline a-btn-small" disabled={busy} onClick={()=>change()}>{busy?'Saving…':'Pause new setup links'}</button></div>:<form className="a-form a-stripe-enable" onSubmit={change}>
        <p className="a-fine-print">Configure Stripe Connect and your onboarding branding in your own Stripe Dashboard first. Your key needs connected-account and account-link permissions as well as account/balance read access.</p>
        <label className="a-confirm-transfer"><input type="checkbox" required disabled={busy}/><span>Stripe Connect is configured for my business. I authorize affiliate receiving-account setup under the displayed Stripe account. My business accepts the Connect fees and account-loss responsibilities assigned to its platform.</span></label>
        <button className="a-btn a-btn-dark a-btn-small" disabled={busy||setup.connection.status!=='verified'}>{busy?'Checking Stripe…':'Enable affiliate Stripe setup'}</button>
      </form>}
    </>}
    {error&&<p className="a-form-error" role="alert">{error}</p>}
    {setup.recipients.length>0&&<div className="a-recipient-grid">{setup.recipients.map(row=><Recipient key={row.application_id} row={row} merchant/>)}</div>}
    <p className="a-fine-print">Pausing setup or replacing your Stripe connection does not delete existing Stripe accounts. Account readiness is separate from a completed commission payment. <a href="/downloads/stripe-connect-setup.md" download>Stripe recipient setup guide ↗</a></p>
  </div>;
}
export function StripeAffiliateSetup({recipients,returned}:{recipients:RecipientCard[];returned?:string}){
  return <div className="a-card-body" id="stripe-receiving-accounts">
    {returned==='return'&&<p className="a-form-status" role="status">You returned from Stripe. Use “Check Stripe status” below to verify what was completed.</p>}
    {returned==='refresh'&&<p className="a-form-status" role="status">The Stripe link expired or was already used. Open “Continue setup on Stripe” for a fresh link.</p>}
    <p className="a-muted">Set up a receiving account for each participating business. Verification and bank details are entered on Stripe. This pilot supports recipients legally based in the same country as that business’s Stripe account.</p>
    {recipients.length?<div className="a-recipient-grid">{recipients.map(row=><Recipient key={row.application_id} row={row} merchant={false}/>)}</div>:<p className="a-fine-print">Stripe setup will appear when a business you are approved to promote connects its Stripe account.</p>}
    <p className="a-fine-print">This prepares your receiving account. Commission requests and payments still use the bank/Wise workflow shown below. No commission is transferred by completing Stripe setup.</p>
  </div>;
}
function Recipient({row,merchant}:{row:RecipientCard;merchant:boolean}){
  const [busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[error,setError]=useState('');
  async function check(){if(busy||!row.id)return;setBusy(true);setError('');try{await post('check',{recipientId:row.id});window.location.reload();}catch(e){setError(e instanceof Error?e.message:'Status could not be checked.');setBusy(false);}}
  async function start(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError('');const data=new FormData(event.currentTarget);try{const result=await post<{url:string}>('start',{applicationId:row.application_id,country:String(data.get('country')||''),consent:data.get('consent')==='on'});const url=new URL(result.url);if(url.origin!=='https://connect.stripe.com'||!url.pathname.startsWith('/setup/'))throw new Error('Unsupported Stripe setup link.');window.location.assign(result.url);}catch(e){setError(e instanceof Error?e.message:'Stripe setup could not be opened.');setBusy(false);}}
  const stale=row.last_checked_at&&Date.now()-Date.parse(row.last_checked_at)>86400000;
  return <article className="a-recipient"><div className="a-recipient-heading"><div><small>{row.mode==='test'?'TEST / SANDBOX':'LIVE RECEIVING ACCOUNT'}</small><h3>{merchant?row.partner_name:row.business_name}</h3></div><span className={`a-recipient-state is-${row.state||'new'}`}>{labels[row.state||'']||'Not started'}</span></div>
    {row.account_id&&<span className="a-mono a-recipient-account">{row.account_id}</span>}
    <dl className="a-detail-list"><div><dt>Country</dt><dd>{row.country}</dd></div>{row.account_id&&<><div><dt>Transfer capability</dt><dd>{row.transfers_active?'Active':'Not active'}</dd></div><div><dt>Bank payouts</dt><dd>{row.payouts_enabled?'Enabled by Stripe':'Not enabled'}</dd></div><div><dt>Outstanding requirements</dt><dd>{row.requirements_count||0}</dd></div></>}{row.last_checked_at&&<div><dt>Last verified</dt><dd>{new Date(row.last_checked_at).toUTCString()}{stale?' · recheck needed':''}</dd></div>}</dl>
    {row.last_error&&<p className="a-form-error">{row.last_error}</p>}
    <div className="a-inline-actions">{row.account_id&&<button className="a-btn a-btn-outline a-btn-small" disabled={busy} type="button" onClick={check}>{busy?'Checking…':'Check Stripe status'}</button>}{!merchant&&!!row.setup_enabled&&<button className="a-btn a-btn-dark a-btn-small" disabled={busy} type="button" onClick={()=>setEditing(!editing)}>{editing?'Hide setup form':row.account_id?'Continue setup on Stripe':'Set up Stripe receiving'}</button>}</div>
    {!merchant&&!row.setup_enabled&&<p className="a-fine-print">{row.membership_status!=='approved'?'Your membership must be approved before opening setup.':'The business must enable or re-enable Stripe recipient setup before you can continue.'}</p>}
    {!merchant&&editing&&!!row.setup_enabled&&<form className="a-form a-recipient-form" onSubmit={start}><div className="a-field"><label htmlFor={`country-${row.application_id}`}>Your residence or legally established business country</label><input id={`country-${row.application_id}`} name="country" required maxLength={2} minLength={2} defaultValue={row.country} disabled={busy}/><small>Use your actual country. This pilot supports {row.country} for this business. The account country cannot be changed after setup starts.</small></div><label className="a-confirm-transfer"><input name="consent" type="checkbox" required disabled={busy}/><span>I authorize creation or continuation of my Stripe Express receiving account for {row.business_name} in the displayed {row.mode==='test'?'test':'live'} environment. I will provide my own details and review Stripe’s terms on Stripe.</span></label><button className="a-btn a-btn-dark a-btn-small" disabled={busy}>{busy?'Opening Stripe…':'Continue securely to Stripe ↗'}</button></form>}
    {error&&<p className="a-form-error" role="alert">{error}</p>}
  </article>;
}
