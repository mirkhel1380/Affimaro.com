import {seedApprovedIdentity} from './support/identity-approval.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {agencyPair,seedOrder} from './support/order-history.js';
import {seedPayout} from './support/payment-history.js';
import {paymentHistory,paymentHistoryExport,parsePaymentHistoryFilters,paymentHistorySearchParams,paymentHistoryQuery} from '../lib/payment-history.ts';
import {service,AppError} from '../lib/service.ts';
import {payments} from '../lib/payments.ts';
import {defaultPreferences} from '../lib/account-preferences.ts';
import {previewHref} from '../lib/portal-preview.ts';
import {paymentHistoryPath} from '../lib/portal-policy.ts';
const clock=new Date('2026-10-24T12:00:00.000Z'),fails=status=>e=>e instanceof AppError&&e.status===status;

test('complete request history uses stable saved-size pages and clamps stale pages without losing records beyond 100',async t=>{
 const f=await partnerFixture(t),ids=[];for(let i=0;i<131;i++)ids.push(seedPayout(f).id);const seen=[];for(let page=1;page<=6;page++){const r=await paymentHistory(f.db,f.affiliate,{page},clock);assert.equal(r.summary.total,131);assert.equal(r.summary.closed,131);assert.equal(r.summary.open,0);assert.equal(r.pages,6);seen.push(...r.rows.map(r=>r.id));}assert.deepEqual(seen,ids.sort().reverse());assert.equal(new Set(seen).size,131);assert.equal((await paymentHistory(f.db,f.affiliate,{page:9999},clock)).filters.page,6);
 f.db.sqlite.prepare('INSERT INTO account_preferences VALUES (?,?,1,?)').run(f.affiliate.userId,JSON.stringify({...defaultPreferences,pageSize:50,timeZone:'Asia/Kabul'}),clock.toISOString());const r=await paymentHistory(f.db,f.affiliate,{},clock);assert.equal(r.rows.length,50);assert.equal(r.preferences.timeZone,'Asia/Kabul');
});

test('four actual roles and selected requests remain scoped to their own consistent program and participant records',async t=>{
 const f=await partnerFixture(t),pair=await agencyPair(f),w=await service(f.db,f.agency).workspace(),brand=seedPayout(f),agency=seedPayout(f,pair.application,w.id,f.creator);for(const [role,id,foreign] of [['brand',brand.id,agency.id],['affiliate',brand.id,agency.id],['agency',agency.id,brand.id],['creator',agency.id,brand.id]]){const report=await paymentHistory(f.db,f[role],{requestId:id},clock);assert.equal(report.summary.total,1);assert.equal(report.selected.id,id);await assert.rejects(paymentHistory(f.db,f[role],{requestId:foreign},clock),fails(404));}
 seedPayout(f,f.application,w.id,f.affiliate);assert.equal((await paymentHistory(f.db,f.agency,{},clock)).summary.total,1);assert.equal((await paymentHistory(f.db,f.affiliate,{},clock)).summary.total,1);assert.equal((await paymentHistory(f.db,f.foreignBrand,{},clock)).summary.total,0);
});

test('status, method, currency and literal ID/counterpart search combine and expose reversal states accurately',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run('Newsletter Partner',f.affiliate.userId);const ordinary=seedPayout(f);seedPayout(f,undefined,undefined,undefined,{status:'requested'});seedPayout(f,undefined,undefined,undefined,{status:'approved',currency:'EUR'});for(const reversed of [0,500,1000])seedPayout(f,undefined,undefined,undefined,{status:'transferred',method:'stripe',reversed});
 assert.equal((await paymentHistory(f.db,f.brand,{status:'open'},clock)).summary.total,2);assert.equal((await paymentHistory(f.db,f.brand,{status:'transferred'},clock)).summary.total,3);assert.equal((await paymentHistory(f.db,f.brand,{status:'partly_reversed'},clock)).rows[0].reversed_amount,500);assert.equal((await paymentHistory(f.db,f.affiliate,{status:'reversed'},clock)).rows[0].reversed_amount,1000);assert.equal((await paymentHistory(f.db,f.brand,{method:'bank',currency:'EUR'},clock)).summary.total,1);
 assert.equal((await paymentHistory(f.db,f.brand,{q:ordinary.id.slice(0,8).toUpperCase()},clock)).summary.total,1);assert.equal((await paymentHistory(f.db,f.brand,{q:'NEWSLETTER PARTNER'},clock)).summary.total,6);for(const q of ['%',"' OR 1=1 --"])assert.equal((await paymentHistory(f.db,f.brand,{q},clock)).summary.total,0);
});

test('UTC request-date boundaries, exact row precision and current selected status remain separate from history filters',async t=>{
 const f=await partnerFixture(t);seedPayout(f,undefined,undefined,undefined,{at:'2026-10-17T23:59:59.999Z'});seedPayout(f,undefined,undefined,undefined,{at:'2026-10-18T00:00:00.000Z',currency:'JPY',decimals:0,amount:12345});seedPayout(f,undefined,undefined,undefined,{at:'2026-10-24T23:59:59.999Z',currency:'USD',decimals:3,amount:12345});seedPayout(f,undefined,undefined,undefined,{at:'2026-10-25T00:00:00.000Z'});const q=await paymentHistory(f.db,f.affiliate,{range:'7d'},clock);assert.equal(q.summary.total,2);assert.equal(q.rows.find(r=>r.currency==='JPY').decimals,0);assert.equal(q.rows.find(r=>r.currency==='USD').decimals,3);const selected=await paymentHistory(f.db,f.affiliate,{currency:'EUR',requestId:q.rows[0].id},clock);assert.equal(selected.summary.total,0);assert.equal(selected.selected.id,q.rows[0].id);assert.equal(selected.selectedMatchesFilters,false);
});

