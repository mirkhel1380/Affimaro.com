import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {syntheticJpeg} from './support/identity-photos.js';
import {identityJpeg} from '../lib/identity-image.ts';
import {memberProfile} from '../lib/member-profile.ts';
import {closeAccount} from '../lib/account-closure.ts';
import {accountSettings} from '../lib/account-settings.ts';
import {emptyMemberProfile} from '../lib/member-profile-catalog.ts';
import {AppError} from '../lib/service.ts';
const fails=n=>e=>e instanceof AppError&&e.status===n;
const details={firstName:'Sam',lastName:'Example',jobTitle:'Partnership manager',workPhone:'+1 (202) 555-0100',mobilePhone:''};
test('private user details work for all four roles without editing reviewed profiles or sign-in identities',async t=>{
 const f=await partnerFixture(t);for(const role of ['brand','affiliate','creator','agency']){const api=memberProfile(f.db,f[role]),before=f.db.sqlite.prepare('SELECT profile_json,revision,status FROM platform_applications WHERE user_id=?').get(f[role].userId);assert.deepEqual(await api.snapshot(),emptyMemberProfile());const saved=await api.save({name:'Sam '+role,revision:0,details});assert.equal(saved.name,'Sam '+role);assert.deepEqual(saved.profile.details,details);assert.equal(saved.profile.revision,1);assert.equal(f.db.sqlite.prepare('SELECT display_name FROM accounts WHERE id=?').get(f[role].userId).display_name,saved.name);assert.deepEqual(f.db.sqlite.prepare('SELECT profile_json,revision,status FROM platform_applications WHERE user_id=?').get(f[role].userId),before);assert.equal((await accountSettings(f.db,f[role]).snapshot()).email,f[role].email);await assert.rejects(api.save({name:'Stale overwrite',revision:0,details}),fails(409));}assert.deepEqual(await memberProfile(f.db,f.foreignBrand).snapshot(),emptyMemberProfile());
});
test('photo and details share a revision, preserve one another and never appear in profile/export data as image bytes',async t=>{
 const f=await partnerFixture(t),api=memberProfile(f.db,f.affiliate),image=Buffer.from(syntheticJpeg()).toString('base64');let result=await api.saveAvatar({revision:0,image});assert.equal(result.hasAvatar,true);assert.equal(result.revision,1);assert.deepEqual(await api.avatar(),identityJpeg(syntheticJpeg()));await assert.rejects(memberProfile(f.db,f.creator).avatar(),fails(404));await assert.rejects(api.save({name:'Stale details',revision:0,details}),fails(409));assert.notEqual(f.db.sqlite.prepare('SELECT display_name FROM accounts WHERE id=?').get(f.affiliate.userId).display_name,'Stale details');result=(await api.save({name:'Sam private',revision:1,details})).profile;assert.equal(result.hasAvatar,true);assert.equal(result.revision,2);const exported=await accountSettings(f.db,f.affiliate).exportData();assert.deepEqual(exported.userProfile.details,details);assert.equal(JSON.stringify(exported).includes(image),false);assert.equal('avatar_jpeg' in result,false);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_documents').get().n,0);result=await api.saveAvatar({revision:2,image:null});assert.equal(result.revision,3);assert.deepEqual(result.details,details);await assert.rejects(api.avatar(),fails(404));await assert.rejects(api.saveAvatar({revision:2,image}),fails(409));
});
test('private profile rejects foreign IDs, role or email changes, invalid phone data and non-JPEG image payloads',async t=>{
 const f=await partnerFixture(t),api=memberProfile(f.db,f.creator);for(const extra of [{userId:f.affiliate.userId},{email:'other@example.com'},{role:'brand'},{identityApproved:true}])await assert.rejects(api.save({revision:0,name:'Valid name',details,...extra}),fails(400));await assert.rejects(api.save({revision:0,name:'Valid name',details:{...details,mobilePhone:'<script>alert(1)</script>'}}),fails(400));for(const image of ['','not valid base64!',Buffer.from('<svg onload="bad()"/>').toString('base64')])await assert.rejects(api.saveAvatar({revision:0,image}),e=>e instanceof AppError&&[400,413].includes(e.status));await assert.rejects(api.saveAvatar({revision:0,image:null,userId:f.affiliate.userId}),fails(400));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM member_profiles').get().n,0);
});
test('closed, unapproved and owner accounts cannot read or save member profiles',async t=>{
 const f=await partnerFixture(t);await memberProfile(f.db,f.affiliate).save({revision:0,name:'Private name',details});f.db.sqlite.prepare('INSERT INTO account_closures(user_id,closed_at) VALUES (?,?)').run(f.affiliate.userId,new Date().toISOString());f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.creator.userId);for(const user of [f.affiliate,f.creator,f.operator]){await assert.rejects(memberProfile(f.db,user).snapshot(),fails(403));await assert.rejects(memberProfile(f.db,user).saveAvatar({revision:0,image:null}),fails(403));}
});
test('admission changes at write time cannot partially change a private profile or display name',async t=>{
 const f=await partnerFixture(t),db={...f.db,async batch(statements){f.db.sqlite.prepare("UPDATE platform_applications SET status='pending' WHERE user_id=?").run(f.affiliate.userId);return f.db.batch(statements);}};await assert.rejects(memberProfile(db,f.affiliate).save({revision:0,name:'Unreviewed overwrite',details}),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM member_profiles').get().n,0);assert.notEqual(f.db.sqlite.prepare('SELECT display_name FROM accounts WHERE id=?').get(f.affiliate.userId).display_name,'Unreviewed overwrite');
});


test('successful closure removes private member contacts and photo while retaining the account tombstone',async t=>{
 const f=await partnerFixture(t),api=memberProfile(f.db,f.agency);await api.save({revision:0,name:'Private agency member',details});await api.saveAvatar({revision:1,image:Buffer.from(syntheticJpeg()).toString('base64')});await closeAccount(f.db,f.agency,'Closing test fixture account');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM member_profiles WHERE user_id=?').get(f.agency.userId).n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM account_closures WHERE user_id=?').get(f.agency.userId).n,1);await assert.rejects(api.avatar(),fails(403));
});
