import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce,receiveStoreEvent,signStoreRequest} from '../lib/woocommerce.ts';
import {shopify} from '../lib/shopify.ts';
import {normalizeShopifyOrder,minorUnits,currencyDecimals,sourceRevision,referralCandidate,ShopifyReview} from '../lib/shopify-model.ts';
import {payments} from '../lib/payments.ts';
const key='12'.repeat(32),identity=id=>({userId:id,email:id+'@example.com'}),domain='pilot-shop.myshopify.com';
const credentials={shopDomain:domain,clientId:'test_client_id_12345678901234567890',clientSecret:'test_only_shopify_secret_1234567890'};
const fails=n=>e=>e instanceof AppError&&e.status===n;
const page={hasNextPage:false,endCursor:null};
const money=(amount,currency='USD')=>({shopMoney:{amount,currencyCode:currency}});
const moment=(application,id='1',occurredAt=new Date(Date.now()-20000).toISOString())=>({__typename:'CustomerVisit',id:'gid://shopify/CustomerVisit/'+id,occurredAt,referralCode:'af_'+application,utmParameters:null});
function order(application,override={}){return {id:'gid://shopify/Order/123',createdAt:new Date(Date.now()-10000).toISOString(),updatedAt:new Date(Date.now()-5000).toISOString(),test:false,cancelledAt:null,displayFinancialStatus:'PAID',currencyCode:'USD',taxesIncluded:false,subtotalPriceSet:money('120.00'),currentSubtotalPriceSet:money('120.00'),lineItems:{nodes:[{taxLines:[]}],pageInfo:page},refunds:[],customerJourneySummary:{ready:true,moments:{nodes:[moment(application)],pageInfo:page}},...override};}
function refund(net,tax='0.00',shipping='0.00',shippingTax='0.00',total=String(Number(net)+Number(tax)+Number(shipping)+Number(shippingTax))){return {totalRefundedSet:money(total),refundLineItems:{nodes:Number(net)?[{subtotalSet:money(net),totalTaxSet:money(tax)}]:[],pageInfo:page},refundShippingLines:{nodes:Number(shipping)?[{subtotalAmountSet:money(shipping),taxAmountSet:money(shippingTax)}]:[],pageInfo:page}};}
async function fixture(t,{connect=true}={}){
  const db=database(t),owner=service(db,identity('owner')),affiliate=service(db,identity('affiliate'));await owner.saveAccount({name:'Merchant Owner'});await owner.createBusiness({name:'Shopify Business',website:''});await affiliate.saveAccount({name:'Shopify Partner'});await affiliate.saveAffiliate({name:'Shopify Partner',channel:'Blog',website:'',bio:''});const program=(await owner.businessDashboard()).program,application=await affiliate.apply({programId:program.id});await owner.review({applicationId:application.id,status:'approved'});
  const f={db,owner,affiliate,program,application,calls:[],orders:new Map(),scope:'read_orders,read_all_orders',token:'isolated_shopify_access_token',pageProvider:null,failOrder:null};
  f.fetcher=async(url,init)=>{f.calls.push({url,init});assert.match(url,new RegExp('^https://'+domain.replaceAll('.','\\.')+'/admin/'));assert.equal(init.redirect,'manual');assert.ok(init.signal);if(url.endsWith('/oauth/access_token'))return Response.json({access_token:f.token,scope:f.scope,expires_in:86399});
    const body=JSON.parse(init.body);assert.equal(init.headers['X-Shopify-Access-Token'],f.token);
    if(body.query.includes('AffimaroVerify'))return Response.json({data:{shop:{id:'gid://shopify/Shop/1',myshopifyDomain:domain,primaryDomain:{url:'https://pilot-store.example'}},orders:{nodes:[]}}});
    if(body.query.includes('AffimaroOrderPage')){const supplied=f.pageProvider?f.pageProvider(body.variables):{edges:[...f.orders.keys()].slice(0,3).map((id,i)=>({cursor:'cursor-'+i,node:{id}})),pageInfo:{hasNextPage:false,endCursor:null}};return Response.json({data:{orders:supplied}});}
    if(f.failOrder===body.variables.id)throw new Error('isolated transport failure');return Response.json({data:{order:f.orders.get(body.variables.id)||null}});
  };
  f.adapter=shopify(db,identity('owner'),key,f.fetcher);if(connect){await f.adapter.connect(credentials);const earlier=new Date(Date.now()-86400000).toISOString();db.sqlite.prepare('UPDATE store_connections SET created_at=?').run(earlier);db.sqlite.prepare('UPDATE program_rule_revisions SET effective_at=?').run(earlier);}
  return f;
}
const rows=f=>f.db.sqlite.prepare('SELECT * FROM orders').all();
function add(f,o=order(f.application.id)){f.orders.set(o.id,o);return o;}
const revise=(o,changes={})=>({...o,updatedAt:new Date(Date.parse(o.updatedAt)+1000).toISOString(),...changes});

