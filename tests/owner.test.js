import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {ownerRecords,ownerOverview,ownerAccount,ownerDatasets} from '../lib/owner.ts';
import {admissionGate} from '../lib/admission-gate.ts';
import {readFileSync} from 'node:fs';
import {marketingPages,renderMarketingDocument} from '../lib/marketing-content.mjs';
const owner={userId:'platform-owner',email:'owner@example.com'},at='2026-10-18T12:00:00.000Z';
const denied=e=>e instanceof AppError&&e.status===403;
async function fixture(t){
 const db=database(t);await service(db,owner).saveAccount({name:'Platform owner'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,at);
 for(const portal of ['brand','affiliate','creator','agency']){await service(db,{userId:portal,email:portal+'@example.com'}).saveAccount({name:portal+' account'});db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run(portal,portal,at);db.sqlite.prepare("INSERT INTO platform_applications(user_id,portal,status,created_at,updated_at) VALUES (?,?,'approved',?,?)").run(portal,['brand','agency'].includes(portal)?'brand':'affiliate',at,at);}
 return db;
}
test('only the stored owner grant can query any global dataset, overview or account profile',async t=>{
 const db=await fixture(t);
 for(const id of ['brand','affiliate','creator','agency','unknown']){const identity={userId:id,email:owner.email,role:'owner'};for(const key of Object.keys(ownerDatasets))await assert.rejects(ownerRecords(db,identity,key),denied);await assert.rejects(ownerOverview(db,identity),denied);await assert.rejects(ownerAccount(db,identity,owner.userId),denied);}
 const result=await ownerRecords(db,owner,'users');assert.equal(result.total,5);assert.equal(result.rows.find(r=>r.id===owner.userId).portal,'owner');assert.deepEqual(new Set(result.rows.map(r=>r.portal)),new Set(['owner','brand','affiliate','creator','agency']));
 db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(owner.userId);await assert.rejects(ownerOverview(db,owner),denied);
});
test('the owner directory preserves exact roles, searches literal input, rejects dataset injection and paginates without duplicates',async t=>{
 const db=await fixture(t);
 for(const p of ['brand','affiliate','creator','agency','owner']){const data=await ownerRecords(db,owner,'users',{role:p});assert.equal(data.total,1);assert.equal(data.rows[0].portal,p);}
 assert.equal((await ownerRecords(db,owner,'users',{q:"' OR 1=1 --"})).total,0);assert.equal((await ownerRecords(db,owner,'users',{q:'%'})).total,0);assert.equal((await ownerRecords(db,owner,'users',{q:'CREATOR@'})).rows[0].id,'creator');
 for(const key of ['auth_sessions','bank_profiles','__proto__','constructor','users; DROP TABLE accounts'])await assert.rejects(ownerRecords(db,owner,key),e=>e.status===404);
 for(let n=0;n<60;n++)db.sqlite.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run('extra-'+String(n).padStart(2,'0'),'extra-'+n+'@example.com','Extra '+n,at);
 const first=await ownerRecords(db,owner,'users'),second=await ownerRecords(db,owner,'users',{page:'2'});assert.equal(first.total,65);assert.equal(first.rows.length,50);assert.equal(second.rows.length,15);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,65);assert.equal((await ownerRecords(db,owner,'users',{page:'-1'})).page,1);
});
test('operational projections retain real amounts and never return stored provider credentials or bank destinations',async t=>{
 const db=await fixture(t),workspace=await service(db,{userId:'brand',email:'brand@example.com'}).createBusiness({name:'Brand workspace',website:''}),program=db.sqlite.prepare('SELECT id FROM programs WHERE workspace_id=?').get(workspace.id).id;
 db.sqlite.prepare("INSERT INTO applications(id,program_id,affiliate_user_id,status,created_at,updated_at) VALUES ('partnership',?,'affiliate','approved',?,?)").run(program,at,at);
 db.sqlite.prepare("INSERT INTO store_connections(id,workspace_id,store_url,signing_key,active,created_at) VALUES ('store',?,'https://merchant.example','PRIVATE_STORE_SIGNING_KEY',1,?)").run(workspace.id,at);
 db.sqlite.prepare("INSERT INTO referrals VALUES ('referral','store','partnership',1000,?,?)").run(at,'2026-11-18T12:00:00.000Z');
 for(const [id,currency,decimals,basis,refund,commission] of [['usd','USD',2,10000,2000,800],['afn','AFN',0,1000,0,100]])db.sqlite.prepare("INSERT INTO orders(id,store_id,referral_id,application_id,external_id,revision,currency,decimals,basis,refunded_basis,rate_bps,commission,status,commission_state,needs_review,created_at,received_at) VALUES (?,'store','referral','partnership',?,1,?,?,?,?,1000,?,'paid','accrued',0,?,?)").run(id,id,currency,decimals,basis,refund,commission,at,at);
 db.sqlite.prepare("INSERT INTO payout_requests(id,workspace_id,application_id,affiliate_user_id,currency,decimals,amount,status,encrypted_destination,account_hint,created_at,updated_at) VALUES ('payout',?,'partnership','affiliate','USD',2,800,'requested','PRIVATE_BANK_CIPHERTEXT','****1234',?,?)").run(workspace.id,at,at);
 db.sqlite.prepare("INSERT INTO billing_accounts(id,workspace_id,platform_id,mode,created_at,updated_at) VALUES ('bill',?,'acct_fixture','live',?,?)").run(workspace.id,at,at);
 db.sqlite.prepare("INSERT INTO agency_clients VALUES ('client','agency','Agency client','https://client.example','contact@example.com','active','PRIVATE_DIRECTORY_NOTE',?,?)").run(at,at);
 db.sqlite.prepare("INSERT INTO creator_content VALUES ('content','creator',NULL,'Creator plan','Blog','idea',NULL,'PRIVATE_CREATOR_NOTE',?,?)").run(at,at);
 for(const key of Object.keys(ownerDatasets)){const data=await ownerRecords(db,owner,key);assert.ok(data.rows.length>0,key);const json=JSON.stringify(data);assert.ok(!/PRIVATE_|encrypted_|signing_key|token_hash/.test(json),key);}
 const overview=await ownerOverview(db,owner);assert.equal(overview.roles.filter(r=>r.portal!=='owner').reduce((n,r)=>n+r.total,0),4);assert.equal(overview.counts.programs,1);assert.equal(overview.counts.open_payouts,1);assert.equal(overview.money.find(r=>r.currency==='USD').net_sales,8000);assert.equal(overview.money.find(r=>r.currency==='AFN').net_sales,1000);
 const detail=await ownerAccount(db,owner,'brand');assert.equal(detail.totals.workspaces,1);assert.equal(detail.detail.account.email,'brand@example.com');
});
test('owner routes reject every customer role and a revoked owner while customer homes route the granted owner to the independent control panel',async t=>{
 const db=await fixture(t);
 for(const path of ['/owner','/owner/users','/owner/data?table=payouts','/owner/settings','/admin/setup','/api/owner/records','/api/admin/applications'])for(const id of ['brand','affiliate','creator','agency']){const response=await admissionGate(new Request('https://affimaro.example'+path),db,{userId:id,email:id+'@example.com'});assert.equal(response.status,403);assert.match(response.headers.get('cache-control'),/no-store/);}
 for(const path of ['/account','/workspace','/partner','/creator','/agency','/application','/billing']){const response=await admissionGate(new Request('https://affimaro.example'+path),db,owner);assert.equal(response.status,307);assert.equal(response.headers.get('location'),'/owner');}
 assert.equal(await admissionGate(new Request('https://affimaro.example/owner'),db,owner),null);
 db.sqlite.prepare('DELETE FROM platform_admins').run();assert.equal((await admissionGate(new Request('https://affimaro.example/owner'),db,owner)).status,403);
});
test('public pages and customer downloads contain no platform administration links or operator setup variables',()=>{
 const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8');
 for(const path of Object.keys(marketingPages)){const html=renderMarketingDocument(path,sprite);assert.ok(!/href="\/(?:owner|admin|auth\/owner)(?:[/?"])/.test(html),path);assert.ok(!/AUTH_SESSION_ENCRYPTION_KEY|AFFIMARO_BILLING_|PAYMENT_DATA_KEY_V1/.test(html),path);}
 for(const file of ['subscriptions-setup.md','payments-setup.md']){const text=readFileSync(new URL('../public/downloads/'+file,import.meta.url),'utf8');assert.ok(!/\/admin\/|AFFIMARO_BILLING_|PAYMENT_DATA_KEY_V1|AUTH_SESSION_ENCRYPTION_KEY/.test(text),file);}
});
