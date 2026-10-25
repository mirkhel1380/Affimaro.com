import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import {syntheticJpeg} from './support/identity-photos.js';
import {identityVerification,identityReviewQueue} from '../lib/identity-verification.ts';
import {identityJpeg} from '../lib/identity-image.ts';
import {identityProfileSchema} from '../lib/identity-catalog.ts';
import {sealIdentity,openIdentity} from '../lib/identity-crypto.ts';
import {requireRecipientIdentity} from '../lib/identity-policy.ts';
import {identityEndpoint,readIdentityUpload} from '../lib/identity-http.ts';
import {closeAccount} from '../lib/account-closure.ts';
import {AppError} from '../lib/service.ts';
const key='ab'.repeat(32),fails=status=>e=>e instanceof AppError&&e.status===status;
const profile={fullName:'Fictional Test Person',country:'US',documentType:'passport',revision:0,consent:true};
const files=()=>({front:syntheticJpeg(),selfie:syntheticJpeg()});
const api=(f,who=f.affiliate)=>identityVerification(f.db,who,key);
const submit=(f,who=f.affiliate,change={},photos=files())=>api(f,who).submit({...profile,...change},photos);
async function viewed(f,user=f.affiliate){const details=await api(f,f.operator).ownerDetails(user.userId);for(const doc of details.documents)await api(f,f.operator).document(doc.id,true);return details;}
const decide=(f,status,revision,user=f.affiliate,reason='')=>api(f,f.operator).review({userId:user.userId,revision,decision:status,reason,confirmed:true});

