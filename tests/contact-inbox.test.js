import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {database} from './support/db.js';
import {queueFixture,seedApplicant} from './support/admission-queue.js';
import {submitContact,contactInbox} from '../lib/contact-inbox.ts';
import {AppError} from '../lib/service.ts';
import {contactTopics} from '../lib/contact-catalog.mjs';

const at=Date.parse('2026-10-25T00:00:00.000Z'),body={name:'A visitor',email:'visitor@example.com',topic:'general',message:'A detailed support message for the Affimaro team.'};
const fails=status=>error=>error instanceof AppError&&error.status===status;
const total=db=>db.sqlite.prepare('SELECT count(*) n FROM contact_messages').get().n;
const writes=db=>db.sqlite.prepare('SELECT total_changes() n').get().n;
const sha=value=>createHash('sha256').update(value).digest('hex');
const finance=db=>Object.fromEntries(['orders','payout_requests','billing_accounts','billing_checkouts','payment_connections','audit_events','platform_review_events'].map(table=>[table,db.sqlite.prepare('SELECT count(*) n FROM '+table).get().n]));
async function seed(db,count=26){const ids=[];for(let i=0;i<count;i++){const result=await submitContact(db,{...body,name:'Target visitor '+i,email:'visitor'+i+'@example.com',message:i===0?'Literal %_\\ matching text for the support team.':body.message},'fixture-network-'+i,at+i*1000);ids.push(result.reference);}return ids;}

test('the appended contact migration records every supported topic with normalized private data and receipt-only responses',async t=>{
 const db=database(t),before=finance(db);
 for(const topic of contactTopics){const sent=await submitContact(db,{...body,name:'  A visitor  ',email:' VISITOR@Example.com ',topic:topic.id},'203.0.113.20',at);assert.deepEqual(Object.keys(sent),['reference']);assert.match(sent.reference,/^[a-f0-9-]{36}$/);}
 assert.equal(total(db),5);const row=db.sqlite.prepare('SELECT * FROM contact_messages LIMIT 1').get();assert.equal(row.name,'A visitor');assert.equal(row.email,'visitor@example.com');assert.equal(row.status,'new');assert.equal(row.revision,1);assert.equal(row.created_at,new Date(at).toISOString());assert.equal(row.email_hash,sha('contact-email\nvisitor@example.com'));assert.equal(row.network_hash,sha('contact-network\n203.0.113.20'));assert.ok(!JSON.stringify(row).includes('203.0.113.20'));assert.deepEqual(finance(db),before);
});

test('invalid public submissions never create messages or accept status, owner or identity fields',async t=>{
 const db=database(t),before=writes(db);
 for(const change of [{name:'x'},{name:'Name\nHeader'},{email:'not an email'},{topic:'owner'},{message:'Too short'},{message:'x'.repeat(4001)},{message:'Invalid\0 control characters in this message.'},{id:'not-a-uuid'},{status:'closed'},{owner_id:'owner'},{fax:'x'.repeat(201)}])await assert.rejects(submitContact(db,{...body,...change},null,at),fails(400));
 for(const network of ['x'.repeat(129),'127.0.0.1\nHeader',42])await assert.rejects(submitContact(db,body,network,at),fails(400));assert.equal(total(db),0);assert.equal(writes(db),before);
});

test('the hidden honeypot returns a harmless receipt without reading or writing the database',async()=>{
 const db={prepare(){assert.fail('A honeypot submission touched the inbox');},batch(){assert.fail('A honeypot submission wrote data');}};
 const result=await submitContact(db,{...body,fax:'unwanted submission'},null,at);assert.deepEqual(Object.keys(result),['reference']);assert.match(result.reference,/^[a-f0-9-]{36}$/);
});

test('retries of the same normalized message are idempotent even after rate capacity is reached',async t=>{
 const db=database(t),id=crypto.randomUUID(),sent=await submitContact(db,{...body,id},'203.0.113.5',at);
 for(let i=0;i<4;i++)await submitContact(db,{...body,message:body.message+' '+i},'203.0.113.5',at);
 const before=writes(db);assert.deepEqual(await submitContact(db,{...body,id,name:'  A visitor ',email:' VISITOR@EXAMPLE.COM ',message:' '+body.message+' '},'203.0.113.6',at+1),sent);assert.equal(total(db),5);assert.equal(writes(db),before);
 await assert.rejects(submitContact(db,{...body,id,message:'A different valid message cannot overwrite the original.'},null,at),fails(409));assert.equal(writes(db),before);assert.equal(db.sqlite.prepare('SELECT message FROM contact_messages WHERE id=?').get(id).message,body.message);
});

test('email and network rate windows are independently enforced and reopen at the exact fifteen-minute boundary',async t=>{
 for(const key of ['email','network']){const db=database(t);for(let i=0;i<5;i++)await submitContact(db,{...body,email:key==='email'?body.email:'user'+i+'@example.com'},key==='network'?'203.0.113.8':'network-'+i,at);const next={...body,email:key==='email'?body.email:'next@example.com'},network=key==='network'?'203.0.113.8':'new-network';await assert.rejects(submitContact(db,next,network,at+900000-1),fails(429));assert.equal(total(db),5);await submitContact(db,next,network,at+900000);assert.equal(total(db),6);}
});

