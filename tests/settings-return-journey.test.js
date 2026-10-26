import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {accountIdFor} from '../lib/account-id.ts';
import {memberProfile} from '../lib/member-profile.ts';
import {syntheticJpeg} from './support/identity-photos.js';
import {accountSettings} from '../lib/account-settings.ts';
import {defaultPreferences,settingsPath} from '../lib/account-preferences.ts';
import {portalHome} from '../lib/portal-policy.ts';
import {emailAuth,SESSION_COOKIE} from '../self-hosted/auth-core.ts';
import {authPage} from '../self-hosted/auth-pages.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'settings-return-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__settingsReturnDb;delete globalThis.__settingsReturnUser;delete globalThis.__settingsHooks;});
const bundle=await build({stdin:{contents:"export {default as BrandOverview} from './app/workspace/page';export {default as AffiliateOverview} from './app/partner/page';export {default as CreatorOverview} from './app/creator/page';export {default as AgencyOverview} from './app/agency/page';export {default as GenericSettings} from './app/settings/page';export {default as BrandSettings} from './app/workspace/settings/page';export {default as AffiliateSettings} from './app/partner/settings/page';export {default as CreatorSettings} from './app/creator/settings/page';export {default as AgencySettings} from './app/agency/settings/page';export {SettingsPanel} from './app/settings/settings-panel';export {POST as SettingsPOST} from './app/api/account-settings/route';export {GET as AvatarGET,POST as AvatarPOST} from './app/api/account-avatar/route';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'settings-return-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__settingsReturnDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__settingsReturnUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const serverFile=join(temp,'server.mjs');writeFileSync(serverFile,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(serverFile).href);
const clientBundle=await build({stdin:{contents:"export {SettingsPanel} from './app/settings/settings-panel';export {UserProfileSettings} from './app/settings/user-profile';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',plugins:[{name:'controlled-settings-hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'client-fixture'}));b.onLoad({filter:/.*/,namespace:'client-fixture'},()=>({contents:"export function useState(initial){const h=globalThis.__settingsHooks,index=h.cursor++;if(!(index in h.states))h.states[index]=typeof initial==='function'?initial():initial;return [h.states[index],next=>{h.states[index]=typeof next==='function'?next(h.states[index]):next;}];}export function useEffect(){}",loader:'js'}));}}]});
const clientFile=join(temp,'client.mjs');writeFileSync(clientFile,clientBundle.outputFiles[0].contents);const client=await import(pathToFileURL(clientFile).href);

const origin='https://affimaro.example',roles=['brand','agency','affiliate','creator'],tabs=['overview','finance','connections','profile','appearance','reports','notifications','privacy','security','tools','data'];
const entries={generic:views.GenericSettings,brand:views.BrandSettings,agency:views.AgencySettings,affiliate:views.AffiliateSettings,creator:views.CreatorSettings};
const set=(db,user=null)=>{globalThis.__settingsReturnDb=db;globalThis.__settingsReturnUser=user;};
const queryOf=url=>Object.fromEntries(new URL(url,origin).searchParams);
const page=(role,query)=>entries[role]({searchParams:Promise.resolve(query)});
const noDb={prepare(){throw new Error('Anonymous settings touched private data before sign-in');}};
async function redirected(run){try{await run();assert.fail('Expected protected settings to redirect');}catch(error){if(typeof error.location==='string')return error.location;throw error;}}
function assertTarget(location,path,query,login){const url=new URL(location,origin);assert.equal(url.pathname,login);const target=url.searchParams.get('return_to');assert.ok(target);assert.equal(new URL(target,origin).pathname,path);assert.deepEqual(queryOf(target),query);return target;}
const textOf=node=>node==null||typeof node==='boolean'?'':typeof node==='object'?[node.props?.children].flat(Infinity).map(textOf).join(''):String(node);
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
function panelHarness(t,initial,initialTab='reports',options={}){
 const saved=new Map(),events=[],locations=[],globals={window:{dispatchEvent:e=>events.push(e)},document:{documentElement:{dataset:{}}},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},matchMedia:()=>({matches:false}),history:{replaceState:(_state,_unused,url)=>locations.push(url)},location:{pathname:settingsPath(initial.portal)}};
 for(const [key,value] of Object.entries(globals)){const previous=globalThis[key];globalThis[key]=value;t.after(()=>{if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;});}
 const hooks={states:[],cursor:0};globalThis.__settingsHooks=hooks;let tree;
 const render=()=>{hooks.cursor=0;tree=initialTab==='profile'?client.UserProfileSettings({data:initial,onSaved(){},...options}):client.SettingsPanel({initial,initialTab,...options});return tree;};
 const control=(type,label)=>{const node=find(tree,n=>n.type===type&&textOf(n)===label);assert.ok(node,type+' '+label+' is present');return node;};
 const field=label=>{const node=find(tree,n=>n.type==='label'&&textOf(n.props.children[0])===label);assert.ok(node,'Field '+label+' is present');const input=find(node,n=>['input','select'].includes(n.type));assert.ok(input);return input;};
 const click=async label=>{await control('button',label).props.onClick();render();};
 render();return {render,control,field,click,events,locations,find:predicate=>find(tree,predicate),text:()=>textOf(tree)};
}
function connectSettings(t,db,user){set(db,user);const requests=[];t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,'/api/account-settings');assert.equal(init.credentials,'same-origin');const body=JSON.parse(init.body);requests.push(body);return views.SettingsPOST(new Request(origin+url,{...init,headers:{...init.headers,Origin:origin}}));});return requests;}

test('generic and all four role settings entries preserve every known section before sign-in',async()=>{
 set(noDb);for(const role of ['generic',...roles])for(const tab of tabs)assertTarget(await redirected(()=>page(role,{tab})),role==='generic'?'/settings':settingsPath(role),{tab},role==='generic'?'/auth/login':'/auth/'+role+'/login');
});

test('unknown, repeated and control-character settings tabs fall back to Account settings without forwarding other query fields',async t=>{
 set(noDb);for(const tab of [undefined,'','not-a-section',['security','data'],'security\n','security?return_to=https://foreign.example'])for(const role of ['generic',...roles]){
  const target=assertTarget(await redirected(()=>page(role,{tab,return_to:'https://foreign.example',token:'PRIVATE_QUERY_MARKER'})),role==='generic'?'/settings':settingsPath(role),{},role==='generic'?'/auth/login':'/auth/'+role+'/login');assert.ok(!target.includes('PRIVATE_QUERY_MARKER'));
 }
 const f=await partnerFixture(t);for(const role of roles){set(f.db,f[role]);const html=renderToStaticMarkup(await page(role,{tab:['security','data']}));assert.ok(html.includes('aria-pressed="true">Account settings</button>'));assert.ok(html.includes('Your member account and access.'));}
});

test('actual settings routes retain role, pending-profile, closed-account and owner guards',async t=>{
 const f=await partnerFixture(t);for(const role of roles){set(f.db,f[role]);const wrong=role==='brand'?'affiliate':'brand';assert.equal(await redirected(()=>page(wrong,{tab:'data'})),portalHome(role));}
 set(f.db,f.operator);for(const role of ['generic',...roles])assert.equal(await redirected(()=>page(role,{tab:'security'})),'/owner');
 f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.affiliate.userId);set(f.db,f.affiliate);assertTarget(await redirected(()=>page('affiliate',{tab:'privacy'})),settingsPath('affiliate'),{tab:'privacy'},'/application');assertTarget(await redirected(()=>page('generic',{tab:'data'})),'/settings',{tab:'data'},'/application');
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.creator.userId,new Date().toISOString());set(f.db,f.creator);for(const role of ['creator','generic'])assert.equal(await redirected(()=>page(role,{tab:'security'})),'/account-closed');
});

