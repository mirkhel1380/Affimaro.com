import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement,isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {storePlatforms,storePlatform,wordpressAdminUrl} from '../lib/store-platform-catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'store-platform-picker-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__storePlatformHooks;});
const entry="export {StoreChoice} from './app/store-choice';export {StoreSetup,PlatformSignInStep} from './app/store-setup';export {ShopifySetup} from './app/shopify-setup';";
const options={stdin:{contents:entry,resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'};
const bundles=await Promise.all([build(options),build({...options,plugins:[{name:'store-platform-hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function useState(initial){const h=globalThis.__storePlatformHooks,index=h.cursor++;if(!(index in h.states))h.states[index]=typeof initial==='function'?initial():initial;return [h.states[index],next=>{h.states[index]=typeof next==='function'?next(h.states[index]):next;}];}export function useEffect(){}",loader:'js'}));}}]})]);
const modules=[];for(let i=0;i<bundles.length;i++){const path=join(temp,'views-'+i+'.mjs');writeFileSync(path,bundles[i].outputFiles[0].contents);modules.push(await import(pathToFileURL(path).href));}
const [ssr,views]=modules;
function all(node,check,out=[]){if(Array.isArray(node)){for(const child of node)all(child,check,out);return out;}if(!isValidElement(node))return out;if(check(node))out.push(node);all(node.props.children,check,out);return out;}
const textOf=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(textOf).join(''):typeof node==='object'?textOf(node.props?.children):String(node);
const element=(tree,type,label)=>all(tree,node=>node.type===type&&(!label||textOf(node).includes(label)))[0];
function mount(component,props){const hooks={cursor:0,states:[]};return ()=>{globalThis.__storePlatformHooks=hooks;hooks.cursor=0;return component(props);};}
function browserFixture(t){const savedWindow=globalThis.window,savedFormData=globalThis.FormData,opened=[],assigned=[];globalThis.window={open:(...args)=>opened.push(args),confirm:()=>true,location:{origin:'https://affimaro.example',assign:url=>assigned.push(url),reload:()=>assigned.push('reload')}};globalThis.FormData=class{constructor(data){this.data=data;}get(key){return this.data[key]??null;}};t.after(()=>{if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;globalThis.FormData=savedFormData;});return {opened,assigned};}
const connection={id:'fixture-connection',store_url:'https://store.example/shop',platform:'woocommerce',active:1,last_seen:null};

test('catalog keeps verified provider login destinations separate from actual supported connection methods',()=>{
 assert.equal(new Set(storePlatforms.map(p=>p.id)).size,7);
 const expected={shopify:'https://www.shopify.com/login','wordpress-com':'https://wordpress.com/log-in/',bigcommerce:'https://login.bigcommerce.com/login',wix:'https://users.wix.com/signin',squarespace:'https://www.squarespace.com/login'};
 for(const [id,url] of Object.entries(expected)){assert.equal(storePlatform(id).loginUrl,url);assert.equal(new URL(url).protocol,'https:');}
 assert.equal(storePlatform('woocommerce').loginUrl,undefined);assert.equal(storePlatform('custom').loginUrl,undefined);
 for(const id of ['bigcommerce','wix','squarespace','custom']){const p=storePlatform(id);assert.equal(p.method,'custom');assert.equal(p.capability,'Developer integration');assert.match(p.setupNote,/developer/i);assert.equal(p.guideUrl,'/guides/custom-website-setup');}
 assert.match(storePlatform('wordpress-com').setupNote,/Requires WooCommerce.*plan.*plugin/);
});

test('WordPress admin destinations preserve exact installation paths and reject unsafe or ambiguous home URLs',()=>{
 assert.equal(wordpressAdminUrl('https://store.example'),'https://store.example/wp-admin/');
 assert.equal(wordpressAdminUrl(' https://Store.Example/shop/subsite/ '),'https://store.example/shop/subsite/wp-admin/');
 for(const url of ['http://store.example','javascript:alert(1)','//store.example','https://store.example\\@evil.example','https://name:password@store.example','https://store.example:8443','https://127.0.0.1','https://0x7f000001','https://2130706433','https://[::1]','https://localhost','https://router.local','https://service.internal','https://127.0.0.1.nip.io','https://store.example/?redirect=https://evil.example','https://store.example/#login','https://store.example/wp-admin/','https://store.example/shop/wp-login.php','https://store.example./','https://store.example/\nadmin'])assert.throws(()=>wordpressAdminUrl(url),{name:'Error'},url);
});

test('actual picker opens the chosen provider, preserves portal props and blocks busy switching',t=>{
 const browser=browserFixture(t);
 for(const portal of ['brand','agency']){const render=mount(views.StoreChoice,{portal});let tree=render();assert.equal(all(tree,n=>n.type==='button'&&n.props['aria-controls']==='store-connection-panel').length,7);
  element(tree,'button','Shopify').props.onClick();tree=render();let child=all(tree,n=>n.type===views.ShopifySetup)[0];assert.equal(child.props.portal,portal);
  const before=browser.opened.length;assert.deepEqual(browser.opened.at(-1),['https://www.shopify.com/login','_blank','noopener,noreferrer']);
  child.props.onBusyChange(true);tree=render();const wix=element(tree,'button','Wix');assert.equal(wix.props.disabled,true);wix.props.onClick();tree=render();assert.equal(all(tree,n=>n.type===views.ShopifySetup).length,1);assert.equal(browser.opened.length,before);
  child.props.onBusyChange(false);tree=render();element(tree,'button','Wix').props.onClick();tree=render();child=all(tree,n=>n.type===views.StoreSetup)[0];assert.equal(child.props.platform,'custom');assert.equal(child.props.providerId,'wix');assert.equal(child.props.portal,portal);assert.deepEqual(browser.opened.at(-1),['https://users.wix.com/signin','_blank','noopener,noreferrer']);
  child.props.onConnected();tree=render();assert.equal(all(tree,n=>n.type==='button').length,0);assert.equal(element(tree,'a').props.href,portal==='agency'?'/agency/program?tab=store':'/workspace?tab=store');
 }
});

test('real sign-in controls open genuine provider pages in a separate tab and never submit connection requests',t=>{
 browserFixture(t);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected connection request');});
 for(const id of ['shopify','wordpress-com','bigcommerce','wix','squarespace']){let tree=views.PlatformSignInStep({platformId:id}),link=element(tree,'a');assert.equal(link.props.href,storePlatform(id).loginUrl);assert.equal(link.props.target,'_blank');assert.equal(link.props.rel,'noopener noreferrer');assert.match(textOf(tree),/does not connect.*step 2/);let prevented=0;link.props.onClick({preventDefault(){prevented++;}});assert.equal(prevented,0);
  tree=views.PlatformSignInStep({platformId:id,busy:true});link=element(tree,'a');assert.equal(link.props['aria-disabled'],true);link.props.onClick({preventDefault(){prevented++;}});assert.equal(prevented,1);
 }
 assert.equal(calls,0);
});

test('actual self-hosted WordPress action opens only the supplied safe site and keeps setup unconnected',async t=>{
 const browser=browserFixture(t);let calls=0,connected=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected connection request');});const render=mount(views.StoreSetup,{initial:null,onConnected:()=>connected++});let tree=render();
 for(const value of ['https://127.0.0.1','https://user:pass@store.example','http://store.example']){element(tree,'input').props.onChange({target:{value}});tree=render();element(tree,'button','Open WordPress admin').props.onClick();tree=render();assert.ok(element(tree,'small','Enter your public HTTPS WordPress home URL'));await element(tree,'form').props.onSubmit({preventDefault(){},currentTarget:{storeUrl:value}});tree=render();}
 assert.equal(browser.opened.length,0);assert.equal(calls,0);
 element(tree,'input').props.onChange({target:{value:'https://store.example/shop/'}});tree=render();element(tree,'button','Open WordPress admin').props.onClick();tree=render();assert.deepEqual(browser.opened,[['https://store.example/shop/wp-admin/','_blank','noopener,noreferrer']]);assert.equal(calls,0);assert.equal(connected,0);assert.equal(all(tree,n=>n.props?.id==='store-new-key').length,0);
});

test('actual custom-provider submissions retain custom payloads, busy state and one-time signing-key acknowledgement',async t=>{
 browserFixture(t);const requests=[],busy=[];let resolveResponse;const pending=new Promise(resolve=>{resolveResponse=resolve;});t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});return pending;});let connected=0;const render=mount(views.StoreSetup,{initial:null,platform:'custom',providerId:'bigcommerce',portal:'agency',onBusyChange:value=>busy.push(value),onConnected:()=>connected++});let tree=render();const submit=element(tree,'form').props.onSubmit({preventDefault(){},currentTarget:{storeUrl:'https://store.example'}});tree=render();assert.equal(element(tree,'button','Creating connection').props.disabled,true);await element(tree,'form').props.onSubmit({preventDefault(){},currentTarget:{storeUrl:'https://other.example'}});assert.equal(requests.length,1);assert.deepEqual(requests[0].body,{action:'connect',storeUrl:'https://store.example',platform:'custom'});assert.equal(requests[0].url,'/api/store');assert.equal(requests[0].init.credentials,'same-origin');
 resolveResponse({ok:true,json:async()=>({ok:true,data:{connection:{...connection,platform:'custom'},key:'ONE_TIME_FIXTURE_KEY'}})});await submit;tree=render();assert.deepEqual(busy,[true,false]);assert.equal(connected,1);assert.equal(all(tree,n=>n.props?.id==='store-new-key')[0].props.value,'ONE_TIME_FIXTURE_KEY');assert.equal(element(tree,'a','Refresh status').props.href,'/agency/program?tab=store');element(tree,'button','I have saved it').props.onClick();tree=render();assert.equal(all(tree,n=>n.props?.id==='store-new-key').length,0);
});

test('WordPress.com setup submits only the existing WooCommerce discriminator after displaying its plugin requirement',async t=>{
 browserFixture(t);const requests=[];t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push(JSON.parse(init.body));return {ok:false,json:async()=>({ok:false,error:'Fixture connection not created'})};});const render=mount(views.StoreSetup,{initial:null,platform:'woocommerce',providerId:'wordpress-com'});let tree=render();assert.match(textOf(tree),/Requires WooCommerce.*plan.*plugin/);assert.equal(all(tree,n=>n.type===views.PlatformSignInStep)[0].props.platformId,'wordpress-com');await element(tree,'form').props.onSubmit({preventDefault(){},currentTarget:{storeUrl:'https://store.example'}});tree=render();assert.deepEqual(requests,[{action:'connect',storeUrl:'https://store.example',platform:'woocommerce'}]);assert.match(textOf(tree),/Fixture connection not created/);assert.equal(element(tree,'button','Create store connection').props.disabled,false);
});

test('Shopify keeps its merchant-owned app payload and returns successful agency setup to the agency store route',async t=>{
 const browser=browserFixture(t),busy=[],requests=[];t.mock.method(globalThis,'fetch',async(url,init)=>{requests.push({url,init,body:JSON.parse(init.body)});return {ok:true,json:async()=>({ok:true,data:{connected:true}})};});const render=mount(views.ShopifySetup,{connection:null,status:null,portal:'agency',onBusyChange:value=>busy.push(value)});let tree=render();assert.equal(all(tree,n=>n.type===views.PlatformSignInStep)[0].props.platformId,'shopify');const values={shopDomain:'store.myshopify.com',clientId:'fixture-client-identifier',clientSecret:'fixture-app-client-secret'};await element(tree,'form').props.onSubmit({preventDefault(){},currentTarget:values});tree=render();assert.deepEqual(requests[0].body,{action:'connect',data:values});assert.equal(requests[0].url,'/api/shopify');assert.equal(requests[0].init.credentials,'same-origin');assert.deepEqual(browser.assigned,['/agency/program?tab=store']);assert.deepEqual(busy,[true]);assert.match(textOf(tree),/your Shopify account password is not required/);
});

test('server-rendered existing connections keep their history, own portal links and safe site-admin handoffs',()=>{
 for(const portal of ['brand','agency']){const html=renderToStaticMarkup(createElement(ssr.StoreSetup,{initial:connection,portal}));assert.match(html,/Waiting for WordPress connection test/);assert.ok(html.includes('https://store.example/shop/wp-admin/'));assert.ok(html.includes(portal==='agency'?'/agency/program?tab=store':'/workspace?tab=store'));assert.ok(!html.includes('Create store connection'));assert.ok(!html.includes('store-new-key'));}
 const html=renderToStaticMarkup(createElement(ssr.StoreSetup,{initial:{...connection,store_url:'https://127.0.0.1'},portal:'brand'}));assert.ok(!html.includes('href="https://127.0.0.1'));
 const shopify=renderToStaticMarkup(createElement(ssr.ShopifySetup,{connection:null,status:null}));assert.ok(shopify.includes('href="https://www.shopify.com/login"'));assert.match(shopify,/merchant-owned app/);assert.match(shopify,/Complete Affimaro setup/);
});
