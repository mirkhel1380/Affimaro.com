"use client";
import {useState} from 'react';
import {StoreSetup} from './store-setup';
import {ShopifySetup} from './shopify-setup';
export function StoreChoice(){
  const [platform,setPlatform]=useState<'woocommerce'|'shopify'|'custom'>('woocommerce'),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false);
  return <>{!connected&&<div className="a-store-choice" role="group" aria-label="Store platform">
    <button className={platform==='woocommerce'?'is-active':''} type="button" disabled={busy} aria-pressed={platform==='woocommerce'} onClick={()=>setPlatform('woocommerce')}><span className="a-woo">W</span><strong>WooCommerce</strong><small>WordPress plugin</small></button>
    <button className={platform==='shopify'?'is-active':''} type="button" disabled={busy} aria-pressed={platform==='shopify'} onClick={()=>setPlatform('shopify')}><span className="a-shopify-symbol">S</span><strong>Shopify</strong><small>Dashboard sync</small></button>
    <button className={'a-custom-choice '+(platform==='custom'?'is-active':'')} type="button" disabled={busy} aria-pressed={platform==='custom'} onClick={()=>setPlatform('custom')}><span className="a-custom-symbol">↗</span><strong>Custom website</strong><small>Connect your own backend · Developer setup</small></button>
  </div>}{platform==='shopify'?<ShopifySetup connection={null} status={null} onBusyChange={setBusy}/>:<StoreSetup key={platform} initial={null} platform={platform} onConnected={()=>setConnected(true)} onBusyChange={setBusy}/>}</>;
}