test('rate checks run in the insert predicate even when other messages arrive immediately before the write',async t=>{
 const db=database(t);let intercepted=false;
 const wrapped={...db,async batch(statements){if(!intercepted){intercepted=true;for(let i=0;i<5;i++)db.sqlite.prepare("INSERT INTO contact_messages(id,name,email,topic,message,status,revision,email_hash,network_hash,payload_hash,created_at,updated_at) VALUES (?,?,?,?,?,'new',1,?,?,?,?,?)").run(crypto.randomUUID(),body.name,body.email,body.topic,body.message,sha('contact-email\n'+body.email),'','fixture',new Date(at).toISOString(),new Date(at).toISOString());}return db.batch(statements);}};
 await assert.rejects(submitContact(wrapped,body,null,at),fails(429));assert.equal(total(db),5);
});

test('concurrent D1-serialized batches admit only the bounded number of new messages',async t=>{
 const db=database(t);let tail=Promise.resolve();const serial={...db,batch(statements){const result=tail.then(()=>db.batch(statements));tail=result.catch(()=>{});return result;}};
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>submitContact(serial,{...body,message:body.message+' '+i},'203.0.113.55',at)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===429).length,3);assert.equal(total(db),5);
});

test('owner inbox pages, literal search and selected details stay private and read-only',async t=>{
 const f=await queueFixture(t),ids=await seed(f.db),api=contactInbox(f.db,f.owner),before=writes(f.db),financial=finance(f.db);let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;assert.fail('Inbox reads contacted a provider');});
 const last=await api.list({page:'10000'});assert.equal(last.total,26);assert.equal(last.page,2);assert.equal(last.pages,2);assert.equal(last.rows.length,1);assert.equal(last.rows[0].id,ids[0]);const selected=await api.list({q:'%_\\',status:'all',message:ids[0]});assert.equal(selected.total,1);assert.equal(selected.selected.id,ids[0]);assert.equal(selected.selectedMatchesFilters,true);assert.equal(selected.selected.message,'Literal %_\\ matching text for the support team.');
 for(const row of [...last.rows,selected.selected])for(const key of ['email_hash','network_hash','payload_hash'])assert.ok(!(key in row));const empty=await api.list({q:'not found',page:9999});assert.equal(empty.total,0);assert.equal(empty.page,1);assert.equal(empty.pages,0);assert.deepEqual(empty.rows,[]);await assert.rejects(api.list({message:crypto.randomUUID()}),fails(404));assert.equal(writes(f.db),before);assert.equal(calls,0);assert.deepEqual(finance(f.db),financial);
});

test('explicit revision-checked triage recovers a stale page without losing a selected closed message',async t=>{
 const f=await queueFixture(t),ids=await seed(f.db),api=contactInbox(f.db,f.owner),old=(await api.list({page:2})).rows[0],before=finance(f.db);const saved=await api.update({id:old.id,revision:old.revision,status:'closed'});assert.equal(saved.revision,old.revision+1);assert.equal(saved.status,'closed');await assert.rejects(api.update({id:old.id,revision:old.revision,status:'in_progress'}),fails(409));
 const remaining=await api.list({status:'new',page:2,message:ids[0]});assert.equal(remaining.page,1);assert.equal(remaining.total,25);assert.equal(remaining.selected.status,'closed');assert.equal(remaining.selectedMatchesFilters,false);assert.equal(remaining.counts.find(c=>c.status==='closed').total,1);assert.equal((await api.list({status:'closed'})).total,1);assert.deepEqual(finance(f.db),before);
});

test('owner grants, account closure and atomic current-access predicates protect message data and updates',async t=>{
 const f=await queueFixture(t),sent=await submitContact(f.db,body,null,at),member=seedApplicant(f,'member','creator',{status:'approved'}),change={id:sent.reference,revision:1,status:'closed'};
 for(const user of [member,{...member,email:f.owner.email,role:'owner'}]){await assert.rejects(contactInbox(f.db,user).list({status:'all'}),fails(403));await assert.rejects(contactInbox(f.db,user).update(change),fails(403));}
 for(const kind of ['grant','closure']){
  let once=false;const wrapped={...f.db,async batch(statements){if(!once){once=true;if(kind==='grant')f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);else f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.owner.userId,new Date().toISOString());}return f.db.batch(statements);}};
  await assert.rejects(contactInbox(wrapped,f.owner).update(change),fails(409));assert.equal(f.db.sqlite.prepare('SELECT status FROM contact_messages WHERE id=?').get(sent.reference).status,'new');
  await assert.rejects(contactInbox(f.db,f.owner).list({status:'all'}),fails(403));if(kind==='grant')f.db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(f.owner.userId,new Date().toISOString());else f.db.sqlite.prepare('DELETE FROM account_closures WHERE user_id=?').run(f.owner.userId);
 }
 let once=false;const revoked={...f.db,async batch(statements){if(!once){once=true;f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.owner.userId);}return f.db.batch(statements);}};assert.equal((await contactInbox(revoked,f.owner).list({status:'all'})).rows.length,0);
});

test('invalid inbox filters and triage fields never broaden scope or alter a message',async t=>{
 const f=await queueFixture(t),sent=await submitContact(f.db,body,null,at),api=contactInbox(f.db,f.owner),before=writes(f.db);
 for(const filter of [{status:'approved'},{q:['a','b']},{q:'a\nheader'},{page:0},{page:1000001},{page:'1junk'},{message:['one','two']},{message:'not-a-uuid'},{owner:'true'}])await assert.rejects(api.list(filter),fails(400));
 for(const change of [{revision:0},{status:'approved'},{message:'replaced'},{id:'invalid'}])await assert.rejects(api.update({id:sent.reference,revision:1,status:'closed',...change}),fails(400));assert.equal(writes(f.db),before);
});