test('Shopify connects only after remote verification and encrypts secrets/tokens without exposing them',async t=>{
  const f=await fixture(t),status=await f.adapter.status(),stored=f.db.sqlite.prepare('SELECT * FROM shopify_accounts').get();assert.equal(status.shop_domain,domain);assert.ok(!JSON.stringify(status).includes(credentials.clientSecret));assert.ok(!JSON.stringify(status).includes(f.token));assert.ok(!JSON.stringify(stored).includes(credentials.clientSecret));assert.ok(!JSON.stringify(stored).includes(f.token));assert.equal(stored.encrypted_secret.split('.')[0],'v1');assert.equal((await commerce(f.db,identity('owner')).dashboard()).connection.platform,'shopify');
});
test('host validation, tenant ownership and one-store rules run before credentials leave the server',async t=>{
  const f=await fixture(t,{connect:false});for(const host of ['https://'+domain,'evil.example',domain+'.evil.example','localhost','127.0.0.1'])await assert.rejects(f.adapter.connect({...credentials,shopDomain:host}),fails(400));assert.equal(f.calls.length,0);
  await assert.rejects(shopify(f.db,identity('other'),key,f.fetcher).connect(credentials),fails(404));await commerce(f.db,identity('owner')).configure({action:'connect',storeUrl:'https://wordpress.example'});await assert.rejects(f.adapter.connect(credentials),fails(409));assert.equal(f.calls.length,0);
});
test('missing orders scope and failed verification cannot create a connected store',async t=>{
  const f=await fixture(t,{connect:false});f.scope='read_products';await assert.rejects(f.adapter.connect(credentials),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_connections').get().n,0);
  const blocked=shopify(f.db,identity('owner'),key,async()=>new Response('not followed',{status:302,headers:{Location:'https://evil.example'}}));await assert.rejects(blocked.connect(credentials),fails(502));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM shopify_accounts').get().n,0);
});
test('Shopify’s 30-day window is enforced on connection and future program edits',async t=>{
  const f=await fixture(t,{connect:false});await f.owner.saveProgram({name:'Long program',rate:10,windowDays:90,active:true});await assert.rejects(f.adapter.connect(credentials),fails(409));await f.owner.saveProgram({name:'Native window',rate:10,windowDays:30,active:true});await f.adapter.connect(credentials);await assert.rejects(f.owner.saveProgram({name:'Too long',rate:10,windowDays:31,active:true}),fails(400));
});
test('money normalization excludes included tax and shipping, with exact minor units and refund review',()=>{
  assert.equal(currencyDecimals('JPY'),0);assert.equal(currencyDecimals('KWD'),3);assert.equal(currencyDecimals('AFN'),2);assert.equal(minorUnits('1.234',3),1234);assert.throws(()=>minorUnits('1.001',2),ShopifyReview);assert.throws(()=>minorUnits('1000000000001',0),ShopifyReview);
  const o=order(crypto.randomUUID(),{taxesIncluded:true,lineItems:{nodes:[{taxLines:[{priceSet:money('20.00')}]}],pageInfo:page},currentSubtotalPriceSet:money('90.00'),refunds:[refund('25.00','5.00')]});let n=normalizeShopifyOrder(o);assert.equal(n.snapshot.basis,10000);assert.equal(n.snapshot.refundedBasis,2500);assert.equal(n.snapshot.refundUnallocated,false);
  n=normalizeShopifyOrder(order(crypto.randomUUID(),{currentSubtotalPriceSet:money('100.00'),refunds:[refund('20.00','4.00','5.00','1.00')]}));assert.equal(n.snapshot.refundedBasis,2000);assert.equal(n.snapshot.refundUnallocated,false);
  n=normalizeShopifyOrder(order(crypto.randomUUID(),{refunds:[refund('0.00','0.00','0.00','0.00','30.00')]}));assert.equal(n.snapshot.refundUnallocated,true);
});
test('last eligible native referral wins; future/expired visits and incomplete histories do not get guessed',()=>{
  const first=crypto.randomUUID(),last=crypto.randomUUID(),program=crypto.randomUUID(),o=order(first);const before=Date.parse(o.createdAt);o.customerJourneySummary.moments.nodes=[moment(first,'1',new Date(before-5000).toISOString()),moment(last,'2',new Date(before-1000).toISOString())];assert.equal(referralCandidate(o,program,30).applicationId,last);
  o.customerJourneySummary.moments.nodes=[moment(first,'1',new Date(before-31*86400000).toISOString()),moment(last,'2',new Date(before+1000).toISOString())];assert.equal(referralCandidate(o,program,30),null);o.customerJourneySummary.ready=false;assert.throws(()=>referralCandidate(o,program,30),ShopifyReview);
});
test('sync imports a verified order once and generates Shopify referral links for the approved partner',async t=>{
  const f=await fixture(t);add(f);const first=await f.adapter.sync();assert.equal(first.imported,1);await f.adapter.sync();assert.equal(rows(f).length,1);assert.equal(rows(f)[0].commission,1200);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM referrals').get().n,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_events').get().n,1);const partner=await commerce(f.db,identity('affiliate')).partnerTracking();assert.equal(partner.links[0].url,'/r/'+f.application.id);assert.equal(partner.links[0].platform,'shopify');
});
test('order revisions retain their rate while partial/full refunds reconcile without journey data',async t=>{
  const f=await fixture(t),original=add(f);await f.adapter.sync();await f.owner.saveProgram({name:'Updated rate',rate:20,windowDays:30,active:true});let next=revise(original,{currentSubtotalPriceSet:money('100.00'),refunds:[refund('20.00')],customerJourneySummary:null,displayFinancialStatus:'PARTIALLY_REFUNDED'});add(f,next);await f.adapter.sync();assert.equal(rows(f)[0].commission,1000);assert.equal(rows(f)[0].rate_bps,1000);
  next=revise(next,{currentSubtotalPriceSet:money('0.00'),refunds:[refund('120.00')],displayFinancialStatus:'REFUNDED'});add(f,next);await f.adapter.sync();assert.equal(rows(f)[0].commission,0);assert.equal(rows(f)[0].commission_state,'reversed');
});
test('unready attribution is queued and retried even when the order itself has not changed',async t=>{
  const f=await fixture(t),o=add(f);o.customerJourneySummary.ready=false;assert.equal((await f.adapter.sync()).deferred,1);assert.equal(rows(f).length,0);assert.equal((await f.adapter.status()).pending.length,1);o.customerJourneySummary.ready=true;await f.adapter.sync();assert.equal(rows(f).length,1);assert.equal((await f.adapter.status()).pending.length,0);
});
test('test orders, unmatched campaigns and cross-workspace affiliate IDs never earn commission',async t=>{
  const f=await fixture(t);const a=order(f.application.id,{id:'gid://shopify/Order/1',test:true}),b=order(crypto.randomUUID(),{id:'gid://shopify/Order/2'}),c=order(f.application.id,{id:'gid://shopify/Order/3',customerJourneySummary:{ready:true,moments:{nodes:[],pageInfo:page}}});[a,b,c].forEach(o=>add(f,o));const r=await f.adapter.sync();assert.equal(r.testOrders,1);assert.equal(r.unattributed,2);assert.equal(rows(f).length,0);
});
test('a suspended affiliate’s first import stays ineligible after later reinstatement',async t=>{
  const f=await fixture(t),o=add(f);await f.owner.review({applicationId:f.application.id,status:'suspended'});await f.adapter.sync();assert.equal(rows(f)[0].commission_state,'ineligible');await f.owner.review({applicationId:f.application.id,status:'approved'});add(f,revise(o));await f.adapter.sync();assert.equal(rows(f)[0].commission,0);
});
test('unsupported newer financial data holds existing commission in review rather than leaving it payable',async t=>{
  const f=await fixture(t),o=add(f);await f.adapter.sync();add(f,revise(o,{lineItems:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'more'}}}));await f.adapter.sync();const visible=(await commerce(f.db,identity('owner')).dashboard()).orders[0];assert.equal(visible.commission_state,'review');assert.equal(visible.commission,0);assert.equal((await f.adapter.status()).pending.length,1);
});
test('pagination checkpoints survive a transport failure and resume without losing or duplicating orders',async t=>{
  const f=await fixture(t),a=add(f,order(f.application.id,{id:'gid://shopify/Order/1'})),b=add(f,order(f.application.id,{id:'gid://shopify/Order/2'}));f.failOrder=b.id;f.pageProvider=({after})=>after==='one'?{edges:[{cursor:'two',node:{id:b.id}}],pageInfo:{hasNextPage:false,endCursor:'two'}}:{edges:[{cursor:'one',node:{id:a.id}},{cursor:'two',node:{id:b.id}}],pageInfo:{hasNextPage:false,endCursor:'two'}};
  await assert.rejects(f.adapter.sync(),fails(502));assert.equal(rows(f).length,1);let saved=f.db.sqlite.prepare('SELECT * FROM shopify_accounts').get();assert.equal(saved.sync_cursor,'one');assert.equal(saved.lease_id,null);f.failOrder=null;await f.adapter.sync();saved=f.db.sqlite.prepare('SELECT * FROM shopify_accounts').get();assert.equal(rows(f).length,2);assert.equal(saved.sync_cursor,null);assert.ok(saved.synced_through);
});
test('active leases, pause and ownership checks prevent overlapping or unauthorized syncs',async t=>{
  const f=await fixture(t);f.db.sqlite.prepare('UPDATE shopify_accounts SET lease_until=?,lease_id=?').run(new Date(Date.now()+60000).toISOString(),'other-sync');await assert.rejects(f.adapter.sync(),fails(409));f.db.sqlite.prepare('UPDATE shopify_accounts SET lease_until=NULL,lease_id=NULL').run();await f.adapter.setActive({active:false});await assert.rejects(f.adapter.sync(),fails(409));await f.adapter.setActive({active:true});await assert.rejects(shopify(f.db,identity('stranger'),key,f.fetcher).status(),fails(404));await assert.rejects(shopify(f.db,identity('stranger'),key,f.fetcher).sync(),fails(404));
});
test('expired credentials refresh server-side and never return access tokens to callers',async t=>{
  const f=await fixture(t);f.db.sqlite.prepare('UPDATE shopify_accounts SET token_expires_at=?').run('2020-01-01T00:00:00.000Z');const old=f.db.sqlite.prepare('SELECT encrypted_token FROM shopify_accounts').get().encrypted_token;add(f);const result=await f.adapter.sync();assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/access_token')).length,2);assert.notEqual(f.db.sqlite.prepare('SELECT encrypted_token FROM shopify_accounts').get().encrypted_token,old);assert.ok(!JSON.stringify(result).includes(f.token));
});
test('public WooCommerce ingestion and controls cannot mutate a Shopify connection',async t=>{
  const f=await fixture(t),store=f.db.sqlite.prepare('SELECT * FROM store_connections').get(),eventId=crypto.randomUUID(),stamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify({kind:'ping',storeUrl:store.store_url}),signature=await signStoreRequest(store.signing_key,stamp,eventId,body);await assert.rejects(receiveStoreEvent(f.db,new Request('https://affimaro.example/api/woocommerce/event',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':store.id,'X-Affimaro-Event':eventId,'X-Affimaro-Timestamp':stamp,'X-Affimaro-Signature':signature},body})),fails(401));await assert.rejects(commerce(f.db,identity('owner')).configure({action:'rotate'}),fails(409));
});
test('a Shopify refund after a recorded bank payment carries debt into the existing payout accounting',async t=>{
  const f=await fixture(t),o=add(f);await f.adapter.sync();const merchant=payments(f.db,identity('owner'),key),partner=payments(f.db,identity('affiliate'),key),saved=rows(f)[0];await merchant.approveCommission({orderId:saved.id,revision:saved.revision});await partner.saveBank({beneficiary:'Example Partner',bank:'Example Bank',country:'US',currency:'USD',account:'123456789012',swift:'',routing:'',address:''});const req=await partner.request({requestId:crypto.randomUUID(),applicationId:f.application.id,currency:'USD',decimals:2});await merchant.review({requestId:req.id,status:'approved',reason:''});await merchant.recordPaid({requestId:req.id,receipt:{reference:'SHOPIFY-TEST-TRANSFER',paidDate:new Date().toISOString().slice(0,10),receiptUrl:'',confirmed:true}});add(f,revise(o,{displayFinancialStatus:'REFUNDED',currentSubtotalPriceSet:money('0.00'),refunds:[refund('120.00')]}));await f.adapter.sync();assert.equal((await partner.partnerDashboard()).wallets[0].debt,1200);
});
test('same-revision changes are held for review, and older snapshots cannot restore refunded commission',async t=>{
  const f=await fixture(t),o=add(f);await f.adapter.sync();add(f,{...o,subtotalPriceSet:money('100.00'),currentSubtotalPriceSet:money('100.00')});await f.adapter.sync();const visible=(await commerce(f.db,identity('owner')).dashboard()).orders[0];assert.equal(visible.commission,0);assert.equal(visible.commission_state,'review');const refunded=revise(o,{displayFinancialStatus:'REFUNDED',currentSubtotalPriceSet:money('0.00'),refunds:[refund('120.00')]});add(f,refunded);await f.adapter.sync();add(f,o);await f.adapter.sync();assert.equal(rows(f)[0].commission,0);
});
test('source holds release on a healthy identical-version retry without changing the verified snapshot',async t=>{
  const f=await fixture(t),o=add(f);await f.adapter.sync();add(f,{...o,lineItems:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'more'}}});await f.adapter.sync();assert.equal((await commerce(f.db,identity('owner')).dashboard()).orders[0].commission,0);add(f,o);await f.adapter.sync();assert.equal((await commerce(f.db,identity('owner')).dashboard()).orders[0].commission,1200);
});
test('an older source response cannot release a hold created by a newer incomplete revision',async t=>{
  const f=await fixture(t),o=add(f);await f.adapter.sync();const newer=revise(o,{lineItems:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'more'}}});add(f,newer);await f.adapter.sync();add(f,o);await f.adapter.sync();assert.equal((await commerce(f.db,identity('owner')).dashboard()).orders[0].commission,0);add(f,{...newer,lineItems:o.lineItems});await f.adapter.sync();assert.equal((await commerce(f.db,identity('owner')).dashboard()).orders[0].commission,1200);
});
test('financial approval and payment recording require a complete Shopify sync within five minutes',async t=>{
  const f=await fixture(t);add(f);await f.adapter.sync();const merchant=payments(f.db,identity('owner'),key),partner=payments(f.db,identity('affiliate'),key),saved=rows(f)[0];f.db.sqlite.prepare('UPDATE shopify_accounts SET synced_through=?').run('2020-01-01T00:00:00.000Z');await assert.rejects(merchant.approveCommission({orderId:saved.id,revision:saved.revision}),fails(409));await f.adapter.sync();await merchant.approveCommission({orderId:saved.id,revision:saved.revision});await partner.saveBank({beneficiary:'Example Partner',bank:'Example Bank',country:'US',currency:'USD',account:'123456789012',swift:'',routing:'',address:''});const req=await partner.request({requestId:crypto.randomUUID(),applicationId:f.application.id,currency:'USD',decimals:2});await merchant.review({requestId:req.id,status:'approved',reason:''});f.db.sqlite.prepare('UPDATE shopify_accounts SET sync_until=?').run(new Date().toISOString());await assert.rejects(merchant.recordPaid({requestId:req.id,receipt:{reference:'TEST-INCOMPLETE-SYNC',paidDate:new Date().toISOString().slice(0,10),receiptUrl:'',confirmed:true}}),fails(409));
});
test('first import uses the program rate effective at the native referral session, not a later settings edit',async t=>{
  const f=await fixture(t);add(f);await f.owner.saveProgram({name:'New rate before import',rate:25,windowDays:30,active:true});await f.adapter.sync();assert.equal(rows(f)[0].rate_bps,1000);assert.equal(rows(f)[0].commission,1200);
});
test('a valid native visit from a paused historical program is not credited after later activation',async t=>{
  const f=await fixture(t),o=add(f);f.db.sqlite.prepare('INSERT INTO program_rule_revisions (id,program_id,rate_bps,window_days,active,effective_at) VALUES (?,?,1000,30,0,?)').run(crypto.randomUUID(),f.program.id,new Date(Date.parse(o.createdAt)-30000).toISOString());await f.adapter.sync();assert.equal(rows(f).length,0);
});
