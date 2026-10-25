"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {storeWorkspacePath,type StorePortal} from '../lib/store-progress';
import {storePlatform,wordpressAdminUrl,type StorePlatformId} from '../lib/store-platform-catalog.mjs';
import type {Connection} from '../lib/woocommerce';

export function PlatformSignInStep({platformId,busy=false}:{platformId:StorePlatformId;busy?:boolean}){
  const platform=storePlatform(platformId);
  return <section className="a-platform-step" aria-label="Platform sign-in">
    <div className="a-platform-step-heading"><b aria-hidden="true">1</b><h3>{platform.loginUrl?'Sign in to '+platform.name:'Prepare your website backend'}</h3></div>
    {platform.loginUrl?<><p>Open your {platform.name} account in a new tab. Keep this page open to complete the connection.</p><a className="a-btn a-btn-outline" href={platform.loginUrl} target="_blank" rel="noopener noreferrer" aria-disabled={busy||undefined} tabIndex={busy?-1:undefined} onClick={event=>{if(busy)event.preventDefault();}}>Open {platform.name} sign-in <span aria-hidden="true">↗</span></a><p className="a-fine-print">Signing in to {platform.name} does not connect it to Affimaro. Complete step 2 below.</p></>:<p>Ask your developer to prepare server-side referral, order and refund delivery. Keep the website backend available while you finish setup.</p>}
  </section>;
}

