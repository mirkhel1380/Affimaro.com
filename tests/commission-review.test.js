import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {seedOrder,agencyPair} from './support/order-history.js';
import {service,AppError} from '../lib/service.ts';
import {payments} from '../lib/payments.ts';
import {commissionReview,parseCommissionReviewFilters,commissionReviewSearchParams,commissionReviewQuery} from '../lib/commission-review.ts';
import {commissionReviewStatus} from '../lib/payment-status.ts';
import {defaultPreferences} from '../lib/account-preferences.ts';
import {commissionReviewPath} from '../lib/portal-policy.ts';
import {previewHref,previewSections} from '../lib/portal-preview.ts';
const clock=new Date('2026-10-24T12:00:00.000Z'),fails=status=>e=>e instanceof AppError&&e.status===status;
function approve(f,row,amount=row.commission,revision=1){f.db.sqlite.prepare('INSERT INTO commission_approvals VALUES (?,?,?,?,?)').run(row.id,amount,revision,f.brand.userId,clock.toISOString());}

test('all commission orders remain reachable beyond 100 with deterministic pages and stale-page recovery',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<131;i++)seedOrder(f,undefined,undefined,{id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),external:'OLD-'+i});const ids=[];
 for(let page=1;page<=6;page++){const q=await commissionReview(f.db,f.brand,{state:'awaiting',page},clock);assert.equal(q.summary.total,131);assert.equal(q.summary.awaiting,131);assert.equal(q.pages,6);assert.equal(q.rows.length,page===6?6:25);ids.push(...q.rows.map(r=>r.id));}
 assert.equal(new Set(ids).size,131);assert.equal(ids[0],'00000000-0000-4000-8000-000000000130');assert.equal(ids.at(-1),'00000000-0000-4000-8000-000000000000');const last=await commissionReview(f.db,f.brand,{page:1000000},clock);assert.equal(last.filters.page,6);assert.equal(last.rows.length,6);
 f.db.sqlite.prepare('INSERT INTO account_preferences VALUES (?,?,1,?)').run(f.brand.userId,JSON.stringify({...defaultPreferences,pageSize:50,timeZone:'Asia/Kabul',dateFormat:'iso'}),clock.toISOString());const saved=await commissionReview(f.db,f.brand,{page:99},clock);assert.equal(saved.pageSize,50);assert.equal(saved.filters.page,3);assert.equal(saved.rows.length,31);assert.equal(saved.preferences.timeZone,'Asia/Kabul');const empty=await commissionReview(f.db,f.brand,{q:'missing',page:1000},clock);assert.equal(empty.filters.page,1);assert.equal(empty.pages,0);
});

test('saved business roles and consistent store/program associations fence the list and selected order',async t=>{
 const f=await partnerFixture(t),agency=await agencyPair(f),brand=seedOrder(f,undefined,undefined,{external:'BRAND_ONLY'}),own=seedOrder(f,agency.application,agency.store,{external:'AGENCY_ONLY'});seedOrder(f,f.application,agency.store,{external:'INVALID_STORE_PROGRAM'});
 assert.deepEqual((await commissionReview(f.db,f.brand)).rows.map(r=>r.external_id),['BRAND_ONLY']);assert.deepEqual((await commissionReview(f.db,f.agency)).rows.map(r=>r.external_id),['AGENCY_ONLY']);assert.equal((await commissionReview(f.db,f.foreignBrand)).summary.total,0);
 for(const [user,id] of [[f.brand,own.id],[f.agency,brand.id],[f.foreignBrand,brand.id]])await assert.rejects(commissionReview(f.db,user,{orderId:id}),fails(404));
 for(const user of [f.affiliate,f.creator,f.operator])await assert.rejects(commissionReview(f.db,user),fails(403));await assert.rejects(commissionReview(f.db,{userId:'',email:''}),fails(401));await service(f.db,f.brand).review({applicationId:f.application.id,status:'suspended'});assert.equal((await commissionReview(f.db,f.brand,{orderId:brand.id})).selected.id,brand.id);
});

