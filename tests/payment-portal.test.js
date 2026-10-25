import {identityVerification} from '../lib/identity-verification.ts';
import {syntheticJpeg} from './support/identity-photos.js';
import {seedApprovedIdentity} from './support/identity-approval.js';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {partnerFixture} from './support/partner-workspace.js';
import {service} from '../lib/service.ts';
import {sealPayment} from '../lib/payment-crypto.ts';
import {commissionReviewStatus,payoutStatus} from '../lib/payment-status.ts';
const key='ab'.repeat(32),root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'payment-portal-tests-'));
after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__payoutViewDb;delete globalThis.__payoutViewUser;});
const bundle=await build({stdin:{contents:"export {POST as paymentAction} from './app/api/payments/route';export {WalletCard,PayoutCard} from './app/payment-cards';export {Shell} from './app/ui';export {default as AffiliateIdentityPage} from './app/partner/identity/page';export {default as CreatorIdentityPage} from './app/creator/identity/page';export {default as OwnerIdentityPage} from './app/owner/identity/page';export {default as PaymentsPage} from './app/payments/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'payment-portal-fixture',setup(b){b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?"export const env=new Proxy({},{get(_,k){return k==='DB'?globalThis.__payoutViewDb:k==='PAYMENT_DATA_KEY_V1'?'ab'.repeat(32):undefined;}});":a.path==='next/headers'?"export async function headers(){const u=globalThis.__payoutViewUser;return new Headers(u?{'oai-authenticated-user-id':u.userId,'oai-authenticated-user-email':u.email}:{});}":"export function redirect(location){throw Object.assign(new Error('Redirect'),{location});}export function notFound(){throw Object.assign(new Error('Not found'),{notFound:true});}",loader:'js'}));}}]});
const path=join(temp,'payments.mjs');writeFileSync(path,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(path).href);
const bank={beneficiary:'Fixture Partner',bank:'Fixture Bank',country:'US',currency:'USD',account:'123456789012',swift:'EXAMUS33',routing:'012345678',address:'Fixture address'};
async function savedRequest(f,business,partner,application){
 const id=crypto.randomUUID(),workspace=(await service(f.db,business).businessDashboard()).business,at=new Date().toISOString(),destination=await sealPayment(bank,key,'bank/'+partner.userId);
 f.db.sqlite.prepare("INSERT INTO payout_requests(id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,encrypted_destination,account_hint,method,created_at,updated_at) VALUES (?,?,?,?,'USD',2,1200,'requested',?,'9012','bank',?,?)").run(id,workspace.id,application.id,partner.userId,destination,at,at);
 return id;
}
const detailRequest=id=>new Request('https://affimaro.example/api/payments',{method:'POST',headers:{Origin:'https://affimaro.example','Content-Type':'application/json'},body:JSON.stringify({action:'details',data:{requestId:id}})});

test('identity navigation and actual private pages are scoped to recipient portals and owner review exposes no document props',async t=>{
 const f=await partnerFixture(t);globalThis.__payoutViewDb=f.db;
 for(const portal of ['brand','agency','affiliate','creator']){const html=renderToStaticMarkup(createElement(views.Shell,{portal,name:'Member',email:'member@example.com',active:'identity',children:'Content'}));assert.equal(html.includes('Identity verification'),['affiliate','creator'].includes(portal));}
 for(const [role,page] of [['affiliate','AffiliateIdentityPage'],['creator','CreatorIdentityPage']]){globalThis.__payoutViewUser=f[role];const html=renderToStaticMarkup(await views[page]());for(const text of ['Full legal name','Country / territory of residence','Selfie holding your document','Submit for identity review','New payment requests'])assert.ok(html.includes(text),role+': '+text);assert.ok(!html.includes('TEST_ONLY_ENCRYPTED_PROFILE'));}
 const privateName='Private Fictional Identity';await identityVerification(f.db,f.affiliate,key).submit({fullName:privateName,country:'US',documentType:'passport',consent:true,revision:0},{front:syntheticJpeg(),selfie:syntheticJpeg()});globalThis.__payoutViewUser=f.operator;const html=renderToStaticMarkup(await views.OwnerIdentityPage({searchParams:Promise.resolve({})}));assert.ok(html.includes('Open private review'));assert.ok(html.includes(f.affiliate.email));assert.ok(!html.includes(privateName));assert.ok(!html.includes('encrypted_content'));assert.ok(!html.includes('data:image/jpeg'));globalThis.__payoutViewUser=f.brand;await assert.rejects(views.AffiliateIdentityPage(),e=>e.location==='/workspace');globalThis.__payoutViewUser=f.affiliate;await assert.rejects(views.OwnerIdentityPage({searchParams:Promise.resolve({})}),e=>e.status===403);
});
test('unverified wallet controls show the recorded balance but disable both payment methods',()=>{
 const wallet={application_id:crypto.randomUUID(),workspace_id:crypto.randomUUID(),business_name:'Fixture',partner_name:'Partner',affiliate_user_id:'fixture',application_status:'approved',identity_approved:0,currency:'USD',decimals:2,estimated:3200,approved:3200,paid:0,reserved:0,available:3200,debt:0},bank={user_id:'fixture',account_hint:'9012',currency:'USD',updated_at:new Date().toISOString()},html=renderToStaticMarkup(createElement(views.WalletCard,{wallet,merchant:false,bank,stripeReady:true}));assert.ok(html.includes('HELD FOR IDENTITY REVIEW'));assert.ok(html.includes('$32.00'));assert.equal((html.match(/<button[^>]*disabled=""/g)||[]).length,2);
});

test('payment details work for both business roles and their own partner, while foreign accounts and wrong partners are denied',async t=>{
 const f=await partnerFixture(t);globalThis.__payoutViewDb=f.db;
 const agencyProgram=(await service(f.db,f.agency).businessDashboard()).program,agencyApplication=await service(f.db,f.creator).apply({programId:agencyProgram.id});await service(f.db,f.agency).review({applicationId:agencyApplication.id,status:'approved'});
 for(const [business,partner,application] of [[f.brand,f.affiliate,f.application],[f.agency,f.creator,agencyApplication]]){
  seedApprovedIdentity(f.db,partner.userId,partner===f.creator?'creator':'affiliate');const id=await savedRequest(f,business,partner,application);
  for(const actor of [business,partner]){globalThis.__payoutViewUser=actor;const response=await views.paymentAction(detailRequest(id));assert.equal(response.status,200,actor.userId);const data=await response.json();assert.equal(data.data.destination.account,bank.account);assert.equal(data.data.receipt,null);assert.ok(!JSON.stringify(data).includes('encrypted_destination'));}
  for(const actor of [f.foreignBrand,business===f.brand?f.agency:f.brand,partner===f.affiliate?f.creator:f.affiliate,f.operator]){globalThis.__payoutViewUser=actor;const response=await views.paymentAction(detailRequest(id));assert.ok([403,404].includes(response.status),actor.userId);assert.ok(!(await response.text()).includes(bank.account));}
  assert.equal(f.db.sqlite.prepare('SELECT status FROM payout_requests WHERE id=?').get(id).status,'requested');
 }
 globalThis.__payoutViewUser=null;assert.equal((await views.paymentAction(detailRequest(crypto.randomUUID()))).status,401);
});

test('wallet request controls follow the complete reserved balance even when a request is outside the displayed latest hundred',()=>{
 const wallet={application_id:crypto.randomUUID(),workspace_id:crypto.randomUUID(),business_name:'Fixture Business',partner_name:'Fixture Partner',affiliate_user_id:'fixture',application_status:'approved',identity_approved:1,currency:'USD',decimals:2,estimated:3200,approved:3200,paid:0,reserved:1200,available:2000,debt:0},profile={user_id:'fixture',account_hint:'9012',currency:'USD',updated_at:new Date().toISOString()};
 const html=renderToStaticMarkup(createElement(views.WalletCard,{wallet,merchant:false,bank:profile,stripeReady:true}));
 assert.match(html,/Complete or cancel the open request/);
 for(const text of ['Request bank payment','Request USD to Stripe'])assert.match(html,new RegExp('<button[^>]*disabled=""[^>]*>'+text));
 const available=renderToStaticMarkup(createElement(views.WalletCard,{wallet:{...wallet,reserved:0},merchant:false,bank:profile,stripeReady:true}));
 assert.doesNotMatch(available,/<button[^>]*disabled=""/);
});

test('commission review never labels an unresolved or unapproved source as approved',()=>{
 const base={commission:1200,approved_amount:1200,commission_state:'accrued',sync_ready:1};
 assert.deepEqual(commissionReviewStatus(base),{label:'Approved',canApprove:false});
 assert.deepEqual(commissionReviewStatus({...base,commission_state:'review'}),{label:'Needs source review',canApprove:false});
 assert.deepEqual(commissionReviewStatus({...base,approved_amount:0}),{label:'Awaiting approval',canApprove:true});
 assert.deepEqual(commissionReviewStatus({...base,approved_amount:100,sync_ready:0}),{label:'Store sync needed',canApprove:false});
 for(const state of ['pending','reversed','ineligible'])assert.equal(commissionReviewStatus({...base,commission_state:state}).canApprove,false);
 assert.equal(commissionReviewStatus({...base,commission:0}).label,'No payable commission');
});

test('request approval is not a completed payment and recorded bank transfers are distinguished from verified Stripe account credit',()=>{
 const base={status:'approved',method:'bank',amount:1200,reversed_amount:0};
 assert.match(payoutStatus(base).description,/not been recorded/);
 assert.match(payoutStatus({...base,status:'paid'}).description,/not independently verified/);
 assert.match(payoutStatus({...base,status:'processing',method:'stripe'}).description,/not confirmed/);
 assert.match(payoutStatus({...base,status:'transferred',method:'stripe'}).description,/does not confirm.*bank/);
 assert.equal(payoutStatus({...base,status:'transferred',method:'stripe',reversed_amount:600}).label,'Partly reversed');
 assert.equal(payoutStatus({...base,status:'transferred',method:'stripe',reversed_amount:1200}).label,'Stripe reversed');
 for(const status of ['cancelled','rejected'])assert.match(payoutStatus({...base,status}).description,/no longer reserves/);
 assert.equal(payoutStatus({...base,status:'unknown'}).label,'Needs review');
 const html=renderToStaticMarkup(createElement(views.PayoutCard,{request:{...base,currency:'USD',decimals:2,id:crypto.randomUUID(),account_hint:'9012',created_at:new Date().toISOString(),paid_date:null,reason:null},merchant:false}));
 assert.match(html,/Approved · awaiting payment/);assert.match(html,/completed payment has not been recorded/);assert.ok(!html.includes('Cancel request'));
});
