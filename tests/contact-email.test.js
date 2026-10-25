import test from 'node:test';
import assert from 'node:assert/strict';
import {queueFixture,seedApplicant} from './support/admission-queue.js';
import {submitContact} from '../lib/contact-inbox.ts';
import {contactEmailSetup,saveContactEmailSetup,queueContactReceipt,deliverContactReceipt,contactReceiptSummary,retryContactReceipt} from '../lib/contact-email.ts';
const key='cd'.repeat(32),secret='re_fixture_sending_key_for_contact',at=Date.parse('2026-10-25T00:00:00Z');
const body={name:'A visitor',email:' VISITOR@Example.com ',topic:'other',message:'A private message <a href="https://untrusted.example">must not be echoed in receipts</a>.'};
const providerId='bcb61473-fb72-4fe1-9183-c294cae46491';
const accepted=()=>Response.json({id:providerId});
async function fixture(t,enabled=true){const f=await queueFixture(t),message=await submitContact(f.db,body,null,at);await queueContactReceipt(f.db,message.reference);if(enabled)await saveContactEmailSetup(f.db,f.owner,key,{action:'configure',revision:0,enabled:true,apiKey:secret});return {...f,id:message.reference};}
const state=(db,id)=>db.sqlite.prepare('SELECT * FROM contact_receipts WHERE message_id=?').get(id);

test('owner-only email settings encrypt the sending key, check revisions and expose no secret',async t=>{
 const f=await queueFixture(t),member=seedApplicant(f,'member','creator',{status:'approved'}),input={action:'configure',revision:0,enabled:true,apiKey:secret};
 assert.equal((await contactEmailSetup(f.db,f.owner)).configured,false);await assert.rejects(saveContactEmailSetup(f.db,member,key,input),e=>e.status===403);
 const saved=await saveContactEmailSetup(f.db,f.owner,key,input);assert.equal(saved.enabled,true);assert.equal(saved.revision,1);assert.ok(!JSON.stringify(saved).includes(secret));const stored=f.db.sqlite.prepare('SELECT * FROM contact_email_settings').get();assert.ok(stored.encrypted_credential.startsWith('v1.'));assert.ok(!JSON.stringify(stored).includes(secret));
 await assert.rejects(saveContactEmailSetup(f.db,f.owner,key,input),e=>e.status===409);
 const paused=await saveContactEmailSetup(f.db,f.owner,key,{action:'configure',revision:1,enabled:false});assert.equal(paused.revision,2);assert.equal(paused.enabled,false);
 f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.owner.userId,new Date(at).toISOString());await assert.rejects(contactEmailSetup(f.db,f.owner),e=>e.status===403);
});

test('email settings recheck the owner grant at the write after encrypted-key preparation',async t=>{
 const f=await fixture(t),input={action:'configure',revision:1,enabled:false};let changed=false;
 function wrap(statement,sql){return {...statement,bind(...args){return wrap(statement.bind(...args),sql);},async run(){if(!changed&&sql.startsWith('UPDATE contact_email_settings')){changed=true;f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);}return statement.run();}};}
 const db={...f.db,prepare(sql){return wrap(f.db.prepare(sql),sql);}};await assert.rejects(saveContactEmailSetup(db,f.owner,key,input),e=>e.status===409);assert.equal(f.db.sqlite.prepare('SELECT enabled FROM contact_email_settings').get().enabled,1);
});

