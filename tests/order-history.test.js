import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {seedOrder,agencyPair} from './support/order-history.js';
import {service,AppError} from '../lib/service.ts';
import {commerce} from '../lib/woocommerce.ts';
import {orderHistory,parseOrderFilters,orderSearchParams,orderQuery} from '../lib/order-history.ts';
import {defaultPreferences} from '../lib/account-preferences.ts';
import {ordersPath} from '../lib/portal-policy.ts';
import {previewHref,previewSections} from '../lib/portal-preview.ts';

const clock=new Date('2026-10-24T12:00:00.000Z'),fails=status=>e=>e instanceof AppError&&e.status===status;

test('every saved order remains reachable beyond 100, with stable pages and full filtered review counts',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<126;i++)seedOrder(f,f.application,f.connected.connection,{external:'ORDER-'+i,id:'row-'+String(i).padStart(4,'0'),state:i<5?'review':'accrued'});
 const ids=[];for(let page=1;page<=6;page++){const h=await orderHistory(f.db,f.brand,{page},clock);assert.equal(h.summary.total,126);assert.equal(h.summary.review,5);assert.equal(h.pages,6);assert.equal(h.rows.length,page===6?1:25);ids.push(...h.rows.map(r=>r.id));}
 assert.equal(new Set(ids).size,126);assert.equal(ids[0],'row-0125');assert.equal(ids.at(-1),'row-0000');
 const review=await orderHistory(f.db,f.brand,{state:'review'},clock);assert.equal(review.summary.total,5);assert.equal(review.summary.review,5);assert.ok(review.rows.every(r=>r.commission_state==='review'));
});

test('four saved roles only read their owned business or personal referred orders',async t=>{
 const f=await partnerFixture(t),agency=await agencyPair(f);seedOrder(f,f.application,f.connected.connection,{external:'BRAND-ONLY'});seedOrder(f,agency.application,agency.store,{external:'AGENCY-ONLY'});seedOrder(f,f.pending,f.connected.connection,{external:'CREATOR-BRAND'});
 for(const [role,expected] of [['brand',['BRAND-ONLY','CREATOR-BRAND']],['affiliate',['BRAND-ONLY']],['agency',['AGENCY-ONLY']],['creator',['AGENCY-ONLY','CREATOR-BRAND']]]){const h=await orderHistory(f.db,f[role],{},clock);assert.deepEqual(h.rows.map(r=>r.external_id).sort(),expected.sort());assert.equal(h.portal,role);assert.equal(h.business,['brand','agency'].includes(role));}
 assert.equal((await orderHistory(f.db,f.foreignBrand,{},clock)).summary.total,0);
 // An inconsistent store/application association cannot cross the program fence.
 seedOrder(f,f.application,agency.store,{external:'INVALID-CROSS-STORE'});for(const role of ['brand','affiliate','agency','creator'])assert.ok(!(await orderHistory(f.db,f[role],{},clock)).rows.some(r=>r.external_id==='INVALID-CROSS-STORE'));
 await assert.rejects(orderHistory(f.db,{userId:'',email:''}),fails(401));await assert.rejects(orderHistory(f.db,{userId:'unknown',email:'unknown@example.com'}),fails(403));
});

test('literal search, states and currency combine without mixing precision or using query-selected authority',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run('Newsletter Partner',f.affiliate.userId);f.db.sqlite.prepare('UPDATE workspaces SET name=? WHERE id=?').run('Example Shop',f.program.workspace_id);
 seedOrder(f,f.application,f.connected.connection,{external:'SUMMER-100',currency:'JPY',decimals:0,basis:12345,refunded:100,commission:1225,state:'pending'});seedOrder(f,f.application,f.connected.connection,{external:'SUMMER-200',decimals:3,commission:123});seedOrder(f,f.application,f.connected.connection,{external:'other'});
 const h=await orderHistory(f.db,f.brand,{q:'summer',state:'pending',currency:'JPY'},clock);assert.equal(h.summary.total,1);assert.equal(h.rows[0].commission,1225);assert.equal(h.rows[0].decimals,0);assert.equal(h.rows[0].refunded_basis,100);assert.equal((await orderHistory(f.db,f.brand,{q:'newsletter partner'},clock)).summary.total,3);assert.equal((await orderHistory(f.db,f.affiliate,{q:'EXAMPLE SHOP'},clock)).summary.total,3);
 for(const q of ['%',"' OR 1=1 --",'PRIVATE'])assert.equal((await orderHistory(f.db,f.brand,{q},clock)).summary.total,0);
 assert.equal((await orderHistory(f.db,f.brand,{currency:'ZZZ'},clock)).rows.length,0);assert.ok((await orderHistory(f.db,f.brand,{currency:'ZZZ'},clock)).currencies.includes('ZZZ'));
});

