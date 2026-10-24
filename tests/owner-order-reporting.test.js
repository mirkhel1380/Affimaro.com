import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {seedOrder,agencyPair} from './support/order-history.js';
import {ownerRecords,ownerOverview} from '../lib/owner.ts';
import {orderHistory} from '../lib/order-history.ts';
import {reports} from '../lib/reports.ts';
import {AppError} from '../lib/service.ts';
const fails=status=>e=>e instanceof AppError&&e.status===status;
function hold(f,external){f.db.sqlite.prepare("UPDATE store_connections SET platform='shopify' WHERE id=?").run(f.connected.connection.id);f.db.sqlite.prepare('INSERT INTO shopify_pending(store_id,order_id,reason,updated_at) VALUES (?,?,?,?)').run(f.connected.connection.id,'gid://shopify/Order/'+external,'PRIVATE_SOURCE_REASON',new Date().toISOString());}

test('owner order rows and overview treat a current Shopify source hold like customer reports',async t=>{
 const f=await partnerFixture(t);seedOrder(f,f.application,f.connected.connection,{external:'100'});hold(f,'100');seedOrder(f,f.application,f.connected.connection,{external:'200',basis:10000,refunded:2000,commission:800});seedOrder(f,f.application,f.connected.connection,{external:'300',state:'review',commission:0});
 const row=(await ownerRecords(f.db,f.operator,'orders')).rows.find(r=>r.external_id==='100');assert.equal(row.commission,0);assert.equal(row.commission_state,'review');assert.equal(row.review,'required');const overview=await ownerOverview(f.db,f.operator),money=overview.money.find(r=>r.currency==='USD');assert.equal(overview.counts.order_reviews,2);assert.equal(money.commission,800);assert.equal(money.eligible_sales,8000);assert.equal(money.review_orders,2);assert.equal(money.net_sales,28000);
 const customer=await reports(f.db,f.brand).get({view:'business',range:'90d'});assert.equal(customer.summary.review_orders,2);assert.equal(customer.metrics[0].estimated,money.commission);assert.equal(customer.metrics[0].net_sales,money.eligible_sales);assert.equal((await orderHistory(f.db,f.affiliate,{state:'review'})).summary.total,overview.counts.order_reviews);
});

test('the dedicated review filter finds held orders without matching clear orders whose business name contains required',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE workspaces SET name=? WHERE id=?').run('Required Goods',f.program.workspace_id);seedOrder(f,f.application,f.connected.connection,{external:'100'});seedOrder(f,f.application,f.connected.connection,{external:'200'});hold(f,'100');
 const needs=await ownerRecords(f.db,f.operator,'orders',{review:'required'});assert.equal(needs.total,1);assert.equal(needs.rows[0].external_id,'100');assert.equal(needs.review,'required');const clear=await ownerRecords(f.db,f.operator,'orders',{review:'clear'});assert.equal(clear.total,1);assert.equal(clear.rows[0].external_id,'200');assert.equal((await ownerRecords(f.db,f.operator,'orders',{review:'required',q:'200'})).total,0);
});

test('releasing a source hold restores the saved state without rewriting stored orders or commission approvals',async t=>{
 const f=await partnerFixture(t),order=seedOrder(f);hold(f,'1234');f.db.sqlite.prepare('INSERT INTO commission_approvals VALUES (?,?,?,?,?)').run(order.id,1000,1,f.brand.userId,new Date().toISOString());assert.equal((await ownerOverview(f.db,f.operator)).money[0].commission,0);
 f.db.sqlite.prepare('DELETE FROM shopify_pending').run();const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,overview=await ownerOverview(f.db,f.operator),row=(await ownerRecords(f.db,f.operator,'orders')).rows[0];assert.equal(row.commission,1000);assert.equal(row.commission_state,'accrued');assert.equal(row.review,'clear');assert.equal(overview.counts.order_reviews,0);assert.equal(overview.money[0].eligible_sales,10000);assert.equal(f.db.sqlite.prepare('SELECT amount FROM commission_approvals').get().amount,1000);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
});