export function StoreSetup({initial,platform='woocommerce',providerId,portal='brand',onConnected,onBusyChange}:{initial:Connection|null;platform?:'woocommerce'|'custom';providerId?:StorePlatformId;portal?:StorePortal;onConnected?:()=>void;onBusyChange?:(busy:boolean)=>void}){
  const custom=platform==='custom',provider=storePlatform(providerId||(custom?'custom':'woocommerce')),selfHosted=!custom&&provider.id==='woocommerce';
  const [connection,setConnection]=useState(initial),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(''),[origin,setOrigin]=useState(''),[homeUrl,setHomeUrl]=useState(initial?.store_url||''),[loginError,setLoginError]=useState('');
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
  async function connect(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const storeUrl=String(new FormData(e.currentTarget).get('storeUrl')||'');
    if(!custom){try{wordpressAdminUrl(storeUrl);}catch(e){setLoginError(e instanceof Error?e.message:'Enter your WordPress home URL.');return;}}
    await configure({action:'connect',storeUrl});
  }
  function openWordPress(){
    if(busy)return;
    try{const target=wordpressAdminUrl(homeUrl);setLoginError('');window.open(target,'_blank','noopener,noreferrer');}catch(e){setLoginError(e instanceof Error?e.message:'Enter your WordPress home URL.');}
  }
  async function copy(value:string){try{await navigator.clipboard.writeText(value);setCopied('Copied securely to your clipboard.');}catch{setCopied('Select the field and copy it manually.');}}
  const addressField=<div className="a-field"><label htmlFor="store-url">{custom?'Website home URL':'WooCommerce home URL'}</label><input id="store-url" name="storeUrl" type="url" required maxLength={300} value={homeUrl} onChange={event=>{setHomeUrl(event.target.value);setLoginError('');}} placeholder={custom?'https://your-website.com':'https://your-store.com'} autoComplete="url" spellCheck={false} aria-invalid={loginError?true:undefined} aria-describedby={loginError?'store-home-help store-login-error':'store-home-help'}/><small id="store-home-help">Use the exact HTTPS home URL. Include the subdirectory if your storefront uses one.</small>{selfHosted&&<div className="a-platform-wordpress-login"><button className="a-btn a-btn-outline" type="button" disabled={busy} onClick={openWordPress}>Open WordPress admin <span aria-hidden="true">↗</span></button><small>Opens wp-admin on your own website in a new tab.</small></div>}{loginError&&<small className="a-platform-invalid" id="store-login-error" role="alert">{loginError}</small>}</div>;
  const connectionFields=<><div className="a-field"><label htmlFor="affimaro-origin">Affimaro URL</label><input id="affimaro-origin" type="url" readOnly value={origin} placeholder="Loading address…" autoComplete="off" spellCheck={false}/><small>{custom?'Use this address in your server’s connection settings.':'Paste this address into the plugin’s Affimaro URL field.'}</small><button className="a-btn a-btn-outline a-btn-small" type="button" disabled={!origin} onClick={()=>copy(origin)}>Copy Affimaro URL</button></div>{custom&&<div className="a-field"><label htmlFor="custom-event-url">Event URL</label><input id="custom-event-url" type="url" readOnly value={origin?origin+'/api/custom/event':''} placeholder="Loading address…" autoComplete="off" spellCheck={false}/><small>Server-to-server deliveries. Keep the signing key off your storefront and mobile app.</small></div>}</>;
  let savedAdminUrl='';
  if(connection&&!custom){try{savedAdminUrl=wordpressAdminUrl(connection.store_url);}catch{/* Do not turn an older invalid destination into a login link. */}}
  return <div className="a-card-body" id="store-connection-panel">
    {!connection?<form className="a-form a-platform-connection-form" onSubmit={connect}>
      {selfHosted?<section className="a-platform-step" aria-label="WordPress sign-in"><div className="a-platform-step-heading"><b aria-hidden="true">1</b><h3>Open your WordPress store</h3></div><p>Use your own WordPress admin to install and configure the Affimaro plugin.</p>{addressField}<p className="a-fine-print">Signing in to WordPress does not connect the store. Complete step 2 below.</p></section>:<PlatformSignInStep platformId={provider.id} busy={busy}/>}
      <section className="a-platform-step" aria-label="Affimaro connection setup"><div className="a-platform-step-heading"><b aria-hidden="true">2</b><h3>Complete Affimaro setup</h3></div><p className="a-platform-help"><strong>{provider.capability}.</strong> {provider.setupNote}</p>{!selfHosted&&addressField}{connectionFields}<button className="a-btn a-btn-dark" disabled={busy}>{busy?'Creating connection…':'Create '+(custom?'website':'store')+' connection'} <span aria-hidden="true">→</span></button><p className="a-fine-print">Creating the connection generates credentials. {custom?'Your backend must still send a signed connection test.':'WordPress must still pass the plugin connection test.'}</p><a className="a-text-link" href={provider.guideUrl} target="_blank" rel="noopener noreferrer">Read the setup guide ↗</a></section>
    </form>:<>
      {custom&&<p className="a-muted">For a website with its own backend. Your developer installs the server client and connects referral visits, payments and refunds from your order system.</p>}
      {connectionFields}
      <div className="a-store-url"><span className={custom?'a-custom-symbol':'a-woo'}>{custom?'↗':'W'}</span><div><strong>{connection.store_url}</strong><p>{!connection.active?'Connection paused':connection.last_seen?'Signed delivery received':custom?'Waiting for your server connection test':'Waiting for WordPress connection test'}</p></div></div>
      {savedAdminUrl&&<a className="a-text-link a-platform-saved-login" href={savedAdminUrl} target="_blank" rel="noopener noreferrer">Open your WordPress admin ↗</a>}
      <dl className="a-detail-list"><div><dt>Connection ID</dt><dd className="a-mono">{connection.id}</dd></div><div><dt>Last signed delivery</dt><dd>{connection.last_seen?new Date(connection.last_seen).toUTCString():'None yet'}</dd></div></dl>
      {key&&<div className="a-key-box" role="status"><strong>Save your new signing key now.</strong><p>{custom?'It is shown once. Ask your developer to save it in your backend’s secret settings.':'It is shown once. Store it securely and paste it into WordPress → WooCommerce → Affimaro.'}</p><label htmlFor="store-new-key">One-time signing key</label><input id="store-new-key" type="text" readOnly value={key} autoComplete="off" spellCheck={false}/><div className="a-inline-actions"><button type="button" className="a-btn a-btn-dark a-btn-small" onClick={()=>copy(key)}>Copy signing key</button><button type="button" className="a-btn a-btn-outline a-btn-small" onClick={()=>setKey('')}>I have saved it</button></div></div>}
      <div className="a-inline-actions"><button className="a-btn a-btn-outline a-btn-small" type="button" onClick={()=>copy(connection.id)}>Copy connection ID</button><button className="a-btn a-btn-outline a-btn-small" disabled={busy} type="button" onClick={()=>configure({action:'rotate'})}>Rotate signing key</button><button className="a-btn a-btn-outline a-btn-small" disabled={busy} type="button" onClick={()=>configure({action:connection.active?'disconnect':'resume'})}>{connection.active?'Pause connection':'Resume connection'}</button><a className="a-text-link" href={storeWorkspacePath(portal)}>Refresh status ↗</a></div>
    </>}
    {copied&&<p role="status" className="a-fine-print">{copied}</p>}{error&&<p role="alert" className="a-form-error">{error}</p>}{busy&&<p role="status">Saving connection…</p>}
  </div>;
}
