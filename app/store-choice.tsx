"use client";
import {useState} from 'react';
import {StoreSetup} from './store-setup';
import {ShopifySetup} from './shopify-setup';
export function StoreChoice(){const [platform,setPlatform]=useState('woocommerce');return <><div className="a-store-choice" role="group" aria-label="Store platform"><button className={platform==='woocommerce'?'is-active':''} type="button" aria-pressed={platform==='woocommerce'} onClick={()=>setPlatform('woocommerce')}><span className="a-woo">W</span><strong>WooCommerce</strong><small>WordPress plugin</small></button><button className={platform==='shopify'?'is-active':''} type="button" aria-pressed={platform==='shopify'} onClick={()=>setPlatform('shopify')}><span className="a-shopify-symbol">S</span><strong>Shopify</strong><small>Private dashboard sync</small></button></div>{platform==='woocommerce'?<StoreSetup initial={null}/>:<ShopifySetup connection={null} status={null}/>}</>;}