test('owner currency groups preserve precision and distinguish all recorded merchandise from eligible merchandise',async t=>{
 const f=await partnerFixture(t),agency=await agencyPair(f);for(const [external,state] of [['pending','pending'],['reversed','reversed'],['ineligible','ineligible']])seedOrder(f,f.application,f.connected.connection,{external,state,commission:0});seedOrder(f,f.application,f.connected.connection,{external:'eligible',basis:10000,refunded:2000,commission:800});seedOrder(f,agency.application,agency.store,{external:'agency',basis:20000,commission:2000});
 seedOrder(f,f.application,f.connected.connection,{external:'usd3',currency:'USD',decimals:3,commission:123});seedOrder(f,f.application,f.connected.connection,{external:'jpy',currency:'JPY',decimals:0,commission:456});
 const overview=await ownerOverview(f.db,f.operator),usd=overview.money.find(r=>r.currency==='USD'&&r.decimals===2);assert.equal(usd.orders,5);assert.equal(usd.net_sales,58000);assert.equal(usd.eligible_sales,28000);assert.equal(usd.commission,2800);assert.equal(overview.money.length,3);assert.equal(overview.money.find(r=>r.currency==='USD'&&r.decimals===3).commission,123);assert.equal(overview.money.find(r=>r.currency==='JPY').commission,456);
});

test('review counts include every old record and pagination retains the typed review and literal search filters',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<121;i++)seedOrder(f,f.application,f.connected.connection,{id:'order-'+String(i).padStart(4,'0'),external:'SALE-'+i,state:'review',commission:0});seedOrder(f,f.application,f.connected.connection,{external:'CLEAR-SALE'});
 const ids=[];for(let page=1;page<=3;page++){const data=await ownerRecords(f.db,f.operator,'orders',{review:'required',q:'sale',page:String(page)});assert.equal(data.total,121);assert.equal(data.rows.length,page===3?21:50);ids.push(...data.rows.map(r=>r.id));}assert.equal(new Set(ids).size,121);assert.equal((await ownerOverview(f.db,f.operator)).counts.order_reviews,121);
 const last=await ownerRecords(f.db,f.operator,'orders',{review:'required',page:'9999'});assert.equal(last.page,3);assert.equal(last.rows.length,21);const narrowed=await ownerRecords(f.db,f.operator,'orders',{review:'required',page:'9999',q:'SALE-120'});assert.equal(narrowed.page,1);assert.equal(narrowed.total,1);
 for(const input of [{review:'approved'},{review:['required','clear']},{q:['one','two']},{page:['1','2']}])await assert.rejects(ownerRecords(f.db,f.operator,'orders',input),fails(400));
 for(const user of [f.brand,f.affiliate,f.creator,f.agency])await assert.rejects(ownerRecords(f.db,{...user,role:'owner'},'orders',{review:'required'}),fails(403));
});

test('the owner overview and filtered rows stay read-only and never project source reasons or stored signing keys',async t=>{
 const f=await partnerFixture(t);seedOrder(f);hold(f,'1234');let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw new Error('Unexpected provider call');});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n;
 const overview=await ownerOverview(f.db,f.operator),data=await ownerRecords(f.db,f.operator,'orders',{review:'required'});assert.equal(data.total,overview.counts.order_reviews);const json=JSON.stringify({overview,data});assert.ok(!json.includes(f.connected.key));assert.ok(!json.includes('PRIVATE_SOURCE_REASON'));assert.ok(!json.includes('encrypted'));assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.equal(fetches,0);
 f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.operator.userId);await assert.rejects(ownerOverview(f.db,f.operator),fails(403));
});

test('oversized aggregate amounts are rejected instead of displaying rounded monetary totals',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.exec('BEGIN');for(let i=0;i<9008;i++)seedOrder(f,f.application,f.connected.connection,{external:String(i),basis:1_000_000_000_000,commission:100_000_000_000});f.db.sqlite.exec('COMMIT');
 await assert.rejects(ownerOverview(f.db,f.operator),error=>fails(413)(error)&&/exact display limit/.test(error.message));const first=await ownerRecords(f.db,f.operator,'orders',{q:'9007'});assert.equal(first.total,1);assert.equal(first.rows[0].basis,1_000_000_000_000);
});
