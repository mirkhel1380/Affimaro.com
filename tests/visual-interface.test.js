import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {isValidElement,createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {countScale,dayTickIndexes} from '../lib/chart-geometry.mjs';
import {defaultPreferences} from '../lib/account-preferences.ts';
import {marketingPages,renderMarketingDocument} from '../lib/marketing-content.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'interface-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__interfaceHooks;});
const entry="export {ThemeControl} from './app/theme-control';export {PreferencesBridge} from './app/settings/preferences-bridge';export {CountTrend,CategoryBars} from './app/activity-chart';";
const options={stdin:{contents:entry,resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'};
const bundles=await Promise.all([build(options),build({...options,plugins:[{name:'interface-hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function useState(initial){const h=globalThis.__interfaceHooks,i=h.cursor++;if(!(i in h.states))h.states[i]=typeof initial==='function'?initial():initial;return [h.states[i],next=>{h.states[i]=typeof next==='function'?next(h.states[i]):next;}];}export function useEffect(fn){globalThis.__interfaceHooks.effects?.push(fn);}export function useRef(){return {current:null};}export function useId(){return 'fixture-id';}",loader:'js'}));}}]})]);
const modules=[];for(let i=0;i<bundles.length;i++){const path=join(temp,'views-'+i+'.mjs');writeFileSync(path,bundles[i].outputFiles[0].contents);modules.push(await import(pathToFileURL(path).href));}const [ssr,client]=modules;
function all(node,check,out=[]){if(Array.isArray(node)){for(const child of node)all(child,check,out);return out;}if(!isValidElement(node))return out;if(check(node))out.push(node);all(node.props.children,check,out);return out;}
function mount(component,props){const hooks={cursor:0,states:[],effects:[]};const render=()=>{globalThis.__interfaceHooks=hooks;hooks.cursor=0;return component(props);};render.hooks=hooks;return render;}
function browser(t){const prior=Object.fromEntries(['window','document','localStorage','matchMedia'].map(key=>[key,globalThis[key]])),values=new Map(),events=[],listeners=new Map();globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:e=>{events.push(e);listeners.get(e.type)?.(e);}};globalThis.document={documentElement:{dataset:{}}};globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};globalThis.matchMedia=()=>({matches:false});t.after(()=>{for(const [key,value] of Object.entries(prior))value===undefined?delete globalThis[key]:globalThis[key]=value;});return {values,events};}
const radio=(tree,value)=>all(tree,node=>node.type==='input'&&node.props.type==='radio'&&node.props.value===value)[0];

test('every public interior document has a real hero image while the homepage keeps its original hero',()=>{
 const sprite=readFileSync(join(root,'content/icon-sprite.html'),'utf8');for(const path of Object.keys(marketingPages)){const html=renderMarketingDocument(path,sprite);assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,path);if(path==='/'){assert.ok(!html.includes('m-interior-photo'));assert.ok(html.includes('partnership-collaboration.webp'));continue;}assert.ok(html.includes('m-interior-photo'),path);for(const [,asset] of html.matchAll(/src="(\/images\/page-[^"]+)"/g))assert.ok(existsSync(join(root,'public'+asset)),asset);}
});
test('chart scales and date ticks handle zero, single-day, large and narrow reports without duplicate labels',()=>{
 for(const maximum of [0,1,4,9,19,999,2000000]){const scale=countScale([0,maximum]);assert.ok(scale.ceiling>=maximum);assert.equal(scale.ticks[0],0);assert.equal(scale.ticks.at(-1),scale.ceiling);assert.ok(scale.ticks.every(value=>Number.isFinite(value)&&Number.isInteger(value)));}
 assert.deepEqual(dayTickIndexes(0,900),[]);assert.deepEqual(dayTickIndexes(1,300),[0]);for(const days of [2,7,30,90]){const ticks=dayTickIndexes(days,320);assert.equal(ticks.length,new Set(ticks).size);assert.equal(ticks[0],0);assert.equal(ticks.at(-1),days-1);assert.ok(ticks.length<=3);}
});
test('actual count charts keep precise per-series values, empty states and keyboard day selection',()=>{
 const dates=['2026-10-24','2026-10-25'],series=[{label:'All orders',values:[12,20]},{label:'Needs review',values:[1,3]}],render=mount(client.CountTrend,{dates,series,title:'Order activity',description:'Order counts, separate from currency amounts.'});let tree=render();const range=all(tree,node=>node.type==='input')[0];assert.match(range.props['aria-valuetext'],/All orders 20, Needs review 3/);range.props.onChange({target:{value:'0'}});tree=render();assert.match(all(tree,node=>node.type==='input')[0].props['aria-valuetext'],/All orders 12, Needs review 1/);
 for(const data of [[],['2026-10-25']]){const html=renderToStaticMarkup(createElement(ssr.CountTrend,{dates:data,series:[{label:'Clicks',values:data.map(()=>0)}],title:'Clicks',description:'Recorded events.'}));assert.ok(!/NaN|Infinity/.test(html));assert.match(html,/No activity recorded/);}
 const html=renderToStaticMarkup(createElement(ssr.CategoryBars,{rows:[{label:'Newsletter',value:3},{label:'Search',value:1}],total:4,unit:'clicks'}));assert.ok(html.includes('75%'));assert.ok(html.includes('width:75%'));assert.ok(html.includes('Newsletter: 3 clicks'));assert.ok(html.includes('tabindex="0"'));
});
test('owner themes save on their own device key without contacting account or financial services',async t=>{
 const f=browser(t);f.values.set('affimaro.appearance.v1',JSON.stringify({theme:'light'}));let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;assert.fail('Owner theme contacted a service');});const render=mount(client.ThemeControl,{owner:true});let tree=render();await radio(tree,'dark').props.onChange();tree=render();assert.equal(radio(tree,'dark').props.checked,true);assert.equal(JSON.parse(f.values.get('affimaro.owner.appearance.v1')).theme,'dark');assert.equal(JSON.parse(f.values.get('affimaro.appearance.v1')).theme,'light');assert.equal(document.documentElement.dataset.affimaroTheme,'dark');await radio(tree,'system').props.onChange();assert.equal(document.documentElement.dataset.affimaroTheme,'light');assert.equal(calls,0);
});
test('all four portal theme controls preserve other saved preferences and current revision',async t=>{
 const f=browser(t),requests=[];let portal='brand';const preferences={...defaultPreferences,pageSize:100,timeZone:'Asia/Kabul',campaignSource:'newsletter'};
 t.mock.method(globalThis,'fetch',async(url,init={})=>{assert.equal(url,'/api/account-settings');requests.push(init);return init.method==='POST'?Response.json({ok:true,data:{preferences:JSON.parse(init.body).data.preferences,revision:8}}):Response.json({ok:true,data:{portal,preferences,revision:7}});});
 for(portal of ['brand','affiliate','creator','agency']){const render=mount(client.ThemeControl,{portal});await radio(render(),'dark').props.onChange();const body=JSON.parse(requests.at(-1).body);assert.deepEqual(body,{action:'preferences',data:{preferences:{...preferences,theme:'dark'},revision:7}});assert.equal(JSON.parse(f.values.get('affimaro.appearance.v1')).theme,'dark');}
 assert.equal(requests.length,8);
});
test('theme save failures restore the prior theme and never post another role’s settings',async t=>{
 const f=browser(t);f.values.set('affimaro.appearance.v1',JSON.stringify({theme:'light'}));let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({ok:true,data:{portal:'creator',preferences:defaultPreferences,revision:1}});});const render=mount(client.ThemeControl,{portal:'brand'});await radio(render(),'dark').props.onChange();assert.equal(calls,1);assert.equal(JSON.parse(f.values.get('affimaro.appearance.v1')).theme,'light');assert.ok(all(render(),node=>node.props.role==='alert').length);
});
test('preview theme choices stay local and retain the rest of the sample settings',async t=>{
 const f=browser(t);f.values.set('affimaro.preview.settings.v1.creator',JSON.stringify({portal:'creator',name:'Sample creator',revision:3,preferences:{...defaultPreferences,pageSize:50}}));t.mock.method(globalThis,'fetch',async()=>assert.fail('Preview theme contacted a real API'));const render=mount(client.ThemeControl,{portal:'creator',previewMode:true});await radio(render(),'dark').props.onChange();const saved=JSON.parse(f.values.get('affimaro.preview.settings.v1.creator'));assert.equal(saved.name,'Sample creator');assert.equal(saved.preferences.pageSize,50);assert.equal(saved.preferences.theme,'dark');assert.equal(saved.revision,4);
});
test('owner bootstrap follows device changes and stays isolated from customer appearance changes',()=>{
 const values={'affimaro.appearance.v1':JSON.stringify({theme:'light'}),'affimaro.owner.appearance.v1':JSON.stringify({theme:'system'})},root={dataset:{}},listeners={},device={matches:false,addEventListener(_type,fn){this.change=fn;}};
 runInNewContext(readFileSync(join(rootDir(),'public/portal-theme.js'),'utf8'),{location:{hostname:'admin.affimaro.com',pathname:'/owner'},document:{documentElement:root},localStorage:{getItem:key=>values[key]},matchMedia:()=>device,addEventListener:(name,fn)=>listeners[name]=fn});assert.equal(root.dataset.affimaroTheme,'light');device.matches=true;device.change();assert.equal(root.dataset.affimaroTheme,'dark');assert.equal(root.dataset.affimaroThemeChoice,'system');values['affimaro.appearance.v1']=JSON.stringify({theme:'light'});listeners.storage({key:'affimaro.appearance.v1'});assert.equal(root.dataset.affimaroTheme,'dark');values['affimaro.owner.appearance.v1']=JSON.stringify({theme:'light'});listeners.storage({key:'affimaro.owner.appearance.v1'});assert.equal(root.dataset.affimaroTheme,'light');
});
test('a slow initial settings read cannot overwrite a theme saved from the header',async t=>{
 browser(t);let finish;t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{finish=resolve;}));const render=mount(client.PreferencesBridge,{portal:'brand',previewMode:false});render();const cleanup=render.hooks.effects[0]();
 const preferences={...defaultPreferences,theme:'dark'};window.dispatchEvent(new CustomEvent('affimaro:preferences',{detail:{preferences,revision:9}}));finish(Response.json({ok:true,data:{portal:'brand',preferences:defaultPreferences,revision:8,name:'Brand owner',pendingApplications:3,pendingInvitations:2}}));
 for(let i=0;i<100&&!render.hooks.states[0];i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(render.hooks.states[0].revision,9);assert.equal(render.hooks.states[0].preferences.theme,'dark');assert.equal(render.hooks.states[0].pendingApplications,3);assert.equal(document.documentElement.dataset.affimaroTheme,'dark');cleanup();
});
function rootDir(){return fileURLToPath(new URL('../',import.meta.url));}
