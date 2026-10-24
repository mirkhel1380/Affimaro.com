"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {storeWorkspacePath,type StorePortal} from '../lib/store-progress';
import type {Connection} from '../lib/woocommerce';
export function StoreSetup({initial,platform='woocommerce',portal='brand',onConnected,onBusyChange}:{initial:Connection|null;platform?:'woocommerce'|'custom';portal?:StorePortal;onConnected?:()=>void;onBusyChange?:(busy:boolean)=>void}){
  const custom=platform==='custom';
  const [connection,setConnection]=useState(initial),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(''),[origin,setOrigin]=useState('');
  useEffect(()=>setOrigin(window.location.origin),[]);
  async function configure(body:Record<string,unknown>){
    if(busy)return;
    if(body.action==='rotate'&&!window.confirm(custom?'Replace the signing key? Deliveries will stop until your developer saves the new key on your website server.':'Replace the signing key? WordPress deliveries will stop until you save the new key there.'))return;
    if(body.action==='disconnect'&&!window.confirm('Pause this connection? Referral capture and order/refund updates will stop until you resume it.'))return;
    setBusy(true);onBusyChange?.(true);setError('');setCopied('');
    try{
      const response=await fetch('/api/store',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({...body,platform})});
      const result=await response.json() as {ok?:boolean;error?:string;data?:{connection:Connection;key?:string}};
      if(!response.ok||!result?.ok||!result.data?.connection)throw new Error(result?.error||'The store connection could not be updated.');
      setConnection(result.data.connection);setKey(result.data.key||'');onConnected?.();
    }catch(e){setError(e instanceof Error?e.message:'The connection failed.');}finally{setBusy(false);onBusyChange?.(false);}
  }
  async function connect(e:FormEvent<HTMLFormElement>){e.preventDefault();await configure({action:'connect',storeUrl:String(new FormData(e.currentTarget).get('storeUrl')||'')});}
  async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopied('Copied securely to your clipboard.');}catch{setCopied('Select the field and copy it manually.');}}
  return <div className="a-card-body" id="store-connection-panel">
    {custom&&<p className="a-muted">For a website with its own backend. Your developer installs the server client and connects referral visits, payments and refunds from your order system.</p>}
    <div className="a-field"><label htmlFor="affimaro-origin">Affimaro URL</label><input id="affimaro-origin" type="url" readOnly value={origin} placeholder="Loading address…" autoComplete="off" spellCheck={false}/><small>{custom?'Use this address in your server’s connection settings.':'Paste this address into the plugin’s Affimaro URL field.'}</small><button className="a-btn a-btn-outline a-btn-small" type="button" disabled={!origin} onClick={()=>copy(origin)}>Copy Affimaro URL</button></div>
    {custom&&<div className="a-field"><label htmlFor="custom-event-url">Event URL</label><input id="custom-event-url" type="url" readOnly value={origin?origin+'/api/custom/event':''} placeholder="Loading address…" autoComplete="off" spellCheck={false}/><small>Server-to-server deliveries. Keep the signing key off your storefront and mobile app.</small></div>}
    {!connection?<form className="a-form" onSubmit={connect}><p className="a-muted">{custom?'Enter your website’s exact HTTPS home URL. After creating the connection, run the connection test from your backend.':'Start with the exact HTTPS home URL of your WooCommerce store. Creating a connection generates credentials; WordPress must still pass its connection test.'}</p><div className="a-field"><label htmlFor="store-url">{custom?'Website home URL':'WooCommerce home URL'}</label><input id="store-url" name="storeUrl" type="url" required maxLength={300} placeholder={custom?'https://your-website.com':'https://your-store.com'}/><small>Include the subdirectory if your storefront uses one.</small></div><button className="a-btn a-btn-dark" disabled={busy}>Create {custom?'website':'store'} connection <span>→</span></button></form>:<>
      <div className="a-store-url"><span className={custom?'a-custom-symbol':'a-woo'}>{custom?'↗':'W'}</span><div><strong>{connection.store_url}</strong><p>{!connection.active?'Connection paused':connection.last_seen?'Signed delivery received':custom?'Waiting for your server connection test':'Waiting for WordPress connection test'}</p></div></div>
      <dl className="a-detail-list"><div><dt>Connection ID</dt><dd className="a-mono">{connection.id}</dd></div><div><dt>Last signed delivery</dt><dd>{connection.last_seen?new Date(connection.last_seen).toUTCString():'None yet'}</dd></div></dl>
      {key&&<div className="a-key-box" role="status"><strong>Save your new signing key now.</strong><p>{custom?'It is shown once. Ask your developer to save it in your backend’s secret settings.':'It is shown once. Store it securely and paste it into WordPress → WooCommerce → Affimaro.'}</p><label htmlFor="store-new-key">One-time signing key</label><input id="store-new-key" type="text" readOnly value={key} autoComplete="off" spellCheck={false}/><div className="a-inline-actions"><button type="button" className="a-btn a-btn-dark a-btn-small" onClick={()=>copy(key)}>Copy signing key</button><button type="button" className="a-btn a-btn-outline a-btn-small" onClick={()=>setKey('')}>I have saved it</button></div></div>}
      <div className="a-inline-actions"><button className="a-btn a-btn-outline a-btn-small" type="button" onClick={()=>copy(connection.id)}>Copy connection ID</button><button className="a-btn a-btn-outline a-btn-small" disabled={busy} type="button" onClick={()=>configure({action:'rotate'})}>Rotate signing key</button><button className="a-btn a-btn-outline a-btn-small" disabled={busy} type="button" onClick={()=>configure({action:connection.active?'disconnect':'resume'})}>{connection.active?'Pause connection':'Resume connection'}</button><a className="a-text-link" href={storeWorkspacePath(portal)}>Refresh status ↗</a></div>
    </>}
    {copied&&<p role="status" className="a-fine-print">{copied}</p>}{error&&<p role="alert" className="a-form-error">{error}</p>}{busy&&<p role="status">Saving connection…</p>}
  </div>;
}
