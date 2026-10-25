import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {mediaProperties} from '../lib/media-properties.ts';

async function fixture(t){
 const db=database(t),user={userId:'proof-publisher',email:'proof@example.com'};
 await service(db,user).saveAccount({name:'Proof publisher'});
 const property=await mediaProperties(db,user).add({kind:'Website',platform:'Website / blog',name:'Publication',url:'https://publication.example',relationship:'Owner'});
 const row=()=>db.sqlite.prepare('SELECT * FROM media_properties WHERE id=?').get(property.id);
 const reviews=()=>db.sqlite.prepare('SELECT count(*) n FROM media_property_reviews WHERE property_id=?').get(property.id).n;
 const answer=()=>Response.json({Status:0,Answer:[{name:'_affimaro-verify.publication.example.',type:16,data:JSON.stringify(property.challenge)}]});
 return {db,user,property,row,reviews,answer,input:{id:property.id,revision:property.revision}};
}
const conflict=error=>error instanceof AppError&&error.status===409;
const clock=Date.parse('2026-10-25T00:00:00.000Z');

for(const elapsed of [1000,1001])test(`DNS evidence cannot verify after its code reaches expiry during lookup (${elapsed} ms)`,async t=>{
 t.mock.timers.enable({apis:['Date'],now:clock});
 const f=await fixture(t),expiry=new Date(clock+1000).toISOString();
 f.db.sqlite.prepare('UPDATE media_properties SET challenge_expires_at=? WHERE id=?').run(expiry,f.property.id);
 let calls=0;
 const api=mediaProperties(f.db,f.user,async()=>{calls++;t.mock.timers.tick(elapsed);return f.answer();});
 await assert.rejects(api.verifyDns(f.input),conflict);
 assert.equal(calls,1);assert.equal(f.row().status,'unverified');assert.equal(f.row().verified_at,null);
 assert.equal(f.row().revision,f.property.revision);assert.equal(f.reviews(),0);
 assert.ok(f.row().last_checked_at,'the lookup throttle is retained even when proof expires');
});

test('closing an account while DNS responds cannot write verified ownership or a successful review',async t=>{
 const f=await fixture(t);
 const api=mediaProperties(f.db,f.user,async()=>{
  f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.user.userId,new Date().toISOString());
  return f.answer();
 });
 await assert.rejects(api.verifyDns(f.input),conflict);
 assert.equal(f.row().status,'unverified');assert.equal(f.row().verified_at,null);assert.equal(f.row().revision,f.property.revision);assert.equal(f.reviews(),0);
});

test('an exact DNS proof that completes before expiry still verifies once without profile approval',async t=>{
 t.mock.timers.enable({apis:['Date'],now:clock});
 const f=await fixture(t);
 f.db.sqlite.prepare('UPDATE media_properties SET challenge_expires_at=? WHERE id=?').run(new Date(clock+1000).toISOString(),f.property.id);
 const api=mediaProperties(f.db,f.user,async()=>{t.mock.timers.tick(999);return f.answer();});
 const saved=await api.verifyDns(f.input);
 assert.equal(saved.status,'verified');assert.equal(saved.verified_at,new Date(clock+999).toISOString());assert.equal(saved.revision,f.property.revision+1);assert.equal(f.reviews(),1);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM platform_applications WHERE user_id=?').get(f.user.userId).n,0);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payment_connections').get().n,0);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM payout_requests').get().n,0);
});
