import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {service,AppError} from '../lib/service.ts';
import * as resources from '../lib/partner-resources.ts';
const fails=status=>error=>error instanceof AppError&&error.status===status;
const text={kind:'text',title:'Approved copy',body:'Original approved promotional content.',description:'Use with a clear disclosure.'};
const coupon={code:'ORIGINAL10',title:'Original offer',terms:'Excludes sale items. Store terms apply.'};
const edit=(record,type,fields)=>({id:record.id,revision:record.revision,type,fields});
const row=(f,type,id)=>f.db.sqlite.prepare('SELECT * FROM '+(type==='asset'?'program_resources':'program_coupons')+' WHERE id=?').get(id);
const updated=f=>f.db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action IN ('program_asset_updated','program_coupon_updated')").get().n;
function beforeBatch(db,operation){const original=db.batch.bind(db);let once=true;db.batch=async statements=>{if(once){once=false;await operation();}return original(statements);};}

test('brand and agency edits preserve asset identity and creation time and update only the chosen partnership scope',async t=>{
 const f=await partnerFixture(t);
 for(const [business,partner] of [[f.brand,f.affiliate],[f.agency,f.creator]]){
  const program=(await service(f.db,business).businessDashboard()).program,application=await service(f.db,partner).apply({programId:program.id});await service(f.db,business).review({applicationId:application.id,status:'approved'});
  const api=resources.partnerResources(f.db,business),original=await api.addAsset(text),saved=await api.update(edit(original,'asset',{kind:'image',title:'Updated banner',url:'https://brand.example/new.png',description:'Updated permitted use.',applicationId:application.id}));
  assert.equal(saved.id,original.id);assert.equal(saved.created_at,original.created_at);assert.equal(saved.revision,2);assert.equal(saved.application_id,application.id);assert.equal(saved.body,'');assert.equal((await resources.partnerResources(f.db,partner).forPartnership(application.id)).assets[0].url,saved.url);
  const back=await api.update(edit(saved,'asset',{...text,title:'New approved copy'}));assert.equal(back.url,'');assert.equal(back.application_id,null);assert.equal(back.revision,3);
 }
 assert.equal(updated(f),4);
});

test('coupon edits preserve identity, normalize codes and enforce new scope and validity dates for both recipient roles',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand);await service(f.db,f.brand).review({applicationId:f.pending.id,status:'approved'});const original=await api.addCoupon(coupon);
 const saved=await api.update(edit(original,'coupon',{...coupon,code:'creator20',applicationId:f.pending.id}));assert.equal(saved.id,original.id);assert.equal(saved.code,'CREATOR20');assert.equal(saved.created_at,original.created_at);assert.equal(saved.revision,2);
 assert.equal((await resources.partnerResources(f.db,f.affiliate).forPartnership(f.application.id)).coupons.length,0);assert.equal((await resources.partnerResources(f.db,f.creator).forPartnership(f.pending.id)).coupons[0].code,'CREATOR20');
 const scheduled=await api.update(edit(saved,'coupon',{...coupon,startsAt:'2090-01-01T00:00:00.000Z'}));assert.equal(resources.couponAvailability(scheduled),'scheduled');assert.equal((await resources.partnerResources(f.db,f.creator).forPartnership(f.pending.id)).coupons.length,0);
 const expired=await api.update(edit(scheduled,'coupon',{...coupon,expiresAt:'2020-01-01T00:00:00.000Z'}));assert.equal(resources.couponAvailability(expired),'expired');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM orders').get().n,0);
});

test('stale, foreign and archived edits cannot overwrite an active resource or produce a misleading audit',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),original=await api.addAsset(text),saved=await api.update(edit(original,'asset',{...text,title:'Latest copy'})),before=updated(f);
 await assert.rejects(api.update(edit(original,'asset',{...text,title:'Stale copy'})),fails(409));await assert.rejects(resources.partnerResources(f.db,f.foreignBrand).update(edit(saved,'asset',text)),fails(409));
 await api.archive({id:saved.id,revision:saved.revision,type:'asset'});await assert.rejects(api.update(edit({...saved,revision:3},'asset',text)),fails(409));assert.equal(row(f,'asset',saved.id).status,'archived');assert.equal(row(f,'asset',saved.id).title,'Latest copy');assert.equal(updated(f),before);
});

test('edits reject forged program, state, revision, unsafe URLs and another program partner',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),asset=await api.addAsset(text),foreignProgram=(await service(f.db,f.agency).businessDashboard()).program,foreignApplication=await service(f.db,f.creator).apply({programId:foreignProgram.id});await service(f.db,f.agency).review({applicationId:foreignApplication.id,status:'approved'});
 for(const value of [{...edit(asset,'asset',text),programId:crypto.randomUUID()},edit(asset,'asset',{...text,status:'archived'}),{...edit(asset,'asset',text),revision:0},edit(asset,'asset',{kind:'image',title:'Bad URL',url:'https://user:secret@brand.example/image'}),edit(asset,'asset',{...text,applicationId:foreignApplication.id})])await assert.rejects(api.update(value),fails(value.fields?.applicationId?403:400));
 await assert.rejects(resources.partnerResources(f.db,f.affiliate).update(edit(asset,'asset',text)),fails(403));assert.equal(row(f,'asset',asset.id).revision,1);assert.equal(updated(f),0);
});

