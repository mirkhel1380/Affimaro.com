"use client";
import {useState} from 'react';
import {storeWorkspacePath,type StorePortal} from '../lib/store-progress';
import {storePlatforms,storePlatform,type StorePlatformId} from '../lib/store-platform-catalog.mjs';
import {StoreSetup} from './store-setup';
import {ShopifySetup} from './shopify-setup';
export function StoreChoice({portal='brand'}:{portal?:StorePortal}){
  const [platform,setPlatform]=useState<StorePlatformId>('woocommerce'),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false);
  const selected=storePlatform(platform);
  function choose(id:StorePlatformId){
    if(busy||connected)return;setPlatform(id);
    const login=storePlatform(id).loginUrl;if(login)window.open(login,'_blank','noopener,noreferrer');
  }
  return <>{!connected&&<section className="a-platform-picker" aria-label="Choose your website platform">
    <p>Choose your platform to open its sign-in in a new tab and show the setup below. For self-hosted WordPress, enter your installation URL first.</p>
    <div className="a-platform-grid" role="group" aria-label="Store platform">{storePlatforms.map(option=><button className={'a-platform-tile a-platform-'+option.id+(platform===option.id?' is-active':'')} type="button" key={option.id} disabled={busy} aria-label={option.name+(option.loginUrl?' — open sign-in in a new tab and show setup':' — show setup')} aria-pressed={platform===option.id} aria-controls="store-connection-panel" onClick={()=>choose(option.id)}><span className="a-platform-mark" aria-hidden="true"><img src={'/platform-logos/'+(option.id==='wordpress-com'?'wordpress':option.id)+'.svg'} width="24" height="24" alt=""/></span><span className="a-platform-tile-copy"><strong>{option.name}{option.loginUrl&&<span aria-hidden="true"> ↗</span>}</strong><small>{option.capability}</small><span>{option.description}</span></span></button>)}</div>
    <div className="a-platform-selection" aria-live="polite"><strong>{selected.name}</strong><span>{selected.capability}</span></div>
  </section>}{selected.method==='shopify'?<ShopifySetup portal={portal} connection={null} status={null} onBusyChange={setBusy}/>:<StoreSetup portal={portal} key={platform} initial={null} platform={selected.method} providerId={platform} onConnected={()=>setConnected(true)} onBusyChange={setBusy}/>}{connected&&<p className="a-fine-print a-card-body">Save your one-time signing key, then <a href={storeWorkspacePath(portal)}>refresh saved setup progress</a>.</p>}</>;
}
