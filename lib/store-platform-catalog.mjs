/** @typedef {'woocommerce'|'shopify'|'custom'} StoreConnectionMethod */
/** @typedef {'woocommerce'|'shopify'|'wordpress-com'|'bigcommerce'|'wix'|'squarespace'|'custom'} StorePlatformId */
/** @typedef {{id:StorePlatformId,name:string,mark:string,method:StoreConnectionMethod,capability:string,description:string,setupNote:string,guideUrl:string,loginUrl?:string}} StorePlatform */

// Provider-owned sign-in pages verified against their official help or login pages.
// help.shopify.com/en/manual/your-account/logging-in; support.wix.com/en/article/logging-in-to-your-wix-account;
// support.squarespace.com/hc/en-us/articles/206537307-Log-in-and-out-of-your-account;
// wordpress.com/support/plugins/install-a-plugin/; login.bigcommerce.com/login.
/** @type {readonly StorePlatform[]} */
export const storePlatforms=[
  {id:'woocommerce',name:'WooCommerce',mark:'W',method:'woocommerce',capability:'WordPress plugin',description:'For a self-hosted WordPress store.',setupNote:'Install the Affimaro plugin, save its connection credentials and run the WordPress connection test.',guideUrl:'/guides/woocommerce-setup'},
  {id:'shopify',name:'Shopify',mark:'S',method:'shopify',capability:'Merchant-owned app',description:'Connect your app, then sync orders here.',setupNote:'Requires an app in the same Shopify organization as the store, with read_orders access. Orders update when you run dashboard sync.',guideUrl:'/guides/shopify-setup',loginUrl:'https://www.shopify.com/login'},
  {id:'wordpress-com',name:'WordPress.com',mark:'W.',method:'woocommerce',capability:'WooCommerce plugin',description:'For a hosted WordPress.com store.',setupNote:'Requires WooCommerce and a WordPress.com plan that allows plugin installation. A WordPress.com website without WooCommerce is not a supported store connection.',guideUrl:'/guides/woocommerce-setup',loginUrl:'https://wordpress.com/log-in/'},
  {id:'bigcommerce',name:'BigCommerce',mark:'B',method:'custom',capability:'Developer integration',description:'Connect through your own backend.',setupNote:'No built-in BigCommerce sync is connected. Your developer needs platform API or event access and your own backend to deliver signed referrals, orders and refunds.',guideUrl:'/guides/custom-website-setup',loginUrl:'https://login.bigcommerce.com/login'},
  {id:'wix',name:'Wix',mark:'Wi',method:'custom',capability:'Developer integration',description:'Connect through your own backend.',setupNote:'No built-in Wix sync is connected. Your developer needs platform API or event access and your own backend to deliver signed referrals, orders and refunds.',guideUrl:'/guides/custom-website-setup',loginUrl:'https://users.wix.com/signin'},
  {id:'squarespace',name:'Squarespace',mark:'Sq',method:'custom',capability:'Developer integration',description:'Connect through your own backend.',setupNote:'No built-in Squarespace sync is connected. Your developer needs platform API or event access and your own backend to deliver signed referrals, orders and refunds.',guideUrl:'/guides/custom-website-setup',loginUrl:'https://www.squarespace.com/login'},
  {id:'custom',name:'Your own website',mark:'↗',method:'custom',capability:'Developer integration',description:'For a website with its own backend.',setupNote:'Your developer installs the signed server client and connects referral visits, orders and refunds from your order system.',guideUrl:'/guides/custom-website-setup'},
];

/** @param {StorePlatformId} id @returns {StorePlatform} */
export function storePlatform(id){
  return storePlatforms.find(platform=>platform.id===id)||storePlatforms[0];
}

const homeUrlMessage='Enter your public HTTPS WordPress home URL, including its subdirectory. Leave out login credentials, query strings and fragments.';

/** Build the admin destination from the merchant's exact WordPress installation home.
 * @param {string} value @returns {string}
 */
export function wordpressAdminUrl(value){
  const input=value.trim();
  if(!/^https:\/\//i.test(input)||/[\\\u0000-\u0020\u007f]/.test(input)||input.length>300)throw new Error(homeUrlMessage);
  let url;
  try{url=new URL(input);}catch{throw new Error(homeUrlMessage);}
  const host=url.hostname;
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||host.length>253||!host.includes('.')||host.endsWith('.')||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(host)||/^\d+(?:\.\d+)*$/.test(host)||/\.(?:localhost|local|localdomain|internal|home|lan|onion|arpa)$/i.test(host)||/(?:^|\.)(?:nip\.io|sslip\.io|localtest\.me|lvh\.me)$/i.test(host))throw new Error(homeUrlMessage);
  if(/\/(?:wp-admin|wp-login\.php)(?:\/|$)/i.test(url.pathname))throw new Error('Enter the WordPress home URL, rather than its wp-admin or wp-login address.');
  url.pathname=url.pathname.replace(/\/+$/,'')+'/wp-admin/';
  return url.href;
}
