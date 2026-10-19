import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {commerce,receiveStoreEvent} from '../lib/woocommerce.ts';
import {payments} from '../lib/payments.ts';
import {gettingStarted} from '../lib/getting-started.ts';
import {independentFetch} from '../self-hosted/bridge.ts';
import {createAffimaroClient,AffimaroDeliveryError} from '../integrations/custom/affimaro.mjs';

const origin='https://affimaro.example',home='https://Website.example/store';
const identity=userId=>({userId,email:userId+'@example.com'});
const status=n=>error=>error instanceof AppError&&error.status===n;
const delivered=n=>error=>error instanceof AffimaroDeliveryError&&error.status===n;
async function fixture(t,platform='custom'){
  const db=database(t),owner=service(db,identity('owner')),affiliate=service(db,identity('affiliate'));
  await owner.saveAccount({name:'Owner'});await owner.createBusiness({name:'Website business',website:home});
  await affiliate.saveAccount({name:'Partner'});await affiliate.saveAffiliate({name:'Partner',channel:'Blog',website:'',bio:''});
  const program=(await owner.businessDashboard()).program,application=await affiliate.apply({programId:program.id});
  await owner.review({applicationId:application.id,status:'approved'});
  const store=commerce(db,identity('owner')),configured=await store.configure({action:'connect',platform,storeUrl:home});
  const f={db,owner,affiliate,application,store,connection:configured.connection,key:configured.key,requests:0};
  const env={DB:db,APP_ORIGIN:origin,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',AUTH_SESSION_ENCRYPTION_KEY:'dc'.repeat(32)};
  f.transport=async(url,init)=>{
    f.requests++;assert.equal(url,origin+'/api/custom/event');assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.ok(init.signal);
    return independentFetch(new Request(url,init),env,async request=>{
      assert.ok([...request.headers.keys()].every(key=>!key.startsWith('oai-authenticated-user-')));
      try{return Response.json({ok:true,data:await receiveStoreEvent(db,request,new Date(),'custom')},{headers:{'Cache-Control':'no-store'}});}
      catch(error){if(!(error instanceof AppError))throw error;return Response.json({ok:false,error:error.message},{status:error.status});}
    },async()=>{throw new Error('A machine request must not contact the browser identity provider.');});
  };
  f.client=(fetcher=f.transport,key=f.key)=>createAffimaroClient({origin,storeUrl:home,connectionId:f.connection.id,signingKey:key,fetcher});
  return f;
}
const event=()=>({eventId:crypto.randomUUID()});
const snapshot=(referral,extra={})=>({orderId:'ORDER-2026:0001',revision:1,referralId:referral.referralId,createdAt:new Date().toISOString(),currency:'USD',decimals:2,basis:12000,refundedBasis:0,status:'completed',refundUnallocated:false,...extra});
async function rawRequest(f,payload,{key=f.key,eventId=crypto.randomUUID(),timestamp=String(Math.floor(Date.now()/1000)),raw=JSON.stringify(payload),headers={}}={}){
  const signature=createHmac('sha256',key).update(`${timestamp}.${eventId}.${raw}`).digest('hex');
  return new Request(origin+'/api/custom/event',{method:'POST',headers:{'Content-Type':'application/json','X-Affimaro-Store':f.connection.id,'X-Affimaro-Event':eventId,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Signature':signature,...headers},body:raw});
}
const rawSend=async(f,payload,options={},platform='custom')=>receiveStoreEvent(f.db,await rawRequest(f,payload,options),new Date(),platform);

test('custom website connection is owner-scoped, one per workspace and verified by its downloadable client',async t=>{
  const f=await fixture(t),client=f.client();assert.equal(f.connection.platform,'custom');
  assert.equal((await commerce(f.db,identity('affiliate')).partnerTracking()).links.length,0);
  assert.deepEqual(await client.ping(),{connected:true});
  const dashboard=await f.store.dashboard(),tracking=await commerce(f.db,identity('affiliate')).partnerTracking();
  assert.ok(dashboard.connection.last_seen);assert.ok(!JSON.stringify(dashboard).includes(f.key));assert.ok(!('signing_key' in dashboard.connection));
  assert.equal(tracking.links[0].url,'/r/'+f.application.id);
  const guide=await gettingStarted(f.db,identity('owner'));assert.match(JSON.stringify(guide),/website backend/);
  await assert.rejects(f.store.configure({action:'connect',platform:'custom',storeUrl:'https://another.example'}),status(409));
  await assert.rejects(f.store.configure({action:'rotate'}),status(409));
  await assert.rejects(f.store.configure({action:'connect',platform:'shopify',storeUrl:home}),status(400));
  await assert.rejects(commerce(f.db,identity('affiliate')).configure({action:'rotate',platform:'custom'}),status(404));
});

test('SDK-to-independent receiver handles locked attribution, string order IDs, approvals and refund corrections',async t=>{
  const f=await fixture(t),client=f.client(),referral=await client.referral(f.application.id,event());
  await f.owner.saveProgram({name:'Changed rate',rate:20,windowDays:30,active:true});
  const order=snapshot(referral,{status:'pending'}),send=extra=>client.order({...order,...extra},event());
  await send({});let row=f.db.sqlite.prepare('SELECT * FROM orders').get();assert.equal(row.commission,0);
  await send({revision:2,status:'completed'});row=f.db.sqlite.prepare('SELECT * FROM orders').get();assert.equal(row.commission,1200);assert.equal(row.rate_bps,1000);
  const merchant=payments(f.db,identity('owner'),'aa'.repeat(32)),partner=payments(f.db,identity('affiliate'),'aa'.repeat(32));
  assert.equal((await partner.partnerDashboard()).wallets[0].available,0);
  await assert.rejects(partner.approveCommission({orderId:row.id,revision:row.revision}),status(404));
  await merchant.approveCommission({orderId:row.id,revision:row.revision});assert.equal((await partner.partnerDashboard()).wallets[0].available,1200);
  await send({revision:3,status:'completed',refundedBasis:2500});row=f.db.sqlite.prepare('SELECT * FROM orders').get();assert.equal(row.commission,950);
  assert.equal((await partner.partnerDashboard()).wallets[0].available,950,'The existing approval is capped by the reduced, refund-adjusted commission.');
  await send({revision:4,status:'completed',refundedBasis:2500,refundUnallocated:true});assert.equal(f.db.sqlite.prepare('SELECT commission_state FROM orders').get().commission_state,'review');
  await send({revision:5,status:'refunded',refundedBasis:12000});assert.equal(f.db.sqlite.prepare('SELECT commission FROM orders').get().commission,0);
  assert.deepEqual(await send({revision:2,status:'completed'}),{orderId:order.orderId,stale:true});
  await assert.rejects(send({revision:5,status:'completed'}),delivered(409));
  await assert.rejects(send({revision:6,currency:'AFN'}),delivered(409));
  const own=await commerce(f.db,identity('affiliate')).partnerTracking();assert.equal(own.orders.length,1);assert.equal(own.totals[0].commission,0);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);
});

test('ambiguous network failures replay one referral/order and stable SDK serialization survives key reordering',async t=>{
  const f=await fixture(t);let lose=true;
  const client=f.client(async(url,init)=>{const response=await f.transport(url,init);if(lose){lose=false;throw new Error('Private transport contents');}return response;});
  const referralEvent=event();await assert.rejects(client.referral(f.application.id,referralEvent),error=>error.retryable&&error.eventId===referralEvent.eventId&&!error.message.includes('Private'));
  const referral=await client.referral(f.application.id,referralEvent);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM referrals').get().n,1);
  const order=snapshot(referral),orderEvent=event();await client.order(order,orderEvent);
  const reordered=Object.fromEntries(Object.entries(order).reverse());assert.deepEqual(await client.order(reordered,orderEvent),{orderId:order.orderId,accepted:true});
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM orders').get().n,1);
  await assert.rejects(client.order({...order,basis:5000},orderEvent),delivered(409));
  assert.equal(f.db.sqlite.prepare('SELECT commission FROM orders').get().commission,1200);
});

test('custom events enforce HMAC, freshness, content bounds and strict fields before recording receipts',async t=>{
  const f=await fixture(t),ping={kind:'ping',storeUrl:home};
  await assert.rejects(rawSend(f,ping,{key:'a'.repeat(64)}),status(401));
  await assert.rejects(rawSend(f,ping,{timestamp:String(Math.floor(Date.now()/1000)-301)}),status(401));
  await assert.rejects(rawSend(f,ping,{headers:{'X-Affimaro-Signature':''}}),status(401));
  await assert.rejects(rawSend(f,ping,{headers:{'Content-Type':'text/plain'}}),status(415));
  await assert.rejects(rawSend(f,ping,{raw:'x'.repeat(16385)}),status(413));
  await assert.rejects(rawSend(f,{...ping,ownerId:'someone-else'}),status(400));
  const referral=await f.client().referral(f.application.id,event()),base=snapshot(referral);
  for(const orderId of ['../1','<script>','=SUM(A1)','A'.repeat(129),'has space'])await assert.rejects(rawSend(f,{kind:'order',...base,orderId}),status(400));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_events').get().n,1);
});

test('platform isolation keeps WooCommerce and Shopify numeric IDs and rejects cross-platform keys',async t=>{
  const custom=await fixture(t),ping={kind:'ping',storeUrl:home};
  await assert.rejects(rawSend(custom,ping,{},'woocommerce'),status(401));await assert.rejects(rawSend(custom,ping,{},'shopify'),status(401));
  const woo=await fixture(t,'woocommerce');await assert.rejects(rawSend(woo,ping),status(401));
  const ref=await rawSend(woo,{kind:'referral',applicationId:woo.application.id},{},'woocommerce');
  await assert.rejects(rawSend(woo,{kind:'order',...snapshot(ref)},{},'woocommerce'),status(400));
  woo.db.sqlite.prepare("UPDATE store_connections SET platform='shopify'").run();
  await assert.rejects(rawSend(woo,{kind:'order',...snapshot(ref)},{},'shopify'),status(400));
  assert.equal(woo.db.sqlite.prepare('SELECT count(*) n FROM orders').get().n,0);
});

test('custom attribution remains tenant-scoped; paused partners cannot register but existing refunds still arrive',async t=>{
  const f=await fixture(t),client=f.client(),referral=await client.referral(f.application.id,event()),order=snapshot(referral);
  await client.order(order,event());await f.owner.review({applicationId:f.application.id,status:'suspended'});
  await assert.rejects(client.referral(f.application.id,event()),delivered(403));
  await client.order({...order,revision:2,refundedBasis:1000},event());assert.equal(f.db.sqlite.prepare('SELECT commission FROM orders').get().commission,1100);
  const other=service(f.db,identity('other'));await other.saveAccount({name:'Other Owner'});await other.createBusiness({name:'Other Website',website:''});
  const otherConfigured=await commerce(f.db,identity('other')).configure({action:'connect',platform:'custom',storeUrl:home});
  const different={...f,connection:otherConfigured.connection,key:otherConfigured.key};
  await assert.rejects(rawSend(different,{kind:'referral',applicationId:f.application.id}),status(403));
  await assert.rejects(rawSend(different,{kind:'order',...order}),status(403));
  assert.equal((await commerce(f.db,identity('other')).dashboard()).orders.length,0);
  assert.equal((await commerce(f.db,identity('stranger')).partnerTracking()).orders.length,0);
});

test('custom key rotation and pause preserve attribution, and failed accounting writes roll back the receipt',async t=>{
  const f=await fixture(t),client=f.client(),referral=await client.referral(f.application.id,event()),order=snapshot(referral),delivery=event();
  f.db.sqlite.exec("CREATE TRIGGER reject_custom_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(client.order(order,delivery));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM store_events WHERE event_id=?').get(delivery.eventId).n,0);
  f.db.sqlite.exec('DROP TRIGGER reject_custom_order');await client.order(order,delivery);
  const rotated=await f.store.configure({action:'rotate',platform:'custom'});assert.ok(rotated.key);assert.equal(rotated.connection.last_seen,null);
  await assert.rejects(client.ping(),delivered(401));const fresh=f.client(f.transport,rotated.key);await fresh.ping();
  await f.store.configure({action:'disconnect',platform:'custom'});await assert.rejects(fresh.order({...order,revision:2},event()),delivered(401));
  await f.store.configure({action:'resume',platform:'custom'});await fresh.order({...order,revision:2,status:'cancelled'},event());
  assert.equal(f.db.sqlite.prepare('SELECT commission_state FROM orders').get().commission_state,'reversed');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM referrals').get().n,1);
});

test('client rejects redirects and never exposes keys or response bodies through delivery errors',async t=>{
  const f=await fixture(t);let calls=0;
  for(const code of [302,307,401,409,429,503]){
    const client=f.client(async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response('PRIVATE_ERROR '+f.key,{status:code,headers:{Location:'https://other.example'}});});
    const id=event();await assert.rejects(client.ping(id),error=>error.status===code&&error.eventId===id.eventId&&error.retryable===(code===429||code>=500)&&!JSON.stringify(error).includes(f.key)&&!error.message.includes('PRIVATE'));
  }
  assert.equal(calls,6);
});

test('client refuses malformed/oversized success responses and requires durable IDs before sending',async t=>{
  const f=await fixture(t),client=f.client(),base=snapshot({referralId:crypto.randomUUID()});
  await assert.rejects(client.referral(f.application.id),/outbox/);
  await assert.rejects(client.order(base),/outbox/);
  assert.equal(f.requests,0);
  for(const response of [new Response('<html/>',{headers:{'Content-Type':'text/html'}}),Response.json({ok:true,data:{connected:false}}),Response.json({ok:true,data:{connected:true},padding:'x'.repeat(17000)})]){
    const broken=f.client(async()=>response);await assert.rejects(broken.ping(event()),error=>error.code==='invalid-response'&&error.retryable);
  }
  for(const value of [{origin:'https://affimaro.example/path'},{origin:'http://affimaro.example'},{origin:'https://user:pass@affimaro.example'},{signingKey:'short'}])assert.throws(()=>createAffimaroClient({origin,connectionId:f.connection.id,signingKey:f.key,storeUrl:home,...value}),TypeError);
});

test('public integration downloads exactly match the tested server-only sources',()=>{
  assert.equal(readFileSync(new URL('../public/downloads/affimaro-custom.mjs',import.meta.url),'utf8'),readFileSync(new URL('../integrations/custom/affimaro.mjs',import.meta.url),'utf8'));
  assert.equal(readFileSync(new URL('../public/downloads/custom-website-setup.md',import.meta.url),'utf8'),readFileSync(new URL('../integrations/custom/README.md',import.meta.url),'utf8'));
});