test('Shopify source holds are filtered as review with zero effective commission and are read without provider activity',async t=>{
 const f=await partnerFixture(t);seedOrder(f);f.db.sqlite.prepare("UPDATE store_connections SET platform='shopify' WHERE id=?").run(f.connected.connection.id);f.db.sqlite.prepare('INSERT INTO shopify_pending (store_id,order_id,reason,updated_at) VALUES (?,?,?,?)').run(f.connected.connection.id,'gid://shopify/Order/1234','PRIVATE_SOURCE_REASON',clock.toISOString());
 let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 for(const user of [f.brand,f.affiliate]){const h=await orderHistory(f.db,user,{state:'review'},clock);assert.equal(h.summary.total,1);assert.equal(h.rows[0].commission,0);assert.equal(h.rows[0].needs_review,1);assert.equal((await orderHistory(f.db,user,{state:'accrued'},clock)).summary.total,0);assert.ok(!JSON.stringify(h).includes('PRIVATE_SOURCE_REASON'));assert.ok(!JSON.stringify(h).includes(f.connected.key));}
 assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(fetches,0);f.db.sqlite.prepare('DELETE FROM shopify_pending').run();assert.equal((await orderHistory(f.db,f.brand,{state:'accrued'},clock)).rows[0].commission,1000);
});

test('date ranges use order creation UTC boundaries instead of latest delivery date',async t=>{
 const f=await partnerFixture(t);for(const [external,created] of [['first','2026-10-18T00:00:00.000Z'],['last','2026-10-24T23:59:59.999Z'],['older','2026-10-17T23:59:59.999Z'],['future','2026-10-25T00:00:00.000Z']])seedOrder(f,f.application,f.connected.connection,{external,created,received:'2026-10-24T12:00:00.000Z'});
 assert.equal((await orderHistory(f.db,f.brand,{},clock)).summary.total,4);const h=await orderHistory(f.db,f.brand,{range:'7d'},clock);assert.equal(h.summary.total,2);assert.deepEqual(h.rows.map(r=>r.external_id).sort(),['first','last']);assert.equal(h.from,'2026-10-18T00:00:00.000Z');assert.equal(h.until,'2026-10-25T00:00:00.000Z');
});

test('saved page-size and time-zone preferences are retained and stale oversized pages resolve to the last actual page',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<61;i++)seedOrder(f,f.application,f.connected.connection,{external:'old-'+i});f.db.sqlite.prepare('INSERT INTO account_preferences VALUES (?,?,1,?)').run(f.brand.userId,JSON.stringify({...defaultPreferences,pageSize:50,timeZone:'Asia/Kabul',dateFormat:'iso'}),clock.toISOString());
 const first=await orderHistory(f.db,f.brand,{},clock);assert.equal(first.rows.length,50);assert.equal(first.preferences.timeZone,'Asia/Kabul');const last=await orderHistory(f.db,f.brand,{page:9999},clock);assert.equal(last.filters.page,2);assert.equal(last.rows.length,11);assert.equal(last.pages,2);const narrowed=await orderHistory(f.db,f.brand,{page:9999,q:'old-60'},clock);assert.equal(narrowed.filters.page,1);assert.equal(narrowed.rows.length,1);const empty=await orderHistory(f.db,f.brand,{page:9999,q:'none'},clock);assert.equal(empty.filters.page,1);assert.equal(empty.pages,0);
});

test('paused stores and suspended partnerships keep their saved history readable',async t=>{
 const f=await partnerFixture(t);seedOrder(f);await service(f.db,f.brand).review({applicationId:f.application.id,status:'suspended'});await commerce(f.db,f.brand).configure({action:'disconnect'});for(const user of [f.brand,f.affiliate])assert.equal((await orderHistory(f.db,user,{},clock)).summary.total,1);
});

test('invalid, repeated and authority filters are rejected; valid pagination round-trips all filters',()=>{
 for(const input of [{state:'approved'},{currency:'usd'},{range:'custom'},{page:0},{page:['2']},{page:1.1},{page:1000001},{q:'x'.repeat(101)},{role:'brand'},{ownerId:'another'}])assert.throws(()=>parseOrderFilters(input),fails(400));
 for(const q of ['page=2&page=3','state=review&state=accrued','userId=another','page=2.5','page=1e3','view=business'])assert.throws(()=>orderSearchParams(new URLSearchParams(q)),fails(400));
 const filters=orderSearchParams(new URLSearchParams('q=%20summer%20&state=review&currency=USD&range=30d&page=3'));assert.equal(filters.q,'summer');assert.deepEqual(orderSearchParams(new URLSearchParams(orderQuery(filters))),filters);assert.equal(orderSearchParams(new URLSearchParams(orderQuery(filters,2))).page,2);
 for(const role of ['brand','agency','affiliate','creator']){assert.equal(previewHref(role,ordersPath(role)),`/preview/${role}/orders`);assert.ok(previewSections(role).includes('orders'));}
});
