import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {launchReadiness} from '../lib/launch-readiness.ts';
const owner={userId:'launch-owner',email:'launch-owner@example.com'},other={userId:'ordinary-account',email:'ordinary@example.com'};
async function fixture(t,{mode='live'}={}){
 const db=database(t);await service(db,owner).saveAccount({name:'Launch owner'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,new Date().toISOString());
 const secret='rk_'+mode+'_FIXTUREKEYPRIVATE1234567',auth={supabaseUrl:'https://launch-fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567'};
 const config={auth,paymentKeyReady:true,maintenance:false,billing:['starter','growth','business'].map(plan=>({plan,secret,platformId:'acct_FIXTUREPLATFORM123',priceId:'price_'+plan.toUpperCase()+'FIXTURE123',mode,liveEnabled:mode==='live',required:true}))};
 const calls=[],state={autoconfirm:false,closed:false,email:true,fail:'',wrongPlan:'',hostile:null};
 const fetcher=async(url,init)=>{calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.ok(init.signal);assert.ok(!url.includes(secret));const path=new URL(url).pathname;
  if(state.hostile)return state.hostile(url,init);
  if(path===state.fail)return Response.json({private:'PRIVATE_PROVIDER_ERROR_WITH_EMAIL_AND_KEY'},{status:403});
  if(path==='/auth/v1/settings')return Response.json({external:{email:state.email},disable_signup:state.closed,mailer_autoconfirm:state.autoconfirm});
  assert.equal(new URL(url).origin,'https://api.stripe.com');assert.equal(init.headers.Authorization,'Bearer '+secret);
  if(path==='/v1/account')return Response.json({object:'account',id:'acct_FIXTUREPLATFORM123'});
  if(path==='/v1/balance')return Response.json({object:'balance',livemode:mode==='live'});
  const c=config.billing.find(p=>path==='/v1/prices/'+p.priceId);assert.ok(c);
  return Response.json({object:'price',id:c.priceId,active:true,livemode:mode==='live',currency:'usd',type:'recurring',billing_scheme:'per_unit',unit_amount:state.wrongPlan===c.plan?1:{starter:1900,growth:4900,business:9900}[c.plan],custom_unit_amount:null,transform_quantity:null,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}});
 };
 return {db,config,secret,state,calls,read:()=>launchReadiness(db,owner,config,fetcher),fetcher};
}
test('only the stored platform owner can inspect launch settings or platform-wide counts',async t=>{
 const f=await fixture(t);await assert.rejects(launchReadiness(f.db,other,f.config,f.fetcher),e=>e instanceof AppError&&e.status===403);assert.equal(f.calls.length,0);
});
test('readiness checks all three real prices with GET only and never equates email policy with customer delivery',async t=>{
 const f=await fixture(t),before=f.db.sqlite.prepare('SELECT count(*) n FROM billing_accounts').get().n,result=await f.read();
 assert.equal(result.auth.status,'ready');assert.equal(result.emailDelivery,'unverified');assert.deepEqual(result.packages.map(p=>p.status),['live_ready','live_ready','live_ready']);assert.deepEqual(result.portals.map(p=>p.portal),['brand','affiliate','creator','agency']);
 assert.equal(f.calls.filter(c=>c.url.includes('/v1/prices/')).length,3);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM billing_accounts').get().n,before);assert.ok(!JSON.stringify(result).includes(f.secret));assert.ok(!JSON.stringify(result).includes('sb_publishable_'));
});
test('test prices stay in test mode and a wrong package price cannot be marked ready',async t=>{
 const f=await fixture(t,{mode:'test'});f.state.wrongPlan='growth';const result=await f.read();assert.deepEqual(result.packages.map(p=>p.status),['test_ready','attention','test_ready']);assert.match(result.packages[1].message,/Growth/);
});
test('unconfigured payments make no Stripe request and provider errors never disclose their response',async t=>{
 const f=await fixture(t);f.config.billing=f.config.billing.map(c=>({...c,secret:undefined}));f.state.fail='/auth/v1/settings';const result=await f.read();assert.equal(result.auth.status,'unavailable');assert.ok(result.packages.every(p=>p.status==='not_configured'));assert.equal(f.calls.length,1);assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER'));
});
test('email policy reports closed signups or disabled confirmation accurately',async t=>{
 const f=await fixture(t);f.config.billing=[];f.state.closed=true;f.state.autoconfirm=true;const result=await f.read();assert.equal(result.auth.status,'attention');assert.equal(result.auth.signupOpen,false);assert.equal(result.auth.confirmationRequired,false);assert.equal(result.auth.emailEnabled,true);
});
test('readiness bounds provider responses and never follows redirects or arbitrary configured auth hosts',async t=>{
 const f=await fixture(t);f.config.billing=[];f.state.hostile=async()=>new Response('x'.repeat(32769));assert.equal((await f.read()).auth.status,'unavailable');
 f.state.hostile=async()=>new Response(null,{status:302,headers:{location:'https://evil.example'}});assert.equal((await f.read()).auth.status,'unavailable');
 const n=f.calls.length;f.config.auth.supabaseUrl='https://launch-fixture.supabase.co@evil.example';assert.equal((await f.read()).auth.status,'not_configured');assert.equal(f.calls.length,n);
});
test('provider inspection accepts public anon keys but never sends privileged auth credentials',async t=>{
 const f=await fixture(t);f.config.billing=[];f.config.auth.publishableKey='eyJ.'+btoa(JSON.stringify({role:'anon'}))+'.fixture';assert.equal((await f.read()).auth.status,'ready');
 const n=f.calls.length;for(const key of ['sb_secret_PRIVATE','eyJ.'+btoa(JSON.stringify({role:'service_role'}))+'.fixture']){f.config.auth.publishableKey=key;assert.equal((await f.read()).auth.status,'not_configured');}assert.equal(f.calls.length,n);
});