test('review-state filters agree with existing controls across approval coverage, refunds and order states',async t=>{
 const f=await partnerFixture(t);const awaiting=seedOrder(f,undefined,undefined,{external:'awaiting'}),covered=seedOrder(f,undefined,undefined,{external:'covered'}),increased=seedOrder(f,undefined,undefined,{external:'increase',commission:1500}),refunded=seedOrder(f,undefined,undefined,{external:'refund',commission:400});approve(f,covered);approve(f,increased,1000);approve(f,refunded,1000);
 for(const state of ['pending','review','reversed','ineligible'])seedOrder(f,undefined,undefined,{external:state,state,commission:state==='reversed'||state==='ineligible'?0:1000});seedOrder(f,undefined,undefined,{external:'zero',commission:0});
 const q=await commissionReview(f.db,f.brand),expected={awaiting:'Awaiting approval',approved:'Approved',source_review:'Needs source review',pending:'pending',reversed:'reversed',ineligible:'ineligible',no_commission:'No payable commission'};assert.equal(q.summary.total,9);assert.equal(q.summary.awaiting,2);assert.equal(q.summary.blocked,1);assert.ok(q.rows.slice(0,2).every(r=>commissionReviewStatus(r).canApprove));
 for(const row of q.rows){assert.equal(commissionReviewStatus(row).label,expected[row.review_status]);const filtered=await commissionReview(f.db,f.brand,{state:row.review_status});assert.ok(filtered.rows.some(r=>r.id===row.id));}
 assert.equal(q.rows.find(r=>r.id===refunded.id).approved_amount,400);assert.equal(q.rows.find(r=>r.id===increased.id).approved_amount,1000);assert.equal(q.counts.all,9);assert.equal(q.counts.approved,2);assert.equal((await commissionReview(f.db,f.brand,{state:'approved'})).counts.awaiting,2);assert.equal((await commissionReview(f.db,f.brand,{orderId:awaiting.id})).selected.revision,1);
});

test('source holds and incomplete or stale Shopify sync block approval controls without provider calls or writes',async t=>{
 const f=await partnerFixture(t),row=seedOrder(f),store=f.connected.connection.id;f.db.sqlite.prepare("UPDATE store_connections SET platform='shopify' WHERE id=?").run(store);const now=new Date().toISOString();f.db.sqlite.prepare("INSERT INTO shopify_accounts(store_id,shop_domain,shop_id,client_id,encrypted_secret,encrypted_token,token_expires_at,scopes,synced_through) VALUES (?,'shop.myshopify.com','shop-id','client-id','PRIVATE_SECRET','PRIVATE_TOKEN',?,'read_orders',?)").run(store,now,'2020-01-01T00:00:00.000Z');
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Unexpected provider call');});let before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;let q=await commissionReview(f.db,f.brand,{state:'sync_needed'});assert.equal(q.summary.blocked,1);assert.equal(q.rows[0].sync_ready,0);assert.equal(commissionReviewStatus(q.rows[0]).canApprove,false);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
 await assert.rejects(payments(f.db,f.brand).approveCommission({orderId:row.id,revision:1}),fails(409));f.db.sqlite.prepare('UPDATE shopify_accounts SET synced_through=?,sync_until=? WHERE store_id=?').run(now,now,store);q=await commissionReview(f.db,f.brand,{state:'sync_needed'});assert.equal(q.summary.total,1);
 f.db.sqlite.prepare('UPDATE shopify_accounts SET sync_until=NULL,lease_until=NULL WHERE store_id=?').run(store);assert.equal((await commissionReview(f.db,f.brand,{state:'awaiting'})).summary.total,1);f.db.sqlite.prepare('INSERT INTO shopify_pending (store_id,order_id,reason,updated_at) VALUES (?,?,?,?)').run(store,'gid://shopify/Order/1234','PRIVATE_HOLD_REASON',now);before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;q=await commissionReview(f.db,f.brand,{state:'source_review',orderId:row.id});assert.equal(q.selected.commission,0);assert.equal(q.selected.approved_amount,0);assert.equal(commissionReviewStatus(q.selected).canApprove,false);assert.ok(!JSON.stringify(q).includes('PRIVATE_'));assert.ok(!JSON.stringify(q).includes(f.connected.key));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(calls,0);
});