test('identity evidence is randomized, context-bound and separate from payment ciphertext',async()=>{
 const bytes=syntheticJpeg(),a=await sealIdentity(bytes,key,'document/a/b/front'),b=await sealIdentity(bytes,key,'document/a/b/front');assert.notEqual(a,b);assert.deepEqual(await openIdentity(a,key,'document/a/b/front'),bytes);
 await assert.rejects(openIdentity(a,key,'document/another/b/front'),fails(503));await assert.rejects(openIdentity(a,'cd'.repeat(32),'document/a/b/front'),fails(503));const part=a.split('.');part[2]=(part[2][0]==='A'?'B':'A')+part[2].slice(1);await assert.rejects(openIdentity(part.join('.'),key,'document/a/b/front'),fails(503));await assert.rejects(sealIdentity(bytes,undefined,'x'),fails(503));await assert.rejects(sealIdentity(new Uint8Array(512001),key,'x'),fails(413));
});
test('server upload checks reject disguised or oversized files and strip optional metadata',()=>{
 const jpg=syntheticJpeg(),metadata=new TextEncoder().encode('PERSONAL_EXIF_FIXTURE'),segment=new Uint8Array([255,225,0,metadata.length+2,...metadata]),combined=new Uint8Array(jpg.length+segment.length);combined.set(jpg.subarray(0,2));combined.set(segment,2);combined.set(jpg.subarray(2),2+segment.length);assert.deepEqual(identityJpeg(combined),identityJpeg(jpg));
 for(const bytes of [new TextEncoder().encode('<svg onload="alert(1)"/>'),jpg.subarray(0,jpg.length-1),new Uint8Array(512001),new Uint8Array([255,216,255,225,255,255,...jpg.subarray(4)])])assert.throws(()=>identityJpeg(bytes),fails(400));
 const tooSmall=jpg.slice(),index=tooSmall.findIndex((v,i)=>v===255&&tooSmall[i+1]===192);assert.ok(index>0);tooSmall[index+5]=0;tooSmall[index+6]=10;assert.throws(()=>identityJpeg(tooSmall),fails(400));
 assert.equal(identityProfileSchema.safeParse({fullName:profile.fullName,country:'US',documentType:'passport'}).success,true);
 for(const change of [{country:'ZZ'},{country:'XX'},{country:'USA'},{fullName:'A\u0000B'},{documentType:'invoice'}])assert.equal(identityProfileSchema.safeParse({fullName:profile.fullName,country:profile.country,documentType:profile.documentType,...change}).success,false);
});
test('affiliate and creator identity starts blocked; business roles and owner cannot self-enroll',async t=>{
 const f=await partnerFixture(t);for(const who of [f.affiliate,f.creator]){assert.equal((await api(f,who).snapshot()).status,'not_started');await assert.rejects(requireRecipientIdentity(f.db,who.userId),fails(403));}
 for(const who of [f.brand,f.agency,f.operator])await assert.rejects(submit(f,who),fails(403));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_verifications').get().n,0);
 await submit(f,f.creator);assert.equal((await api(f,f.creator).snapshot()).status,'pending');assert.equal((await api(f).snapshot()).status,'not_started');
});
test('submission encrypts details and photos, hides private data from the queue and prevents duplicate pending uploads',async t=>{
 const f=await partnerFixture(t),state=await submit(f);assert.equal(state.status,'pending');assert.equal(state.revision,1);assert.equal(state.canResubmit,false);assert.equal(state.evidenceAvailable,true);
 const stored=f.db.sqlite.prepare('SELECT * FROM identity_verifications').get(),documents=f.db.sqlite.prepare('SELECT * FROM identity_documents').all();assert.ok(!stored.encrypted_profile.includes(profile.fullName));assert.equal(documents.length,2);assert.ok(documents.every(d=>d.encrypted_content.startsWith('v1.')));const queue=await identityReviewQueue(f.db,f.operator);assert.equal(queue.total,1);assert.ok(!JSON.stringify(queue).includes(profile.fullName));assert.ok(!JSON.stringify(queue).includes('encrypted_'));
 await assert.rejects(submit(f,f.affiliate,{revision:1}),fails(409));await assert.rejects(submit(f,f.affiliate,{revision:0}),fails(409));await assert.rejects(api(f,f.brand).ownerDetails(f.affiliate.userId),fails(403));await assert.rejects(identityReviewQueue(f.db,f.affiliate),fails(403));
});
test('only the subject and owner can open current photos; own views do not satisfy owner approval',async t=>{
 const f=await partnerFixture(t);await submit(f);const detail=await api(f,f.operator).ownerDetails(f.affiliate.userId),doc=detail.documents[0];assert.equal(detail.profile.fullName,profile.fullName);assert.deepEqual((await api(f).document(doc.id)).bytes,identityJpeg(syntheticJpeg()));
 await assert.rejects(api(f,f.creator).document(doc.id),fails(404));await assert.rejects(api(f,f.brand).document(doc.id),fails(403));await assert.rejects(api(f).document(doc.id,true),fails(403));await assert.rejects(decide(f,'approved',1),fails(409));await viewed(f);await assert.rejects(api(f,f.operator).review({userId:f.affiliate.userId,revision:1,decision:'approved',confirmed:false}),fails(400));const state=await decide(f,'approved',1);assert.equal(state.status,'approved');await requireRecipientIdentity(f.db,f.affiliate.userId);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_documents').get().n,0);await assert.rejects(api(f,f.operator).document(doc.id,true),fails(404));
});
test('card and licence require all three photos; owners must open every current image',async t=>{
 const f=await partnerFixture(t);await assert.rejects(submit(f,f.creator,{documentType:'national_id'}),fails(400));await submit(f,f.creator,{documentType:'national_id'},{...files(),back:syntheticJpeg()});const details=await api(f,f.operator).ownerDetails(f.creator.userId);assert.equal(details.documents.length,3);await api(f,f.operator).document(details.documents[0].id,true);await assert.rejects(decide(f,'approved',1,f.creator),fails(409));await viewed(f,f.creator);assert.equal((await decide(f,'approved',1,f.creator)).status,'approved');
});
test('requested changes delete evidence; a replacement cannot inherit an old revision or document views',async t=>{
 const f=await partnerFixture(t);await submit(f);await viewed(f);await assert.rejects(decide(f,'changes_requested',1,f.affiliate),fails(400));const changes=await decide(f,'changes_requested',1,f.affiliate,'Please use a clearer photo.');assert.equal(changes.revision,2);assert.equal(changes.canResubmit,true);assert.equal(changes.reason,'Please use a clearer photo.');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_documents').get().n,0);
 await submit(f,f.affiliate,{revision:2});await assert.rejects(decide(f,'approved',1),fails(409));await assert.rejects(decide(f,'approved',3),fails(409));await viewed(f);assert.equal((await decide(f,'approved',3)).revision,4);
});
test('approval withdrawal and explicit replacement both close payout eligibility without deleting commission',async t=>{
 const f=await partnerFixture(t);await submit(f);await viewed(f);await decide(f,'approved',1);await assert.rejects(submit(f,f.affiliate,{revision:2}),fails(400));await submit(f,f.affiliate,{revision:2,replaceApproved:true});await assert.rejects(requireRecipientIdentity(f.db,f.affiliate.userId),fails(403));await viewed(f);await decide(f,'approved',3);const state=await decide(f,'revoked',4,f.affiliate,'Payment review required.');assert.equal(state.status,'revoked');await assert.rejects(requireRecipientIdentity(f.db,f.affiliate.userId),fails(403));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM applications').get().n,2);
});
test('expired photos cannot open or approve and permit replacement with a new submission',async t=>{
 const f=await partnerFixture(t);await submit(f);const old=await viewed(f);f.db.sqlite.exec("UPDATE identity_documents SET expires_at='2020-01-01T00:00:00.000Z'");assert.equal((await api(f).snapshot()).canResubmit,true);await assert.rejects(api(f,f.operator).document(old.documents[0].id,true),fails(404));await assert.rejects(decide(f,'approved',1),fails(409));await submit(f,f.affiliate,{revision:1});assert.notEqual((await api(f,f.operator).ownerDetails(f.affiliate.userId)).submissionId,old.submissionId);await assert.rejects(decide(f,'approved',2),fails(409));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_documents').get().n,2);
});
test('a concurrently removed owner grant or closed recipient cannot save a review decision',async t=>{
 const f=await partnerFixture(t);await submit(f);await viewed(f);const batch=f.db.batch;let intercepted=false;f.db.batch=async statements=>{if(!intercepted){intercepted=true;f.db.sqlite.prepare('DELETE FROM platform_admins WHERE user_id=?').run(f.operator.userId);}return batch(statements);};await assert.rejects(decide(f,'approved',1),fails(409));assert.equal((await api(f).snapshot()).status,'pending');assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM identity_review_events WHERE action='approved'").get().n,0);
 f.db.sqlite.prepare('INSERT INTO account_closures VALUES (?,?,?)').run(f.affiliate.userId,'',new Date().toISOString());await assert.rejects(api(f).snapshot(),fails(403));
});
test('a stale concurrent decision cannot append a second decision event or delete replacement evidence',async t=>{
 const f=await partnerFixture(t);await submit(f);await viewed(f);const results=await Promise.allSettled([decide(f,'approved',1),decide(f,'approved',1)]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM identity_review_events WHERE action='approved'").get().n,1);assert.equal((await api(f).snapshot()).revision,2);
});
test('confirmed closure removes the subject private profile and files while retaining review history',async t=>{
 const f=await partnerFixture(t);await submit(f,f.creator);await closeAccount(f.db,f.creator,'Test account closure.');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_verifications').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_documents').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM identity_review_events').get().n,1);
});
function upload(change={},extra){const data=new FormData();data.set('profile',JSON.stringify({...profile,...change}));for(const [slot,bytes] of Object.entries(files()))data.set(slot,new Blob([bytes],{type:'image/jpeg'}),slot+'.jpg');extra?.(data);return new Request('https://affimaro.example/api/identity-verification',{method:'POST',headers:{Origin:'https://affimaro.example'},body:data});}
test('bounded multipart endpoint rejects CSRF, duplicate fields, wrong MIME, over-limit and identity injection',async t=>{
 const f=await partnerFixture(t),context={db:f.db,user:f.affiliate,key,independent:true};let response=await identityEndpoint(upload(),{...context,user:null});assert.equal(response.status,401);assert.equal((await identityEndpoint(upload(),{...context,independent:false})).status,503);
 const cross=upload();cross.headers.set('Origin','https://evil.example');assert.equal((await identityEndpoint(cross,context)).status,403);assert.equal((await identityEndpoint(upload({},form=>form.append('front',new Blob([syntheticJpeg()],{type:'image/jpeg'}),'x.jpg')),context)).status,400);assert.equal((await identityEndpoint(upload({userId:'creator'}),context)).status,400);assert.equal((await identityEndpoint(upload({},form=>form.set('selfie',new Blob(['<svg/>'],{type:'image/svg+xml'}),'x.svg')),context)).status,400);
 const oversized=upload();oversized.headers.set('Content-Length','1560001');await assert.rejects(readIdentityUpload(oversized),fails(413));response=await identityEndpoint(upload(),context);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/);
 const details=await api(f,f.operator).ownerDetails(f.affiliate.userId),image=await identityEndpoint(new Request('https://affimaro.example/api/identity-document?document='+details.documents[0].id),{...context,document:true});assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/jpeg');assert.match(image.headers.get('Content-Disposition'),/^attachment;/);assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');assert.match(image.headers.get('Content-Security-Policy'),/sandbox/);assert.equal((await identityEndpoint(new Request('https://affimaro.example/api/identity-document?document='+details.documents[0].id+'&document='+details.documents[1].id),{...context,document:true})).status,400);
});