test('each approved account renders its requested settings section without writes or cross-account data',async t=>{
 const f=await partnerFixture(t),titles={privacy:'Discovery &amp; privacy',security:'Sign-in security',data:'Your account data'};
 for(const role of roles){set(f.db,f[role]);for(const entry of [role,'generic'])for(const [tab,title] of Object.entries(titles)){const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,html=renderToStaticMarkup(await page(entry,{tab}));assert.ok(html.includes(title));assert.ok(html.includes(f[role].email));assert.ok(!html.includes(f.foreignBrand.email));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);}}
});

test('Change password from every actual Security panel returns through verified recovery, reset and login to Security',async t=>{
 const f=await partnerFixture(t),password='Long settings fixture password 123!',cookie=value=>value.split(';')[0];
 for(const role of roles){
  const user=f[role],providerId=crypto.randomUUID(),target=settingsPath(role)+'?tab=security';f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(providerId,user.userId,new Date().toISOString());
  set(f.db,user);const html=renderToStaticMarkup(await page(role,{tab:'security'})),link=html.match(/href="([^"]+)"[^>]*>Change password<\/a>/)?.[1];assert.ok(link);assert.equal(new URL(link,origin).pathname,'/auth/'+role+'/recover');assert.equal(new URL(link,origin).searchParams.get('return_to'),target);
  const config={origin,supabaseUrl:'https://settings-fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'ae'.repeat(32)},providerUser={id:providerId,email:user.email,email_confirmed_at:new Date().toISOString()},calls=[];
  const auth=emailAuth(f.db,config,async(url,init)=>{assert.equal(new URL(url).origin,config.supabaseUrl);assert.equal(init.redirect,'manual');const path=new URL(url).pathname;calls.push({path,method:init.method});if(path==='/auth/v1/settings')return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:false});if(path==='/auth/v1/recover')return Response.json({});if(path==='/auth/v1/logout')return new Response(null,{status:204});if(path==='/auth/v1/user')return Response.json(providerUser);assert.ok(['/auth/v1/verify','/auth/v1/token'].includes(path));return Response.json({access_token:'FIXTURE_ACCESS_TOKEN_12345678901234567890',refresh_token:'FIXTURE_REFRESH_TOKEN_12345678901234567890',expires_in:3600,token_type:'bearer',user:providerUser});});
  const request=(path,cookies='',body)=>new Request(origin+path,body?{method:'POST',headers:{Origin:origin,Cookie:cookies,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}:{headers:{Cookie:cookies}}),post=(kind,flow,cookies,body)=>authPage(request('/auth/'+role+'/'+kind,cookies,{nonce:flow.nonce,...body}),auth,origin);
  const start=await authPage(request(link),auth,origin),startCookie=cookie(start.headers.getSetCookie()[0]),flow=await auth.flow(request('/',startCookie));assert.equal(flow.returnTo,target);
  let result=await post('recover',flow,startCookie,{email:user.email});const verifyCookie=cookie(result.headers.getSetCookie()[0]),verifyFlow=await auth.flow(request('/',verifyCookie));assert.equal(verifyFlow.returnTo,target);
  result=await post('verify',verifyFlow,verifyCookie,{code:'123456'});assert.equal(result.headers.get('Location'),'/auth/'+role+'/reset');const recoveryCookie=cookie(result.headers.getSetCookie()[0]),contextCookie=cookie(result.headers.getSetCookie()[1]);assert.equal(await auth.resolve(request(target,recoveryCookie)),null);
  const reset=await authPage(request('/auth/'+role+'/reset?return_to=%2Fsettings',recoveryCookie+'; '+contextCookie),auth,origin);assert.equal(reset.status,200);const resetCookie=cookie(reset.headers.getSetCookie()[0]),resetFlow=await auth.flow(request('/',resetCookie));assert.equal(resetFlow.returnTo,target);
  result=await post('reset',resetFlow,recoveryCookie+'; '+resetCookie,{password});assert.equal(result.status,303);assert.equal(new URL(result.headers.get('Location'),origin).searchParams.get('return_to'),target);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM auth_sessions WHERE user_id=?').get(user.userId).n,0);
  const login=await authPage(request(result.headers.get('Location')),auth,origin),loginCookie=cookie(login.headers.getSetCookie()[0]),loginFlow=await auth.flow(request('/',loginCookie));result=await post('login',loginFlow,loginCookie,{email:user.email,password});assert.equal(result.headers.get('Location'),target);const signedCookie=cookie(result.headers.getSetCookie().find(c=>c.startsWith(SESSION_COOKIE+'='))),resolved=await auth.resolve(request(target,signedCookie));assert.equal(resolved.userId,user.userId);set(f.db,resolved);assert.ok(renderToStaticMarkup(await page(role,{tab:'security'})).includes('Sign-in security'));assert.equal(calls.filter(c=>c.method==='PUT'&&c.path==='/auth/v1/user').length,1);
 }
 for(const table of ['billing_accounts','billing_checkouts','payment_connections','payout_requests'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});

test('discarding invalid preferences restores the saved value and clears the obsolete error',async t=>{
 const f=await partnerFixture(t),initial=await accountSettings(f.db,f.affiliate).snapshot(),requests=connectSettings(t,f.db,f.affiliate),ui=panelHarness(t,initial);
 ui.field('Report & activity time zone').props.onChange({target:{value:'not/a/zone'}});ui.render();await ui.click('Save preferences');assert.ok(ui.text().includes('Choose a valid time zone.'));assert.equal(requests.length,0);
 await ui.click('Discard changes');assert.equal(ui.field('Report & activity time zone').props.value,initial.preferences.timeZone);assert.ok(ui.text().includes('Unsaved changes discarded.'));assert.equal(ui.find(n=>n.props?.role==='alert'),null);
});

test('actual preference saves advance revisions and Discard restores the last successful save',async t=>{
 const f=await partnerFixture(t),api=accountSettings(f.db,f.creator),initial=await api.snapshot(),requests=connectSettings(t,f.db,f.creator),ui=panelHarness(t,initial);
 ui.field('Report & activity time zone').props.onChange({target:{value:'Asia/Kabul'}});ui.render();await ui.click('Save preferences');assert.ok(ui.text().includes('Preferences saved to your account.'));assert.equal((await api.snapshot()).preferences.timeZone,'Asia/Kabul');
 ui.field('Report & activity time zone').props.onChange({target:{value:'Europe/London'}});ui.render();await ui.click('Save preferences');assert.deepEqual(requests.map(r=>r.data.revision),[0,1]);assert.equal((await api.snapshot()).revision,2);
 ui.field('Report & activity time zone').props.onChange({target:{value:'America/New_York'}});ui.render();await ui.click('Discard changes');assert.equal(ui.field('Report & activity time zone').props.value,'Europe/London');assert.equal((await api.snapshot()).preferences.timeZone,'Europe/London');assert.equal(ui.events.filter(e=>e.type==='affimaro:preferences').length,2);
});

test('a stale settings save leaves the newer account preferences intact and reports the server error',async t=>{
 const f=await partnerFixture(t),api=accountSettings(f.db,f.brand),initial=await api.snapshot();await api.savePreferences({revision:0,preferences:{...defaultPreferences,timeZone:'Asia/Kabul'}});const requests=connectSettings(t,f.db,f.brand),ui=panelHarness(t,initial);
 ui.field('Report & activity time zone').props.onChange({target:{value:'Europe/London'}});ui.render();await ui.click('Save preferences');assert.ok(ui.text().includes('Your preferences changed in another tab. Reload this page before saving.'));assert.equal((await api.snapshot()).preferences.timeZone,'Asia/Kabul');assert.equal(requests.length,1);assert.equal(ui.events.filter(e=>e.type==='affimaro:preferences').length,0);assert.equal(ui.control('button','Save preferences').props.disabled,false);
});

test('successful profile save shows the normalized account name in the actual controlled input',async t=>{
 const f=await partnerFixture(t),initial=await accountSettings(f.db,f.affiliate).snapshot(),requests=connectSettings(t,f.db,f.affiliate),ui=panelHarness(t,initial,'profile');ui.field('Display name').props.onChange({target:{value:'  Updated member  '}});ui.render();const form=ui.find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));ui.render();assert.equal(requests[0].data.name,'Updated member');assert.equal((await accountSettings(f.db,f.affiliate).snapshot()).name,'Updated member');assert.equal(ui.field('Display name').props.value,'Updated member');assert.ok(ui.text().includes('Your user profile has been saved.'));
});