test('literal search combines with currency and UTC creation dates; state counts follow the selected search scope',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run('Newsletter Partner',f.affiliate.userId);
 for(const [external,created] of [['first','2026-10-18T00:00:00.000Z'],['last','2026-10-24T23:59:59.999Z'],['older','2026-10-17T23:59:59.999Z'],['future','2026-10-25T00:00:00.000Z']])seedOrder(f,undefined,undefined,{external,created,currency:'JPY',decimals:0});const extra=seedOrder(f,undefined,undefined,{external:'Other Currency',currency:'USD',decimals:3,commission:123});
 const q=await commissionReview(f.db,f.brand,{q:'newsletter',currency:'JPY',range:'7d',state:'awaiting'},clock);assert.equal(q.summary.total,2);assert.equal(q.counts.all,2);assert.equal(q.rows[0].decimals,0);assert.equal((await commissionReview(f.db,f.brand,{q:extra.id})).rows[0].id,extra.id);assert.equal((await commissionReview(f.db,f.brand,{currency:'USD'})).rows[0].decimals,3);
 for(const literal of ['%',"' OR 1=1 --",'PRIVATE'])assert.equal((await commissionReview(f.db,f.brand,{q:literal})).summary.total,0);assert.ok((await commissionReview(f.db,f.brand,{currency:'ZZZ'})).currencies.includes('ZZZ'));
});

test('selected old orders retain latest approval state outside filters and never silently select another order',async t=>{
 const f=await partnerFixture(t),old=seedOrder(f,undefined,undefined,{external:'Very old order',received:'2020-01-01T00:00:00.000Z'});for(let i=0;i<131;i++)seedOrder(f,undefined,undefined,{external:'recent-'+i});const filters={state:'awaiting',orderId:old.id};let q=await commissionReview(f.db,f.brand,filters);assert.ok(!q.rows.some(r=>r.id===old.id));assert.equal(q.selected.id,old.id);assert.equal(q.selectedMatchesFilters,true);
 await payments(f.db,f.brand).approveCommission({orderId:old.id,revision:1});q=await commissionReview(f.db,f.brand,filters);assert.equal(q.selected.review_status,'approved');assert.equal(q.selectedMatchesFilters,false);assert.equal(q.summary.total,131);assert.equal(q.counts.approved,1);await assert.rejects(commissionReview(f.db,f.brand,{orderId:crypto.randomUUID()}),fails(404));
 f.db.sqlite.prepare('UPDATE orders SET revision=2,commission=1500 WHERE id=?').run(old.id);await assert.rejects(payments(f.db,f.brand).approveCommission({orderId:old.id,revision:1}),fails(409));q=await commissionReview(f.db,f.brand,filters);assert.equal(q.selected.revision,2);assert.equal(q.selected.review_status,'awaiting');assert.equal(q.selected.approved_amount,1000);
});

test('strict filters reject repeated, malformed and authority fields while navigation preserves only supported values',()=>{
 for(const input of [{state:'paid'},{currency:'usd'},{range:'custom'},{page:0},{page:['2']},{page:1.5},{page:1000001},{q:'x'.repeat(101)},{role:'agency'},{workspaceId:'other'},{orderId:'nope'}])assert.throws(()=>parseCommissionReviewFilters(input),fails(400));
 for(const q of ['page=1&page=2','state=all&state=approved','userId=someone','page=1e3','order=invalid','view=agency'])assert.throws(()=>commissionReviewSearchParams(new URLSearchParams(q)),fails(400));const f=commissionReviewSearchParams(new URLSearchParams('q=%20summer%20&state=awaiting&currency=USD&range=30d&page=3&order=00000000-0000-4000-8000-000000000001'));assert.equal(f.q,'summer');assert.deepEqual(commissionReviewSearchParams(new URLSearchParams(commissionReviewQuery(f))),f);assert.ok(!commissionReviewQuery(f,{page:2,orderId:undefined}).includes('order='));
 for(const portal of ['brand','agency']){assert.equal(previewHref(portal,commissionReviewPath(portal)),`/preview/${portal}/commission-approvals`);assert.ok(previewSections(portal).includes('commission-approvals'));}for(const portal of ['affiliate','creator'])assert.ok(!previewSections(portal).includes('commission-approvals'));
});
