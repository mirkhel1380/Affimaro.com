import test from 'node:test';
import assert from 'node:assert/strict';
import {partnerFixture} from './support/partner-workspace.js';
import * as clicks from '../lib/link-clicks.ts';
import {service,AppError} from '../lib/service.ts';
const fails=status=>error=>error instanceof AppError&&error.status===status;
function seed(f,applicationId,values={}){const v={source:'newsletter',medium:'email',host:'news.example',device:'Mobile',country:'US',at:new Date().toISOString(),...values};f.db.sqlite.prepare('INSERT INTO link_clicks VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),applicationId,v.source,v.medium,v.host,v.device,v.country,v.at);}

test('search, country and device filters apply equally to totals, charts and activity without exposing another program',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<3;i++)seed(f,f.application.id);seed(f,f.application.id,{country:'CA'});seed(f,f.application.id,{device:'Desktop'});seed(f,f.application.id,{source:'instagram',medium:'social',host:'social.example'});seed(f,f.application.id,{at:new Date(Date.now()-100*86400000).toISOString()});seed(f,f.application.id,{at:new Date(Date.now()+86400000).toISOString()});seed(f,f.pending.id,{country:'DE',source:'creator-only'});
 for(const user of [f.affiliate,f.brand]){const report=await clicks.clickReport(f.db,user,{q:'NEWSLETTER',country:'US',device:'Mobile',days:7});assert.equal(report.totals.total,3);assert.equal(report.rows.length,3);assert.equal(report.daily.reduce((n,d)=>n+d.clicks,0),3);assert.equal(report.sources.reduce((n,s)=>n+s.clicks,0),3);assert.ok(report.countries.includes('CA'));assert.ok(!report.rows.some(r=>r.source==='creator-only'));}
 assert.equal((await clicks.clickReport(f.db,f.affiliate,{q:'news.example'})).totals.total,5);assert.equal((await clicks.clickReport(f.db,f.affiliate,{q:'social'})).totals.total,1);assert.equal((await clicks.clickReport(f.db,f.affiliate,{q:'%'})).totals.total,0);assert.equal((await clicks.clickReport(f.db,f.affiliate,{q:"' OR 1=1 --"})).totals.total,0);
 const empty=await clicks.clickReport(f.db,f.foreignBrand,{country:'JP'});assert.equal(empty.totals.total,0);assert.deepEqual(empty.countries,[]);
});

test('all four roles receive only their own click rows, with partner names available to the owning business',async t=>{
 const f=await partnerFixture(t),program=(await service(f.db,f.agency).businessDashboard()).program,application=await service(f.db,f.creator).apply({programId:program.id});await service(f.db,f.agency).review({applicationId:application.id,status:'approved'});seed(f,f.application.id,{source:'brand-campaign'});seed(f,application.id,{source:'agency-campaign',country:'GB'});
 for(const [business,partner,id,source] of [[f.brand,f.affiliate,f.application.id,'brand-campaign'],[f.agency,f.creator,application.id,'agency-campaign']]){
  for(const user of [business,partner]){const report=await clicks.clickReport(f.db,user,{q:source});assert.equal(report.totals.total,1);assert.equal(report.rows[0].partner,f.db.sqlite.prepare('SELECT display_name FROM affiliate_profiles WHERE user_id=?').get(partner.userId).display_name);assert.equal(report.partnerships.find(p=>p.id===id).id,id);}
 }
 await assert.rejects(clicks.clickReport(f.db,f.agency,{applicationId:f.application.id}),fails(403));await assert.rejects(clicks.clickExport(f.db,f.affiliate,{applicationId:application.id}),fails(403));
});

test('CSV exports include every matching row across activity pages and preserve history after suspension',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<60;i++)seed(f,f.application.id);for(let i=0;i<3;i++)seed(f,f.pending.id,{source:'PRIVATE_CREATOR'});
 const report=await clicks.clickReport(f.db,f.affiliate,{page:2});assert.equal(report.rows.length,25);assert.equal(report.pages,3);
 await service(f.db,f.brand).review({applicationId:f.application.id,status:'suspended'});const before=f.db.sqlite.prepare('SELECT total_changes() n').get().n,result=await clicks.clickExport(f.db,f.affiliate,{page:2,q:'newsletter',country:'US',device:'Mobile'});
 assert.equal(result.rowCount,60);assert.equal(result.csv.trim().split('\r\n').length,61);assert.equal(f.db.sqlite.prepare('SELECT total_changes() n').get().n,before);assert.ok(!result.csv.includes('PRIVATE_CREATOR'));assert.ok(!result.csv.includes(f.application.id));assert.ok(!result.csv.includes('@example.com'));assert.ok(result.csv.startsWith('\ufeff'));assert.ok(result.csv.includes('Clicked at (UTC)'));
});