test('editing a coupon cannot duplicate another active code in the same program and scope',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),first=await api.addCoupon(coupon),second=await api.addCoupon({...coupon,code:'SECOND20'});
 await assert.rejects(api.update(edit(second,'coupon',coupon)),fails(409));assert.equal(row(f,'coupon',second.id).code,'SECOND20');assert.equal(row(f,'coupon',second.id).revision,1);
 const saved=await api.update(edit(second,'coupon',{...coupon,applicationId:f.application.id}));assert.equal(saved.code,first.code);assert.equal(saved.application_id,f.application.id);
});

test('a suspended assigned partner or closed owner at the final write blocks asset and coupon edits',async t=>{
 for(const type of ['asset','coupon'])for(const changed of ['partner','owner','partnerClosure','admission']){
  const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),original=await api[type==='asset'?'addAsset':'addCoupon'](type==='asset'?text:coupon),fields={...(type==='asset'?text:coupon),applicationId:f.application.id};
  beforeBatch(f.db,()=>{if(changed==='partner')return f.db.sqlite.prepare("UPDATE applications SET status='suspended' WHERE id=?").run(f.application.id);if(changed==='admission')return f.db.sqlite.prepare("UPDATE platform_applications SET status='changes_requested' WHERE user_id=?").run(f.brand.userId);return f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES(?,?)').run(changed==='partnerClosure'?f.affiliate.userId:f.brand.userId,new Date().toISOString());});
  await assert.rejects(api.update(edit(original,type,fields)),fails(409));assert.equal(row(f,type,original.id).revision,1);assert.equal(updated(f),0);
 }
});

test('publishing rechecks the assigned partner at insertion, after its initial scope validation',async t=>{
 for(const type of ['asset','coupon']){
  const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand);beforeBatch(f.db,()=>f.db.sqlite.prepare("UPDATE applications SET status='suspended' WHERE id=?").run(f.application.id));
  await assert.rejects(api[type==='asset'?'addAsset':'addCoupon']({...(type==='asset'?text:coupon),applicationId:f.application.id}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM '+(type==='asset'?'program_resources':'program_coupons')).get().n,0);
 }
});

test('an audit failure rolls an edit back with its previous fields and revision',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),original=await api.addAsset(text);f.db.sqlite.exec("CREATE TRIGGER resource_audit_failure BEFORE INSERT ON audit_events WHEN NEW.action='program_asset_updated' BEGIN SELECT RAISE(ABORT,'resource fixture audit failure'); END");
 await assert.rejects(api.update(edit(original,'asset',{...text,title:'Unsaved title'})),/resource fixture audit failure/);assert.deepEqual(row(f,'asset',original.id),original);
});

test('an editable record must belong to the current business, match its type and remain active',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),original=await api.addAsset(text);assert.equal((await api.editable({id:original.id,type:'asset'})).record.id,original.id);
 await assert.rejects(resources.partnerResources(f.db,f.foreignBrand).editable({id:original.id,type:'asset'}),fails(404));await assert.rejects(api.editable({id:original.id,type:'coupon'}),fails(404));await api.archive({id:original.id,type:'asset',revision:1});await assert.rejects(api.editable({id:original.id,type:'asset'}),fails(404));
});


test('active resources remain visible when more than two hundred archived records have newer timestamps',async t=>{
 const f=await partnerFixture(t),api=resources.partnerResources(f.db,f.brand),asset=await api.addAsset(text),code=await api.addCoupon(coupon),later='2090-01-01T00:00:00.000Z';
 const a=f.db.sqlite.prepare("INSERT INTO program_resources(id,program_id,kind,title,description,url,body,status,created_at,updated_at) VALUES(?,?,'text','Archived copy','','','Archived promotional copy.','archived',?,?)"),c=f.db.sqlite.prepare("INSERT INTO program_coupons(id,program_id,code,title,terms,status,created_at,updated_at) VALUES(?,?,'ARCHIVE','Archived offer','Archived store terms.','archived',?,?)");
 for(let i=0;i<201;i++){a.run(crypto.randomUUID(),asset.program_id,later,later);c.run(crypto.randomUUID(),code.program_id,later,later);}
 const result=await api.manage();assert.equal(result.assets[0].id,asset.id);assert.equal(result.coupons[0].id,code.id);assert.equal(result.assets.length,200);assert.equal((await api.editable({id:asset.id,type:'asset'})).record.id,asset.id);
});

test('coupon availability distinguishes scheduled, available, expired and archived including exact boundaries',()=>{
 const start='2026-10-24T00:00:00.000Z',end='2026-10-25T00:00:00.000Z',value={status:'active',starts_at:start,expires_at:end};
 assert.equal(resources.couponAvailability(value,Date.parse(start)-1),'scheduled');assert.equal(resources.couponAvailability(value,Date.parse(start)),'available');assert.equal(resources.couponAvailability(value,Date.parse(end)),'expired');assert.equal(resources.couponAvailability({...value,status:'archived'},Date.parse(start)-1),'archived');assert.equal(resources.couponAvailability({status:'active',starts_at:null,expires_at:null}),'available');
});