test('receipt numbers are short and stable; retries do not consume new numbers and missing messages cannot queue emails',async t=>{
 const f=await fixture(t,false);await queueContactReceipt(f.db,crypto.randomUUID());for(let i=0;i<8;i++)await queueContactReceipt(f.db,f.id);
 const next=await submitContact(f.db,{...body,email:'next@example.com'},null,at);await queueContactReceipt(f.db,next.reference);
 const one=await contactReceiptSummary(f.db,f.owner,f.id),two=await contactReceiptSummary(f.db,f.owner,next.reference);assert.match(one.reference,/^[0-9]{8}$/);assert.equal(Number(two.reference),Number(one.reference)+1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM contact_receipts').get().n,2);
 let calls=0;await deliverContactReceipt(f.db,f.id,key,async()=>{calls++;return accepted();},at);assert.equal(calls,0);assert.equal(state(f.db,f.id).status,'pending');
});

test('receipt email goes only to the stored address with its numeric reference and no private message or UUID',async t=>{
 const f=await fixture(t),calls=[];await deliverContactReceipt(f.db,f.id,key,async(url,init)=>{calls.push({url,init});return accepted();},at);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(calls[0].init.redirect,'manual');assert.equal(calls[0].init.headers.Authorization,'Bearer '+secret);
 const payload=JSON.parse(calls[0].init.body),summary=await contactReceiptSummary(f.db,f.owner,f.id);assert.deepEqual(payload.to,['visitor@example.com']);assert.equal(payload.from,'Affimaro <noreply@affimaro.com>');assert.ok(payload.text.includes(summary.reference));assert.ok(payload.html.includes(summary.reference));assert.ok(!JSON.stringify(payload).includes(f.id));assert.ok(!JSON.stringify(payload).includes('untrusted.example'));assert.equal(summary.status,'accepted');
 await deliverContactReceipt(f.db,f.id,key,async()=>{assert.fail('An accepted receipt was sent twice');},at+61000);assert.equal(state(f.db,f.id).provider_id,providerId);
});

test('uncertain delivery retries reuse the frozen email and idempotency key; expired windows require review',async t=>{
 const f=await fixture(t),calls=[];const fetcher=async(_url,init)=>{calls.push(init);if(calls.length===1)throw new Error('Uncertain provider response');return accepted();};
 await deliverContactReceipt(f.db,f.id,key,fetcher,at);assert.equal(state(f.db,f.id).status,'failed');await deliverContactReceipt(f.db,f.id,key,fetcher,at+100);assert.equal(calls.length,1);
 await deliverContactReceipt(f.db,f.id,key,fetcher,at+61000);assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(state(f.db,f.id).status,'accepted');
 const second=await submitContact(f.db,{...body,email:'late@example.com'},null,at);await queueContactReceipt(f.db,second.reference);await deliverContactReceipt(f.db,second.reference,key,async()=>{throw new Error('Uncertain');},at);await deliverContactReceipt(f.db,second.reference,key,async()=>{assert.fail('Expired provider deduplication window was retried');},at+24*3600000);assert.equal(state(f.db,second.reference).status,'review');
});

test('concurrent requests share a single delivery lease and leave accepted receipts unchanged',async t=>{
 const f=await fixture(t);let finish,calls=0;const first=deliverContactReceipt(f.db,f.id,key,async()=>{calls++;return new Promise(resolve=>{finish=resolve;});},at);
 for(let i=0;i<2000&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(finish,'Delivery did not reach the provider fixture');await deliverContactReceipt(f.db,f.id,key,async()=>{assert.fail('A concurrent receipt bypassed the lease');},at+1);assert.equal(calls,1);finish(accepted());await first;assert.equal(state(f.db,f.id).status,'accepted');
});

test('provider redirects, malformed acknowledgements and excessive bodies never claim delivery',async t=>{
 for(const response of [()=>new Response('Redirect',{status:302,headers:{Location:'https://untrusted.example'}}),()=>Response.json({id:'invalid'}),()=>new Response('x'.repeat(16385))]){const f=await fixture(t);await deliverContactReceipt(f.db,f.id,key,async()=>response(),at);const row=state(f.db,f.id);assert.equal(row.status,'failed');assert.equal(row.provider_id,null);assert.equal(row.accepted_at,null);assert.equal(row.lease_id,null);}
});

test('disabled sender grants and member retries cannot send confirmation emails',async t=>{
 const f=await fixture(t),member=seedApplicant(f,'member','affiliate',{status:'approved'});await assert.rejects(retryContactReceipt(f.db,member,key,{action:'retry',id:f.id}),e=>e.status===403);
 f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);await deliverContactReceipt(f.db,f.id,key,async()=>{assert.fail('A revoked sender grant sent mail');},at);assert.equal(state(f.db,f.id).attempts,0);
});