test('click CSV quoting neutralizes formula text and excludes identity and financial fields',async t=>{
 const f=await partnerFixture(t);f.db.sqlite.prepare('UPDATE workspaces SET name=? WHERE id=?').run(' =HYPERLINK("https://example.invalid")',f.program.workspace_id);f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run('+Partner, "quoted"',f.affiliate.userId);seed(f,f.application.id,{source:'@SUM(1,2)',host:'referrer.example'});
 const csv=(await clicks.clickExport(f.db,f.brand)).csv;assert.ok(csv.includes(`"' =HYPERLINK(""https://example.invalid"")"`));assert.ok(csv.includes(`"'+Partner, ""quoted"""`));assert.ok(csv.includes(`"'@SUM(1,2)"`));
 for(const secret of ['@example.com','user_id','encrypted','bank_account','provider_account','signing_key'])assert.ok(!csv.includes(secret));
});

test('oversized click exports fail explicitly rather than silently dropping matching events',async t=>{
 const f=await partnerFixture(t);for(let i=0;i<5001;i++)seed(f,f.application.id,{source:i?'large-campaign':'small-campaign'});
 await assert.rejects(clicks.clickExport(f.db,f.affiliate),error=>fails(409)(error)&&/5,000/.test(error.message));const narrowed=await clicks.clickExport(f.db,f.affiliate,{q:'small-campaign'});assert.equal(narrowed.rowCount,1);assert.equal((await clicks.clickExport(f.db,f.foreignBrand)).rowCount,0);
});

test('query parsing and filters reject authority fields, duplicate keys and malformed values',async t=>{
 const f=await partnerFixture(t);for(const input of [{country:'us'},{device:'Phone'},{q:'x'.repeat(101)},{days:8},{ownerId:f.brand.userId},{applicationId:'bad'}])await assert.rejects(clicks.clickReport(f.db,f.affiliate,input),fails(400));
 for(const query of ['days=7&days=90','role=brand','userId=another','days=nope','page=-1','country=US%27%20OR%201%3D1'])assert.throws(()=>clicks.clickSearchParams(new URLSearchParams(query)),fails(400));
 const parsed=clicks.clickSearchParams(new URLSearchParams('days=7&q=%20newsletter%20&device=Mobile&country=US&page=2'));assert.equal(parsed.q,'newsletter');assert.equal(parsed.days,7);assert.equal(parsed.page,2);
});


test('authorized selections stay usable outside the bounded partnership selector',async t=>{
 const f=await partnerFixture(t),at=new Date().toISOString(),account=f.db.sqlite.prepare('INSERT INTO accounts(id,email,display_name,created_at) VALUES(?,?,?,?)'),profile=f.db.sqlite.prepare('INSERT INTO affiliate_profiles(user_id,display_name,channel,website,bio,created_at) VALUES(?,?,?,?,?,?)'),application=f.db.sqlite.prepare("INSERT INTO applications(id,program_id,affiliate_user_id,status,created_at,updated_at) VALUES(?,?,?,'rejected',?,?)");
 for(let i=0;i<2001;i++){const user='historical-'+i;account.run(user,user+'@example.com','A historical partner',at);profile.run(user,'A historical partner','Blog','','',at);application.run(crypto.randomUUID(),f.program.id,user,at,at);}
 f.db.sqlite.prepare('UPDATE affiliate_profiles SET display_name=? WHERE user_id=?').run('ZZ selected partner',f.affiliate.userId);seed(f,f.application.id);
 const report=await clicks.clickReport(f.db,f.brand,{applicationId:f.application.id});assert.equal(report.partnershipsTruncated,true);assert.ok(report.partnerships.some(p=>p.id===f.application.id));assert.equal(report.totals.total,1);assert.equal((await clicks.clickExport(f.db,f.brand,{applicationId:f.application.id})).rowCount,1);
});
