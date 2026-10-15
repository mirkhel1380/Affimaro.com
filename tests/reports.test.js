import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce} from '../lib/woocommerce.ts';
import {payments} from '../lib/payments.ts';
import {reports,parseReportFilters,reportSearchParams,reportQuery,reportCsv} from '../lib/reports.ts';
import {money} from '../lib/money.ts';

const identity=userId=>({userId,email:userId+'@example.com'}),clock=new Date('2026-10-15T12:00:00.000Z');
const fails=status=>error=>error instanceof AppError&&error.status===status;
const filters={view:'business',range:'7d'};
async function fixture(t){
  const db=database(t),apps=[];
  for(const userId of ['owner-one','owner-two','affiliate-one','affiliate-two']){
    const s=service(db,identity(userId));await s.saveAccount({name:userId});
    if(userId.startsWith('owner'))await s.createBusiness({name:userId,website:''});
    else await s.saveAffiliate({name:userId,channel:'Blog',website:'',bio:''});
  }
  for(const [owner,affiliate] of [['owner-one','affiliate-one'],['owner-one','affiliate-two'],['owner-two','affiliate-one']]){
    const s=service(db,identity(owner)),dashboard=await s.businessDashboard();
    const application=await service(db,identity(affiliate)).apply({programId:dashboard.program.id});await s.review({applicationId:application.id,status:'approved'});
    let store=db.sqlite.prepare('SELECT id FROM store_connections WHERE workspace_id=?').get(dashboard.business.id);
    if(!store)store=(await commerce(db,identity(owner)).configure({action:'connect',storeUrl:`https://${owner}.example`})).connection;
    const referral=crypto.randomUUID();db.sqlite.prepare('INSERT INTO referrals (id,store_id,application_id,rate_bps,created_at,expires_at) VALUES (?,?,?,1000,?,?)').run(referral,store.id,application.id,'2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z');
    apps.push({id:application.id,owner,affiliate,workspace:dashboard.business.id,program:dashboard.program.id,store:store.id,referral});
  }
  return {db,apps,report:(view='business',user='owner-one',change={})=>reports(db,identity(user)).get({...filters,view,...change},clock)};
}
function order(f,app,change={}){
  const row={id:crypto.randomUUID(),currency:'USD',decimals:2,basis:10000,refunded:0,commission:1000,state:'accrued',status:'completed',createdAt:'2026-10-15T10:00:00.000Z',approved:1000,...change};
  f.db.sqlite.prepare('INSERT INTO orders (id,store_id,referral_id,application_id,external_id,revision,currency,decimals,basis,refunded_basis,rate_bps,commission,status,commission_state,needs_review,created_at,received_at) VALUES (?,?,?,?,?,1,?,?,?,?,1000,?,?,?,0,?,?)').run(row.id,app.store,app.referral,app.id,row.id.replaceAll('-','').slice(0,12),row.currency,row.decimals,row.basis,row.refunded,row.commission,row.status,row.state,row.createdAt,'2026-10-15T11:00:00.000Z');
  if(row.approved!==null)f.db.sqlite.prepare('INSERT INTO commission_approvals (order_id,amount,revision,approved_by,approved_at) VALUES (?,?,1,?,?)').run(row.id,row.approved,app.owner,'2026-10-15T11:00:00.000Z');
  return row;
}
function payout(f,app,{amount,status='paid',method='bank',reversed=0,currency='USD',decimals=2}){
  const id=crypto.randomUUID();
  f.db.sqlite.prepare('INSERT INTO payout_requests (id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,method,reversed_amount,stripe_transfer_id,encrypted_destination,account_hint,encrypted_receipt,reference_hash,paid_date,paid_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,app.workspace,app.id,app.affiliate,currency,decimals,amount,status,method,reversed,status==='transferred'?'tr_'+id.replaceAll('-',''):null,'PRIVATE_DESTINATION_MUST_NOT_EXPORT','9012',['paid','transferred'].includes(status)?'PRIVATE_RECEIPT_MUST_NOT_EXPORT':null,id,['paid','transferred'].includes(status)?'2026-10-15':null,['paid','transferred'].includes(status)?app.owner:null,'2026-10-15T11:00:00.000Z','2026-10-15T11:00:00.000Z');
  return id;
}
const metric=(r,currency='USD',decimals=2)=>r.metrics.find(row=>row.currency===currency&&row.decimals===decimals);
const balance=(r,currency='USD',decimals=2)=>r.balances.find(row=>row.currency===currency&&row.decimals===decimals);

test('business and affiliate reports enforce different scopes, including partnership selectors',async t=>{
  const f=await fixture(t);order(f,f.apps[0]);order(f,f.apps[1],{commission:2000});order(f,f.apps[2],{commission:9000});
  const owner=await f.report();assert.equal(owner.summary.orders,2);assert.equal(metric(owner).estimated,3000);assert.equal(owner.options.length,2);assert.ok(!JSON.stringify(owner).includes('owner-two'));
  const affiliate=await f.report('affiliate','affiliate-one');assert.equal(affiliate.summary.orders,2);assert.equal(metric(affiliate).estimated,10000);assert.equal(affiliate.options.length,2);assert.ok(!JSON.stringify(affiliate).includes('affiliate-two'));
  const selected=await f.report('business','owner-one',{applicationId:f.apps[1].id});assert.equal(selected.summary.orders,1);assert.equal(metric(selected).estimated,2000);assert.equal(selected.options.length,2);
  await assert.rejects(f.report('business','owner-one',{applicationId:f.apps[2].id}),fails(404));
  await assert.rejects(f.report('affiliate','affiliate-one',{applicationId:f.apps[1].id}),fails(404));
  await assert.rejects(f.report('business','stranger'),fails(404));
  assert.equal((await f.report('affiliate','stranger')).summary.orders,0);
  assert.throws(()=>reports(f.db,{userId:'',email:''}),fails(401));
});

test('UTC boundaries, sparse daily counts and currency precision remain exact and separate',async t=>{
  const f=await fixture(t),a=f.apps[0],b=f.apps[1];
  order(f,a,{createdAt:'2026-10-09T00:00:00.000Z',basis:10000,refunded:2000,commission:800,approved:1000});
  order(f,a,{createdAt:'2026-10-15T23:59:59.999Z',basis:5000,commission:500,approved:500});
  order(f,a,{basis:2000,commission:0,approved:null,state:'ineligible',status:'pending'});
  order(f,a,{createdAt:'2026-10-08T23:59:59.999Z',commission:300});
  order(f,a,{createdAt:'2026-10-16T00:00:00.000Z',commission:900});
  order(f,b,{currency:'EUR'});order(f,b,{decimals:3});
  const r=await f.report();assert.equal(r.summary.orders,5);assert.equal(r.summary.eligible_orders,4);assert.equal(r.metrics.length,3);
  assert.equal(metric(r).estimated,1300);assert.equal(metric(r).approved,1300);assert.equal(metric(r).net_sales,13000);assert.equal(metric(r,'USD',3).estimated,1000);
  assert.equal(r.daily.length,7);assert.deepEqual({...r.daily[0]},{date:'2026-10-09',orders:1,eligible_orders:1,review_orders:0});assert.equal(r.daily[1].orders,0);assert.equal(r.daily.at(-1).orders,4);
  assert.equal(r.daily.reduce((n,row)=>n+row.orders,0),r.summary.orders);
});

test('reports aggregate every matching order instead of stopping at the existing 100-order history limit',async t=>{
  const f=await fixture(t);for(let i=0;i<125;i++)order(f,f.apps[0],{basis:100,commission:10,approved:10});
  const r=await f.report();assert.equal(r.summary.orders,125);assert.equal(metric(r).estimated,1250);assert.equal(r.partnerships[0].orders,125);assert.equal(r.daily.at(-1).orders,125);assert.equal(balance(r).approved,1250);
});

test('later refunds and Shopify source holds revise earlier-period estimates and approval caps',async t=>{
  const f=await fixture(t),a=f.apps[0];
  const held=order(f,a,{createdAt:'2026-09-01T12:00:00.000Z'});
  order(f,a,{createdAt:'2026-09-01T12:00:00.000Z',refunded:5000,commission:500,approved:1000});
  order(f,a,{createdAt:'2026-09-01T12:00:00.000Z',commission:2000,approved:1000});
  f.db.sqlite.prepare('INSERT INTO shopify_pending (store_id,order_id,reason,source_revision,updated_at) VALUES (?,?,?,1,?)').run(a.store,'gid://shopify/Order/'+held.id.replaceAll('-','').slice(0,12),'source data unavailable','2026-10-15T11:00:00.000Z');
  const r=await f.report('business','owner-one',{range:'custom',from:'2026-09-01',to:'2026-09-01'});
  assert.equal(metric(r).estimated,2500);assert.equal(metric(r).approved,1500);assert.equal(metric(r).net_sales,15000);assert.equal(r.summary.review_orders,1);assert.equal(r.summary.eligible_orders,2);assert.equal(balance(r).approved,1500);
  assert.equal((await payments(f.db,identity(a.affiliate)).partnerDashboard()).wallets[0].approved,1500);
});

test('all-time balances preserve reservations, verified reversals and debt per partnership',async t=>{
  const f=await fixture(t),[a,b]=f.apps;
  order(f,a);order(f,b,{basis:500,commission:50,approved:50});
  payout(f,a,{amount:900,status:'transferred',method:'stripe',reversed:300});payout(f,a,{amount:200});payout(f,a,{amount:100,status:'processing',method:'stripe'});
  payout(f,a,{amount:9999,status:'cancelled'});payout(f,b,{amount:150});payout(f,b,{amount:20,status:'requested'});payout(f,b,{amount:9999,status:'rejected'});
  const r=await f.report(),row=balance(r);
  assert.equal(row.approved,1050);assert.equal(row.bank_recorded,350);assert.equal(row.stripe_net,600);assert.equal(row.stripe_reversed,300);assert.equal(row.reserved,120);assert.equal(row.available,100);assert.equal(row.debt,100);assert.equal(row.uncovered_reserved,20);assert.equal(row.processing_requests,1);
  const wallets=(await payments(f.db,identity('owner-one')).merchantDashboard()).wallets;
  for(const [key,source] of [['available','available'],['debt','debt'],['reserved','reserved']])assert.equal(row[key],wallets.reduce((n,w)=>n+w[source],0));
  const one=await f.report('business','owner-one',{applicationId:b.id});assert.equal(balance(one).available,0);assert.equal(balance(one).debt,100);
  f.db.sqlite.prepare("UPDATE payout_requests SET reversed_amount=900 WHERE method='stripe' AND status='transferred'").run();
  const reversed=balance(await f.report());assert.equal(reversed.stripe_net,0);assert.equal(reversed.stripe_reversed,900);assert.equal(reversed.available,700);assert.equal(reversed.debt,100);
});

test('date filters change performance but do not misrepresent current balances as period cash flow',async t=>{
  const f=await fixture(t),a=f.apps[0];order(f,a,{createdAt:'2026-08-01T12:00:00.000Z'});payout(f,a,{amount:250});
  const r=await f.report();assert.equal(r.summary.orders,0);assert.equal(r.metrics.length,0);assert.equal(balance(r).approved,1000);assert.equal(balance(r).available,750);
  const csv=reportCsv(r);assert.match(csv,/all_time_current_balance/);assert.match(csv,/orders_created_in_period_current_snapshot/);assert.equal(r.daily.length,7);
});

test('calendar validation and duplicate/unknown query values fail before report SQL runs',async t=>{
  const f=await fixture(t);
  for(const input of [{view:'merchant'},{range:'all'},{range:'custom'},{range:'custom',from:'2026-02-30',to:'2026-03-01'},{range:'custom',from:'2026-10-15',to:'2026-10-14'},{range:'custom',from:'2026-10-15',to:'2026-10-16'},{range:'custom',from:'2025-01-01',to:'2026-10-15'},{applicationId:"' OR 1=1--"},{ownerId:'owner-two'}])assert.throws(()=>parseReportFilters(input,clock),fails(400));
  assert.throws(()=>parseReportFilters(reportSearchParams(new URLSearchParams('view=business&view=affiliate')),clock),fails(400));
  const leap=parseReportFilters({range:'custom',from:'2024-02-29',to:'2024-03-01'},clock);assert.equal(leap.until,'2024-03-02T00:00:00.000Z');
  const full=parseReportFilters({range:'custom',from:'2025-10-15',to:'2026-10-15'},clock);assert.equal(full.from,'2025-10-15');
  const q=reportQuery(parseReportFilters({view:'affiliate',range:'90d',applicationId:f.apps[2].id},clock));assert.equal(new URLSearchParams(q).get('applicationId'),f.apps[2].id);assert.ok(!q.includes('ownerId'));
});

test('read-only reporting and CSV expose no credentials, destinations, receipts or other identity fields',async t=>{
  const f=await fixture(t),a=f.apps[0];order(f,a);payout(f,a,{amount:100});
  f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run('  =HYPERLINK("bad")\nPartner',a.affiliate);
  f.db.sqlite.prepare('INSERT INTO payment_connections (id,workspace_id,provider,mode,external_id,label,country,currency,payouts_enabled,status,encrypted_credential,last_verified_at,last_checked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),a.workspace,'stripe','live','acct_PRIVATE','Private label','US','USD',1,'verified','PRIVATE_CREDENTIAL_MUST_NOT_EXPORT',clock.toISOString(),clock.toISOString(),clock.toISOString(),clock.toISOString());
  const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,r=await f.report(),csv=reportCsv(r);
  assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'  =HYPERLINK"));assert.ok(csv.includes('""bad""'));
  for(const secret of ['PRIVATE_CREDENTIAL_MUST_NOT_EXPORT','PRIVATE_DESTINATION_MUST_NOT_EXPORT','PRIVATE_RECEIPT_MUST_NOT_EXPORT','acct_PRIVATE','9012','owner-one@example.com','affiliate-one@example.com','affiliate_user_id','encrypted_destination'])assert.ok(!(JSON.stringify(r)+csv).includes(secret),secret);
  assert.match(csv,/net_sales_minor/);assert.match(csv,/stripe_reversed_minor/);assert.match(csv,/partnership_rows_truncated/);
});

test('bounded partnership rows do not truncate totals, and a selected partnership stays in the selector',async t=>{
  const f=await fixture(t),template=f.apps[0],apps=[];
  for(let i=0;i<202;i++){
    const userId='extra-'+i,id=crypto.randomUUID(),referral=crypto.randomUUID();
    f.db.sqlite.prepare('INSERT INTO accounts (id,email,display_name,created_at) VALUES (?,?,?,?)').run(userId,userId+'@example.com',userId,clock.toISOString());
    f.db.sqlite.prepare('INSERT INTO affiliate_profiles (user_id,display_name,channel,bio,created_at) VALUES (?,?,?,\'\',?)').run(userId,'Partner '+String(i).padStart(3,'0'),'Blog',clock.toISOString());
    f.db.sqlite.prepare('INSERT INTO applications (id,program_id,affiliate_user_id,status,created_at,updated_at) VALUES (?,?,?,\'approved\',?,?)').run(id,template.program,userId,clock.toISOString(),clock.toISOString());
    f.db.sqlite.prepare('INSERT INTO referrals (id,store_id,application_id,rate_bps,created_at,expires_at) VALUES (?,?,?,1000,?,?)').run(referral,template.store,id,clock.toISOString(),'2026-11-15T12:00:00.000Z');
    const app={...template,id,affiliate:userId,referral};apps.push(app);if(i<105)order(f,app,{basis:100,commission:10,approved:10});
  }
  const r=await f.report();assert.equal(r.summary.orders,105);assert.equal(metric(r).estimated,1050);assert.equal(r.partnerships.length,100);assert.equal(r.truncated.partnerships,true);assert.equal(r.options.length,200);assert.equal(r.truncated.options,true);assert.equal(balance(r).approved,1050);
  const selected=await f.report('business','owner-one',{applicationId:apps.at(-1).id});assert.equal(selected.options[0].application_id,apps.at(-1).id);assert.equal(selected.summary.orders,0);assert.equal(selected.partnerships.length,0);
});

test('a report refuses unsafe aggregate integers instead of exporting rounded money',async t=>{
  const f=await fixture(t);order(f,f.apps[0],{commission:Number.MAX_SAFE_INTEGER,approved:Number.MAX_SAFE_INTEGER});order(f,f.apps[0],{commission:2,approved:2});
  await assert.rejects(f.report(),fails(413));
});

test('large and fractional currency displays preserve every saved minor unit',()=>{
  assert.equal(money(Number.MAX_SAFE_INTEGER,'USD',2),'$90,071,992,547,409.91');
  assert.equal(money(Number.MAX_SAFE_INTEGER,'USD',6),'$9,007,199,254.740991');
  assert.equal(money(-1,'USD',2),'-$0.01');assert.equal(money(-123,'USD',2),'-$1.23');assert.equal(money(123,'JPY',0),'¥123');assert.equal(money(1,'USD',6),'$0.000001');
  assert.throws(()=>money(Number.MAX_SAFE_INTEGER+1,'USD',2),RangeError);assert.throws(()=>money(1,'USD',7),RangeError);
});

test('oversized currency group sets fail clearly instead of silently truncating totals',async t=>{
  const f=await fixture(t);
  for(let i=0;i<201;i++)order(f,f.apps[0],{currency:'A'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26)});
  await assert.rejects(f.report(),fails(413));
});
