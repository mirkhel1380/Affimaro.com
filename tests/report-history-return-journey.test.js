import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {seedOrder,agencyPair} from './support/order-history.js';
import {seedPayout} from './support/payment-history.js';
import {ordersPath,paymentHistoryPath,commissionReviewPath,portalHome,portalView} from '../lib/portal-policy.ts';
import {emailAuth,SESSION_COOKIE} from '../self-hosted/auth-core.ts';
import {authPage} from '../self-hosted/auth-pages.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'report-history-return-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__reportHistoryReturnDb;delete globalThis.__reportHistoryReturnUser;});
const bundle=await build({stdin:{contents:"export {OrdersView} from './app/orders-view';export {ClicksView} from './app/clicks-view';export {PaymentHistoryView} from './app/payment-history-view';export {CommissionReviewView} from './app/commission-review-view';export {default as ReportsPage} from './app/reports/page';export {default as AgencyReportsPage} from './app/agency/reports/page';export {default as CreatorReportsPage} from './app/creator/reports/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'report-history-return-host',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__reportHistoryReturnDb:undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__reportHistoryReturnUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const file=join(temp,'views.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);
const origin='https://affimaro.example',roles=['brand','agency','affiliate','creator'],selection='11111111-1111-4111-8111-111111111111';
const set=(db,user=null)=>{globalThis.__reportHistoryReturnDb=db;globalThis.__reportHistoryReturnUser=user;};
const noDb={prepare(){throw new Error('Anonymous report touched private data before sign-in');}};
const queryOf=url=>Object.fromEntries(new URL(url,origin).searchParams);
async function redirected(run){try{await run();assert.fail('Expected a protected page redirect');}catch(error){if(typeof error.location==='string')return error.location;throw error;}}
function assertTarget(location,path,query,login){const url=new URL(location,origin);assert.equal(url.pathname,login);const target=url.searchParams.get('return_to');assert.ok(target);assert.equal(new URL(target,origin).pathname,path);assert.deepEqual(queryOf(target),query);return target;}
const run=(view,portal,query)=>views[view]({portal,searchParams:Promise.resolve(query)});
const report=(view,query={})=>views.ReportsPage({searchParams:Promise.resolve({...query,...(view?{view}:{})})});
const routeReport=(portal,query)=>views[portal==='agency'?'AgencyReportsPage':'CreatorReportsPage']({searchParams:Promise.resolve(query)});
const cases=[
 ['OrdersView',ordersPath,{q:'Order & partner',state:'review',currency:'USD',range:'90d',page:'3'}],
 ['ClicksView',p=>portalHome(p)+'/clicks',{application:selection,days:'90',page:'3',q:'newsletter & source',country:'US',device:'Mobile'}],
 ['PaymentHistoryView',paymentHistoryPath,{request:selection,q:'Request & partner',status:'partly_reversed',method:'stripe',currency:'USD',range:'90d',page:'3'}],
 ['CommissionReviewView',commissionReviewPath,{order:selection,q:'Order & partner',state:'source_review',currency:'USD',range:'90d',page:'3'}],
];

for(const [view,path,query] of cases)test('anonymous '+view+' retains its filters and selection in every supported role',async()=>{
 set(noDb);for(const role of view==='CommissionReviewView'?['brand','agency']:roles)assertTarget(await redirected(()=>run(view,role,query)),path(role),query,'/auth/'+role+'/login');
});

test('generic reports retain the canonical view, selected partnership and custom dates for every role',async()=>{
 set(noDb);const query={applicationId:selection,range:'custom',from:'2026-09-01',to:'2026-10-01'};
 for(const [view,portal] of [['business','brand'],['merchant','brand'],['affiliate','affiliate'],['partner','affiliate'],['agency','agency'],['creator','creator']])assertTarget(await redirected(()=>report(view,query)),'/reports',{view:portalView(portal),...query},'/auth/'+portal+'/login');
 assertTarget(await redirected(()=>report(undefined,query)),'/reports',query,'/auth/login');
});

test('agency and creator report entry pages retain dates and partnership before their own login guard',async()=>{
 set(noDb);const query={applicationId:selection,range:'custom',from:'2026-09-01',to:'2026-10-01'};
 for(const role of ['agency','creator'])assertTarget(await redirected(()=>routeReport(role,{...query,view:role==='agency'?'creator':'agency'})),portalHome(role)+'/reports',query,'/auth/'+role+'/login');
});

test('actual return destinations omit arrays, controls and authority fields while keeping priority selections inside 500 characters',async()=>{
 set(noDb);for(const [view,path,query] of cases){
  const clean={...query,q:['first','second']},input={...clean,return_to:'https://foreign.example/steal',workspaceId:'PRIVATE_AUTHORITY',userId:'PRIVATE_AUTHORITY',view:'creator',owner:'true',token:'PRIVATE_QUERY_MARKER'};delete clean.q;
  const location=await redirected(()=>run(view,'brand',input));assertTarget(location,path('brand'),clean,'/auth/brand/login');assert.ok(!location.includes('PRIVATE_'));assert.ok(!location.includes('foreign.example'));
  const controls=await redirected(()=>run(view,'brand',{...query,q:'name\nheader'})),withoutQ={...query};delete withoutQ.q;assertTarget(controls,path('brand'),withoutQ,'/auth/brand/login');
  const largeTarget=new URL(await redirected(()=>run(view,'brand',{...query,q:'برند'.repeat(30)})),origin).searchParams.get('return_to');assert.ok(largeTarget.length<=500);const large=queryOf(largeTarget);for(const key of Object.keys(query).filter(k=>k!=='q'))assert.equal(large[key],query[key]);
 }
 assertTarget(await redirected(()=>report(['business','affiliate'],{applicationId:[selection],range:'custom',from:'2026-09-01',to:'2026-10-01',token:'PRIVATE_QUERY_MARKER'})),'/reports',{range:'custom',from:'2026-09-01',to:'2026-10-01'},'/auth/login');
});

test('report and history filters do not bypass saved portal or generic report family guards',async t=>{
 const f=await partnerFixture(t);
 for(const [view,,query] of cases)for(const role of view==='CommissionReviewView'?['brand','agency']:roles){set(f.db,f[role]);const wrong=role==='brand'?'agency':'brand';assert.equal(await redirected(()=>run(view,wrong,{...query,view:wrong,portal:wrong})),portalHome(role));}
 for(const role of roles){set(f.db,f[role]);assert.equal(await redirected(()=>report(['brand','agency'].includes(role)?'affiliate':'business',{range:'custom',from:'2026-09-01',to:'2026-10-01'})),'/reports?view='+portalView(role));}
 set(f.db,f.brand);assert.equal(await redirected(()=>routeReport('agency',{})),'/workspace');set(f.db,f.affiliate);assert.equal(await redirected(()=>routeReport('creator',{})),'/partner');
});

test('owner, closed-account and pending-application guards still protect every changed view',async t=>{
 const f=await partnerFixture(t),query={applicationId:selection,range:'custom',from:'2026-09-01',to:'2026-10-01'},entries=[...cases.map(([view,path,q])=>[()=>run(view,'brand',q),path('brand'),q]),[()=>report('business',query),'/reports',{view:'business',...query}],[()=>routeReport('agency',query),'/agency/reports',query],[()=>routeReport('creator',query),'/creator/reports',query]];
 set(f.db,f.operator);for(const [page] of entries)assert.equal(await redirected(page),'/owner');
 f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.brand.userId);set(f.db,f.brand);for(const [page,path,q] of entries)assertTarget(await redirected(page),path,q,'/application');
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.brand.userId,new Date().toISOString());for(const [page] of entries)assert.equal(await redirected(page),'/account-closed');
});

test('authenticated views keep duplicate-filter errors and foreign-record protection after return-path changes',async t=>{
 const f=await partnerFixture(t),order=seedOrder(f),request=seedPayout(f),pair=await agencyPair(f),foreignOrder=seedOrder(f,pair.application,pair.store);
 set(f.db,f.brand);for(const [view] of cases){const html=renderToStaticMarkup(await run(view,'brand',{page:['1','2']}));assert.match(html,/Check your (?:order|report|payment history|commission review) filters/);}
 const ownPayment=renderToStaticMarkup(await run('PaymentHistoryView','brand',{request:request.id}));assert.ok(ownPayment.includes('Selected payment request'));
 const ownCommission=renderToStaticMarkup(await run('CommissionReviewView','brand',{order:order.id}));assert.ok(ownCommission.includes('Selected order commission'));
 const commission=renderToStaticMarkup(await run('CommissionReviewView','brand',{order:foreignOrder.id}));assert.ok(commission.includes('Order not found in your business commission queue'));assert.ok(!commission.includes('Selected order commission'));
 set(f.db,f.creator);const payment=renderToStaticMarkup(await run('PaymentHistoryView','creator',{request:request.id}));assert.ok(payment.includes('Payment request not found in your portal'));assert.ok(!payment.includes('Selected payment request'));
 set(f.db,f.affiliate);const clicks=renderToStaticMarkup(await run('ClicksView','affiliate',{application:pair.application.id}));assert.ok(clicks.includes('Check your report filters'));
 const reports=renderToStaticMarkup(await report('affiliate',{applicationId:pair.application.id}));assert.ok(reports.includes('That partnership is not available in this report'));assert.ok(!reports.includes('Current commission balances'));
});

test('returning to saved selections reads unchanged financial records without provider calls or exposed destinations',async t=>{
 const f=await partnerFixture(t),order=seedOrder(f),request=seedPayout(f,undefined,undefined,undefined,{method:'stripe',status:'processing'}),pair=await agencyPair(f);seedOrder(f,pair.application,pair.store);
 const calls=[];t.mock.method(globalThis,'fetch',async(...args)=>{calls.push(args);throw new Error('Unexpected external provider action');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 set(f.db,f.brand);for(const page of [()=>run('OrdersView','brand',{q:order.external,state:'accrued',currency:'USD'}),()=>run('ClicksView','brand',{application:f.application.id,days:'90',country:'US',device:'Mobile'}),()=>run('PaymentHistoryView','brand',{request:request.id,status:'cancelled'}),()=>run('CommissionReviewView','brand',{order:order.id,state:'approved'}),()=>report('business',{applicationId:f.application.id,range:'custom',from:'2026-09-01',to:'2026-10-24'})]){const html=renderToStaticMarkup(await page());assert.ok(!html.includes('PRIVATE_'));assert.ok(!html.includes(f.connected.key));}
 for(const role of ['agency','creator']){set(f.db,f[role]);assert.ok(renderToStaticMarkup(await routeReport(role,{applicationId:pair.application.id,range:'90d'})).includes('Current commission balances'));}
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(f.db.sqlite.prepare('SELECT status FROM payout_requests WHERE id=?').get(request.id).status,'processing');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM commission_approvals').get().n,0);assert.equal(calls.length,0);
});

test('mocked password login reconnects actual protected links to the selected payment, order and dated report',async t=>{
 const f=await partnerFixture(t),order=seedOrder(f),payout=seedPayout(f,undefined,undefined,undefined,{status:'processing',method:'stripe'}),pair=await agencyPair(f);seedOrder(f,pair.application,pair.store);
 const entries=[
  {role:'affiliate',path:paymentHistoryPath('affiliate'),query:{request:payout.id,status:'cancelled',method:'stripe',currency:'USD',range:'90d',page:'2'},page:q=>run('PaymentHistoryView','affiliate',q),text:'Selected payment request'},
  {role:'brand',path:commissionReviewPath('brand'),query:{order:order.id,state:'approved',currency:'USD',range:'90d',page:'2'},page:q=>run('CommissionReviewView','brand',q),text:'Selected order commission'},
  {role:'agency',path:'/agency/reports',query:{applicationId:pair.application.id,range:'custom',from:'2026-09-01',to:'2026-10-24'},page:q=>routeReport('agency',q),text:'Current commission balances'},
 ];
 for(const entry of entries){
  set(noDb);const target=assertTarget(await redirected(()=>entry.page(entry.query)),entry.path,entry.query,'/auth/'+entry.role+'/login'),user=f[entry.role],providerId=crypto.randomUUID();f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(providerId,user.userId,new Date().toISOString());
  const config={origin,supabaseUrl:'https://report-history-fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'bc'.repeat(32)},providerUser={id:providerId,email:user.email,email_confirmed_at:new Date().toISOString()},calls=[];
  const auth=emailAuth(f.db,config,async(url,init)=>{assert.equal(new URL(url).origin,config.supabaseUrl);assert.equal(init.redirect,'manual');const path=new URL(url).pathname;calls.push(path);if(path==='/auth/v1/settings')return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:false});if(path==='/auth/v1/token')return Response.json({access_token:'FIXTURE_ACCESS_TOKEN_12345678901234567890',refresh_token:'FIXTURE_REFRESH_TOKEN_12345678901234567890',expires_in:3600,token_type:'bearer',user:providerUser});assert.equal(path,'/auth/v1/user');return Response.json(providerUser);});
  const request=(path,cookie='',body)=>new Request(origin+path,body?{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)}:{headers:{Cookie:cookie}}),page=await authPage(request('/auth/'+entry.role+'/login?'+new URLSearchParams({return_to:target})),auth,origin),cookie=page.headers.getSetCookie()[0].split(';')[0],flow=await auth.flow(request('/',cookie));assert.equal(page.status,200);assert.equal(flow.returnTo,target);
  const result=await authPage(request('/auth/'+entry.role+'/login?return_to=https%3A%2F%2Fforeign.example',cookie,{nonce:flow.nonce,email:user.email,password:'Fixture password 123456!'}),auth,origin);assert.equal(result.status,303);assert.equal(result.headers.get('Location'),target);assert.deepEqual(calls,['/auth/v1/settings','/auth/v1/settings','/auth/v1/token','/auth/v1/user']);
  const session=result.headers.getSetCookie().find(c=>c.startsWith(SESSION_COOKIE+'='));assert.ok(session);const resolved=await auth.resolve(request(target,session.split(';')[0]));assert.equal(resolved.userId,user.userId);assert.deepEqual(calls,['/auth/v1/settings','/auth/v1/settings','/auth/v1/token','/auth/v1/user','/auth/v1/user']);set(f.db,resolved);
  const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,html=renderToStaticMarkup(await entry.page(queryOf(target)));assert.ok(html.includes(entry.text));if(entry.role!=='agency')assert.ok(html.includes('outside the current filters'));else for(const date of ['2026-09-01','2026-10-24'])assert.ok(html.includes(date));assert.ok(!html.includes('PRIVATE_'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls.length,5);
 }
 assert.equal(f.db.sqlite.prepare('SELECT status FROM payout_requests WHERE id=?').get(payout.id).status,'processing');for(const table of ['commission_approvals','billing_accounts','billing_checkouts','payment_connections'])assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
});
