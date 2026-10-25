import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {agencyPair} from './support/order-history.js';
import {seedPayout} from './support/payment-history.js';
import {portalUpdates,parseUpdateFilters,updatesQuery} from '../lib/portal-updates.ts';
import {updatePresentation,updatesPath} from '../lib/portal-updates-model.ts';
import {accountSettings} from '../lib/account-settings.ts';
import {defaultPreferences} from '../lib/account-preferences.ts';
import {ownerOverview} from '../lib/owner.ts';
import {submitContact,contactInbox} from '../lib/contact-inbox.ts';
import {AppError,service} from '../lib/service.ts';
const fails=status=>e=>e instanceof AppError&&e.status===status,all={range:'all'};
function invitation(f,sender,recipient,program,status='pending',at='2026-10-24T10:00:00.000Z'){
 const id=crypto.randomUUID();f.db.sqlite.prepare('INSERT INTO discovery_invitations VALUES (?,?,?,?,?,?,?,?)').run(id,sender.userId,recipient.userId,program.id,'PRIVATE_INVITATION_NOTE',status,at,at);return id;
}
test('all four update portals isolate program applications, invitations and payment records by actual stored account role',async t=>{
 const f=await partnerFixture(t),pair=await agencyPair(f),agencyProgram=f.db.sqlite.prepare('SELECT p.* FROM programs p JOIN applications a ON a.program_id=p.id WHERE a.id=?').get(pair.application.id),brandInvite=invitation(f,f.brand,f.affiliate,f.program),agencyInvite=invitation(f,f.agency,f.creator,agencyProgram),brandPay=seedPayout(f),agencyPay=seedPayout(f,pair.application,agencyProgram.workspace_id,f.creator);
 for(const [user,expected,foreign] of [[f.brand,[f.application.id,f.pending.id,brandInvite,brandPay.id],[agencyInvite,agencyPay.id,pair.application.id]],[f.affiliate,[f.application.id,brandInvite,brandPay.id],[agencyInvite,agencyPay.id,f.pending.id]],[f.agency,[pair.application.id,agencyInvite,agencyPay.id],[brandInvite,brandPay.id,f.application.id]],[f.creator,[pair.application.id,agencyInvite,agencyPay.id,f.pending.id],[brandInvite,brandPay.id,f.application.id]]]){
  const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,data=await portalUpdates(f.db,{...user,role:'owner',user_metadata:{role:'agency'}},all),ids=data.rows.map(r=>r.id);for(const id of expected)assert.ok(ids.includes(id),user.userId+' '+id);for(const id of foreign)assert.ok(!ids.includes(id),user.userId+' '+id);assert.equal(data.portal,user.userId);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);
  const raw=JSON.stringify(data);assert.ok(!/PRIVATE_|encrypted_|account_hint|review_note|email|signing_key|token_hash/.test(raw));
 }
 assert.equal((await portalUpdates(f.db,f.foreignBrand,all)).summary.total,0);
});
test('update views show the current saved state once per record and do not create a fabricated event history',async t=>{const f=await partnerFixture(t),id=f.application.id;let data=await portalUpdates(f.db,f.affiliate,all);assert.equal(data.rows.filter(r=>r.id===id).length,1);assert.equal(data.rows.find(r=>r.id===id).status,'approved');f.db.sqlite.prepare('UPDATE applications SET status=?,updated_at=? WHERE id=?').run('suspended','2026-10-25T12:00:00.000Z',id);data=await portalUpdates(f.db,f.affiliate,all);assert.equal(data.rows.filter(r=>r.id===id).length,1);const row=data.rows.find(r=>r.id===id);assert.equal(row.status,'suspended');assert.equal(updatePresentation(row,'affiliate').title,'Partnership suspended');});
test('category, UTC date window and literal search use the same filtered rows and summary',async t=>{
 const f=await partnerFixture(t),p=seedPayout(f,undefined,undefined,undefined,{at:'2026-10-01T10:00:00.000Z'}),clock=new Date('2026-10-25T23:59:59.000Z');f.db.sqlite.prepare('UPDATE payout_requests SET updated_at=? WHERE id=?').run('2026-10-19T00:00:00.000Z',p.id);
 let d=await portalUpdates(f.db,f.affiliate,{category:'payments',range:'7d'},clock);assert.equal(d.summary.total,1);assert.equal(d.summary.payments,1);assert.equal(d.summary.applications,0);assert.equal(d.rows[0].created_at,'2026-10-01T10:00:00.000Z');f.db.sqlite.prepare('UPDATE payout_requests SET updated_at=? WHERE id=?').run('2026-10-18T23:59:59.999Z',p.id);assert.equal((await portalUpdates(f.db,f.affiliate,{category:'payments',range:'7d'},clock)).summary.total,0);
 for(const q of ['%','_',"' OR 1=1 --"]){d=await portalUpdates(f.db,f.affiliate,{...all,q},clock);assert.equal(d.summary.total,0);assert.equal(d.pages,0);assert.equal(d.filters.page,1);}
 f.db.sqlite.prepare('UPDATE workspaces SET name=? WHERE id=?').run('Literal %_ Brand',f.program.workspace_id);d=await portalUpdates(f.db,f.affiliate,{...all,q:'%_'});assert.equal(d.summary.total,2);assert.equal(d.rows.length,2);
});
test('preference-sized pages remain deterministic, recover a changed last page and retain category and date filters',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<52;i++)seedPayout(f,undefined,undefined,undefined,{at:'2026-10-24T10:00:00.000Z'});let d=await portalUpdates(f.db,f.affiliate,{...all,category:'payments',page:3});assert.equal(d.summary.total,52);assert.equal(d.pages,3);assert.equal(d.rows.length,2);const first=await portalUpdates(f.db,f.affiliate,{...all,category:'payments'}),second=await portalUpdates(f.db,f.affiliate,{...all,category:'payments',page:2});assert.equal(new Set([...first.rows,...second.rows,...d.rows].map(r=>r.id)).size,52);
 for(const row of d.rows)f.db.sqlite.prepare('DELETE FROM payout_requests WHERE id=?').run(row.id);d=await portalUpdates(f.db,f.affiliate,{...all,category:'payments',page:3});assert.equal(d.filters.page,2);assert.equal(d.rows.length,25);assert.equal(d.summary.total,50);
 await accountSettings(f.db,f.affiliate).savePreferences({revision:0,preferences:{...defaultPreferences,pageSize:50}});d=await portalUpdates(f.db,f.affiliate,{...all,category:'payments',page:99});assert.equal(d.pageSize,50);assert.equal(d.filters.page,1);assert.equal(d.rows.length,50);assert.equal(updatesQuery(d.filters,{page:2}),'category=payments&range=all&page=2');
});
test('closed, unapproved and owner accounts cannot read a customer update feed',async t=>{
 const f=await partnerFixture(t);await assert.rejects(portalUpdates(f.db,f.operator),fails(403));f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.affiliate.userId);await assert.rejects(portalUpdates(f.db,f.affiliate),fails(403));f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run(f.creator.userId,'Fixture closure',new Date().toISOString());await assert.rejects(portalUpdates(f.db,f.creator),fails(403));
});
test('updates preserve payment meaning and separate currency precision without treating a transfer as bank receipt',async t=>{
 const f=await partnerFixture(t);for(const change of [{status:'requested',currency:'JPY',decimals:0},{status:'paid'},{status:'transferred',method:'stripe',reversed:0},{status:'transferred',method:'stripe',reversed:200},{status:'transferred',method:'stripe',reversed:1000}])seedPayout(f,undefined,undefined,undefined,change);
 const data=await portalUpdates(f.db,f.affiliate,{...all,category:'payments'});assert.equal(data.summary.total,5);const texts=data.rows.map(r=>updatePresentation(r,'affiliate'));assert.ok(texts.some(t=>t.title==='Recorded paid'&&t.description.includes('not independently verified')));assert.ok(texts.some(t=>t.title==='Sent to Stripe'&&t.description.includes('does not confirm')));assert.ok(texts.some(t=>t.title==='Partly reversed'));assert.ok(texts.some(t=>t.title==='Stripe reversed'));for(let i=0;i<data.rows.length;i++){assert.equal(new URL(texts[i].href,'https://app.invalid').searchParams.get('request'),data.rows[i].id);assert.ok(texts[i].href.startsWith('/partner/payment-history?'));}assert.equal(data.rows.find(r=>r.currency==='JPY').decimals,0);
});
test('superseded invitations and closed counterparties point to retained records without suggesting automatic approval',async t=>{
 const f=await partnerFixture(t);invitation(f,f.brand,f.creator,f.program);f.db.sqlite.prepare("UPDATE applications SET status='rejected',updated_at='2026-10-25T12:00:00.000Z' WHERE id=?").run(f.pending.id);let data=await portalUpdates(f.db,f.creator,{...all,category:'invitations'});assert.equal(data.rows[0].superseded,1);assert.match(updatePresentation(data.rows[0],'creator').title,/decision changed/);
 f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run(f.brand.userId,'Fixture',new Date().toISOString());data=await portalUpdates(f.db,f.affiliate,all);const row=data.rows.find(r=>r.id===f.application.id),view=updatePresentation(row,'affiliate');assert.equal(row.counterparty_closed,1);assert.equal(view.href,'/partner/brands?tab=approved');assert.match(view.description,/closed/);
});
test('strict filters reject arrays, unsupported fields, bad ranges and oversized input',()=>{for(const raw of [{page:['1','2']},{q:['private','other']},{category:'owner'},{range:'1year'},{q:'x'.repeat(101)},{userId:'foreign'},{page:0},{page:'9999999'}])assert.throws(()=>parseUpdateFilters(raw),fails(400));assert.equal(parseUpdateFilters({page:'2'}).page,2);for(const p of ['brand','affiliate','creator','agency'])assert.ok(updatesPath(p).startsWith('/'));});
test('inconsistent legacy invitation senders and payout workspace links cannot expose another program’s records',async t=>{
 const f=await partnerFixture(t);await service(f.db,f.foreignBrand).businessDashboard();const foreign=f.db.sqlite.prepare('SELECT id FROM workspaces WHERE owner_id=?').get(f.foreignBrand.userId),invited=invitation(f,f.agency,f.affiliate,f.program),pay=seedPayout(f,f.application,foreign.id,f.affiliate);
 for(const user of [f.brand,f.affiliate,f.agency,f.foreignBrand]){const data=await portalUpdates(f.db,user,all);assert.ok(!data.rows.some(r=>r.id===invited||r.id===pay.id));}
});
test('owner attention counts new and in-progress contact messages separately, follows status changes and never returns their body',async t=>{
 const f=await partnerFixture(t),body={name:'Website visitor',email:'visitor@example.com',topic:'other',message:'PRIVATE_SUPPORT_MESSAGE needing assistance with the Affimaro portal.'},sent=await submitContact(f.db,body,'192.0.2.30'),inbox=contactInbox(f.db,f.operator);let overview=await ownerOverview(f.db,f.operator);assert.equal(overview.counts.new_contact_messages,1);assert.equal(overview.counts.contact_in_progress,0);assert.ok(!JSON.stringify(overview).includes('PRIVATE_SUPPORT_MESSAGE'));await inbox.update({id:sent.reference,revision:1,status:'in_progress'});overview=await ownerOverview(f.db,f.operator);assert.equal(overview.counts.new_contact_messages,0);assert.equal(overview.counts.contact_in_progress,1);await inbox.update({id:sent.reference,revision:2,status:'closed'});overview=await ownerOverview(f.db,f.operator);assert.equal(overview.counts.contact_in_progress,0);await assert.rejects(ownerOverview(f.db,f.affiliate),fails(403));
});