test('own avatar route enforces authentication, same-origin writes, bounded bodies and a private non-targetable photo response',async t=>{
 const f=await partnerFixture(t),request=(path,body,source=origin)=>new Request(origin+path,body===undefined?{}:{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)}),image=Buffer.from(syntheticJpeg()).toString('base64');
 set(noDb);assert.equal((await views.AvatarGET(request('/api/account-avatar'))).status,401);
 set(f.db,f.affiliate);assert.equal((await views.AvatarPOST(request('/api/account-avatar',{revision:0,image},'https://foreign.example'))).status,403);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM member_profiles').get().n,0);
 assert.equal((await views.AvatarPOST(request('/api/account-avatar',{revision:0,image}))).status,200);const response=await views.AvatarGET(request('/api/account-avatar?v=1'));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('vary'),'Cookie');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(new Uint8Array(await response.arrayBuffer()).length,(await memberProfile(f.db,f.affiliate).avatar()).length);
 for(const path of ['/api/account-avatar?userId=creator','/api/account-avatar?v=1&v=2','/api/account-avatar?v=-1'])assert.equal((await views.AvatarGET(request(path))).status,400);
 assert.equal((await views.AvatarPOST(request('/api/account-avatar',{revision:1,image:'A'.repeat(65000)}))).status,413);assert.equal((await memberProfile(f.db,f.affiliate).snapshot()).revision,1);set(f.db,f.creator);assert.equal((await views.AvatarGET(request('/api/account-avatar?v=1'))).status,404);set(f.db,f.operator);assert.equal((await views.AvatarGET(request('/api/account-avatar'))).status,403);
});