test('selected business controls use current coverage/source checks and read history without decrypting or changing money',async t=>{
 const f=await partnerFixture(t);seedApprovedIdentity(f.db,f.affiliate.userId);const order=seedOrder(f),r=seedPayout(f,undefined,undefined,undefined,{status:'requested'});f.db.sqlite.prepare('INSERT INTO commission_approvals VALUES (?,?,?,?,?)').run(order.id,1000,1,f.brand.userId,clock.toISOString());let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 let history=await paymentHistory(f.db,f.brand,{requestId:r.id},clock);const dashboard=await payments(f.db,f.brand).merchantDashboard();assert.equal(history.selected.covered,dashboard.requests.find(p=>p.id===r.id).covered);assert.equal(history.selected.sync_ready,1);assert.equal(history.selected.covered,1);assert.ok(!JSON.stringify(history).includes('PRIVATE_DESTINATION_CIPHERTEXT'));assert.ok(!JSON.stringify(history).includes('encrypted_'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
 f.db.sqlite.prepare("UPDATE store_connections SET platform='shopify' WHERE id=?").run(f.connected.connection.id);f.db.sqlite.prepare('INSERT INTO shopify_accounts(store_id,shop_domain,shop_id,client_id,encrypted_secret,encrypted_token,token_expires_at,scopes) VALUES (?,?,?,?,?,?,?,?)').run(f.connected.connection.id,'fixture.myshopify.com','gid://shopify/Shop/1','fixture-client','PRIVATE_SECRET','PRIVATE_TOKEN','2090-01-01T00:00:00.000Z','read_orders');history=await paymentHistory(f.db,f.brand,{requestId:r.id},clock);assert.equal(history.selected.covered,1);assert.equal(history.selected.sync_ready,0);await assert.rejects(payments(f.db,f.brand).review({requestId:r.id,status:'approved',reason:''}),fails(409));
 f.db.sqlite.prepare('INSERT INTO shopify_pending(store_id,order_id,reason,updated_at) VALUES (?,?,?,?)').run(f.connected.connection.id,'gid://shopify/Order/1234','Pending source data',clock.toISOString());history=await paymentHistory(f.db,f.brand,{requestId:r.id},clock);assert.equal(history.selected.covered,0);await assert.rejects(payments(f.db,f.brand).review({requestId:r.id,status:'approved',reason:''}),fails(409));
});

test('CSV exports every matching request with the existing safe columns, formula protection and an explicit 5,000-record limit',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE workspaces SET name=? WHERE id=?').run('=Example, "Brand"',f.program.workspace_id);for(let i=0;i<131;i++)seedPayout(f,undefined,undefined,undefined,{reason:'@SUM(1,2)'});let result=await paymentHistoryExport(f.db,f.affiliate,{page:3},clock);assert.equal(result.rowCount,131);assert.equal(result.csv.trim().split('\r\n').length,132);assert.ok(result.csv.startsWith('\ufeff'));assert.ok(result.csv.includes(`"'=Example, ""Brand"""`));assert.ok(result.csv.includes(`"'@SUM(1,2)"`));assert.ok(!result.csv.includes('PRIVATE_'));
 for(let i=131;i<5001;i++)seedPayout(f);await assert.rejects(paymentHistoryExport(f.db,f.brand,{},clock),e=>fails(409)(e)&&/5,000/.test(e.message));result=await paymentHistoryExport(f.db,f.brand,{currency:'EUR'},clock);assert.equal(result.rowCount,0);
});

test('suspended partnerships retain history while query parsing rejects authority, duplicates and malformed values',async t=>{
 const f=await partnerFixture(t);seedPayout(f);await service(f.db,f.brand).review({applicationId:f.application.id,status:'suspended'});assert.equal((await paymentHistory(f.db,f.affiliate,{},clock)).summary.total,1);
 for(const input of [{status:'ready'},{currency:'usd'},{page:['1','2']},{method:'wise'},{requestId:'bad'},{q:'x'.repeat(121)},{ownerId:'another'}])assert.throws(()=>parsePaymentHistoryFilters(input),fails(400));for(const q of ['status=paid&status=approved','portal=brand','userId=other','page=-1'])assert.throws(()=>paymentHistorySearchParams(new URLSearchParams(q)),fails(400));const filters=paymentHistorySearchParams(new URLSearchParams('q=hello&method=bank&status=open&currency=USD&range=7d&page=3'));assert.deepEqual(paymentHistorySearchParams(new URLSearchParams(paymentHistoryQuery(filters))),filters);
 for(const role of ['brand','affiliate','creator','agency'])assert.equal(previewHref(role,paymentHistoryPath(role)),`/preview/${role}/payments?tab=history`);
});
