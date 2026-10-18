import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const worker=await readFile(new URL('../public/service-worker.js',import.meta.url),'utf8');
const installer=await readFile(new URL('../public/install-app.js',import.meta.url),'utf8');
const origin='https://affimaro.example';
const publicPaths=['/offline','/manifest.webmanifest','/app-icons/icon-192.png','/app-icons/icon-512.png','/app-icons/apple-touch-icon.png'];

function workerFixture(){
  const handlers=new Map(),stores=new Map(),calls=[],puts=[],deleted=[];
  const state={offline:false,privateAsset:false,claimed:false,skipped:false};
  const key=value=>new URL(typeof value==='string'?value:value.url,origin).href;
  const caches={
    async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return{
      async put(path,response){puts.push(key(path));data.set(key(path),response.clone());},
      async match(path){return data.get(key(path))?.clone();},
    };},
    async keys(){return [...stores.keys()];},
    async delete(name){deleted.push(name);return stores.delete(name);},
  };
  const fetcher=async(request,options={})=>{
    const path=new URL(typeof request==='string'?request:request.url,origin).pathname;
    calls.push({request,options,path});
    if(state.offline)throw new TypeError('Offline fixture');
    const isPublic=publicPaths.includes(path),privateData=!isPublic||state.privateAsset;
    const contentType=path.endsWith('.png')?'image/png':path.endsWith('.webmanifest')?'application/manifest+json':'text/html';
    return new Response(privateData?'PRIVATE_ACCOUNT_PAYMENT_DATA':path==='/offline'?'PUBLIC_RECONNECT_SCREEN':'PUBLIC_ASSET',{
      headers:{'Content-Type':contentType,'Cache-Control':privateData?'private, no-store':'public, max-age=0'},
    });
  };
  const self={location:{origin},addEventListener:(name,handler)=>handlers.set(name,handler),skipWaiting:async()=>{state.skipped=true;},clients:{claim:async()=>{state.claimed=true;}}};
  runInNewContext(worker,{self,caches,fetch:fetcher,URL,Response,Promise});
  const lifecycle=async name=>{let result;handlers.get(name)({waitUntil(value){result=value;}});await result;};
  const request=(path,method='GET',mode='same-origin')=>{
    let result;const input={url:new URL(path,origin).href,method,mode};
    handlers.get('fetch')({request:input,respondWith(value){result=value;}});
    return {result,input};
  };
  return {state,calls,puts,stores,deleted,caches,lifecycle,request};
}

test('mobile install assets use valid icons and relative URLs that survive a domain move',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.prefer_related_applications,false);
  for(const path of [manifest.id,manifest.start_url,manifest.scope,...manifest.shortcuts.map(x=>x.url)]){
    const url=new URL(path,origin);assert.equal(url.origin,origin);assert.ok(path.startsWith('/'));assert.ok(!path.startsWith('//'));
  }
  for(const icon of manifest.icons){
    const bytes=await readFile(new URL('../public'+icon.src,import.meta.url));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(icon.sizes,bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20));
  }
  assert.ok(manifest.icons.some(x=>x.sizes==='192x192'));assert.ok(manifest.icons.some(x=>x.sizes==='512x512'&&x.purpose.includes('maskable')));
});
test('service worker installs only anonymous public assets and removes only its own obsolete caches',async()=>{
  const f=workerFixture();f.stores.set('affimaro-public-old',new Map());f.stores.set('another-app',new Map());
  await f.lifecycle('install');assert.deepEqual(f.puts.map(x=>new URL(x).pathname).sort(),[...publicPaths].sort());
  assert.ok(f.calls.every(x=>x.options.credentials==='omit'&&x.options.redirect==='error'));
  await f.lifecycle('activate');assert.deepEqual(f.deleted,['affimaro-public-old']);assert.ok(f.stores.has('another-app'));assert.ok(f.state.claimed&&f.state.skipped);
});
test('private responses cannot enter the installation cache',async()=>{
  const f=workerFixture();f.state.privateAsset=true;
  await assert.rejects(f.lifecycle('install'),/Public installation assets are unavailable/);assert.equal(f.puts.length,0);assert.equal(f.state.skipped,false);
});
test('authenticated navigation stays on the network and offline shows only a public reconnect screen',async()=>{
  const f=workerFixture();await f.lifecycle('install');const writes=f.puts.length;
  const online=f.request('/workspace?tab=orders','GET','navigate');assert.equal(await (await online.result).text(),'PRIVATE_ACCOUNT_PAYMENT_DATA');
  assert.equal(f.calls.at(-1).request,online.input);assert.equal(f.calls.at(-1).options.cache,'no-store');
  f.state.offline=true;
  for(const path of ['/workspace','/payments','/auth/login','/auth/reset'])assert.equal(await (await f.request(path,'GET','navigate').result).text(),'PUBLIC_RECONNECT_SCREEN');
  assert.equal(f.puts.length,writes);
  for(const store of f.stores.values())for(const response of store.values())assert.ok(!(await response.clone().text()).includes('PRIVATE_ACCOUNT'));
});
test('API requests, form posts, external requests and cache-busting asset URLs pass through without interception',async()=>{
  const f=workerFixture();await f.lifecycle('install');const calls=f.calls.length;
  for(const [path,method,mode] of [['/api/payments','POST','same-origin'],['/auth/login','POST','navigate'],['/api/reports/export','GET','same-origin'],['https://other.example/offline.html','GET','navigate'],['/app-icons/icon-192.png?account=private','GET','same-origin']])assert.equal(f.request(path,method,mode).result,undefined);
  assert.equal(f.calls.length,calls);
});
test('offline navigation without installed assets fails closed with an uncacheable reconnect response',async()=>{
  const f=workerFixture();f.state.offline=true;const response=await f.request('/account','GET','navigate').result;
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'Reconnect to use Affimaro.');
});
test('the installation prompt is shown only after a user gesture and is consumed once',async()=>{
  const handlers=new Map(),buttonHandlers=new Map();let prompts=0,registration;
  const button={hidden:true,disabled:false,addEventListener:(name,fn)=>buttonHandlers.set(name,fn)},status={textContent:''};
  const window={isSecureContext:true,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener:(name,fn)=>handlers.set(name,fn)};
  const navigator={serviceWorker:{register:async(...args)=>{registration=args;}}};
  runInNewContext(installer,{window,navigator,document:{querySelector:selector=>selector==='[data-install-button]'?button:status}});
  let prevented=false;handlers.get('beforeinstallprompt')({preventDefault(){prevented=true;},prompt:async()=>{prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})});
  assert.ok(prevented);assert.equal(prompts,0);assert.equal(button.hidden,false);assert.equal(registration[0],'/service-worker.js');
  await buttonHandlers.get('click')();await buttonHandlers.get('click')();assert.equal(prompts,1);assert.equal(button.hidden,true);
  handlers.get('appinstalled')();assert.match(status.textContent,/Affimaro is installed/);
});