test('all four actual portal homes render the compact scoped overview with unique navigation IDs and their own tools',async t=>{
 const f=await partnerFixture(t),homes={brand:views.BrandOverview,affiliate:views.AffiliateOverview,creator:views.CreatorOverview,agency:views.AgencyOverview};for(const role of roles){set(f.db,f[role]);const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,html=renderToStaticMarkup(await homes[role]({searchParams:Promise.resolve({days:'7'})}));assert.ok(html.includes('Performance overview'));assert.ok(html.includes('Last 7 days'));assert.ok(html.includes('Estimated commission'));assert.ok(html.includes('Find a page'));assert.ok(html.includes('Current partnership status'));assert.ok(!html.includes(f.foreignBrand.email));const ids=[...html.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);if(['brand','agency'].includes(role)){assert.ok(html.includes('Partner payments'));assert.ok(!html.includes('href="/'+(role==='brand'?'partner':'creator')+'/identity"'));}else{assert.ok(html.includes('Verify your identity'));assert.ok(!html.includes('Package &amp; billing'));}if(role==='creator')assert.ok(html.includes('Content planner'));if(role==='agency')assert.ok(html.includes('Client directory'));}
});


test('each role sees its own assigned account ID in the real profile page and account menu',async t=>{
 const f=await partnerFixture(t);for(const role of roles){set(f.db,f[role]);const id=await accountIdFor(f.db,f[role].userId),html=renderToStaticMarkup(await page(role,{tab:'profile'}));assert.ok(html.includes('Account ID: '+id));assert.ok(html.includes('Your permanent Affimaro account reference.'));assert.ok(html.includes('cannot be edited'));assert.ok(!html.includes(await accountIdFor(f.db,f.foreignBrand.userId)));}
});
