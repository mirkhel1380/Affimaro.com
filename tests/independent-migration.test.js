import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {database} from './support/db.js';
import {service,AppError} from '../lib/service.ts';
import {sealPayment,openPayment} from '../lib/payment-crypto.ts';
import {encryptedMigration,requireMigrationOwner,migrationMaintenance} from '../self-hosted/migration.ts';
import {migrationTables} from '../self-hosted/migration-schema.ts';
import {decryptMigration,validateMigration,migrationStatements,validateAgainstSchema,mappingStatement} from '../self-hosted/migration-local.mjs';
import {deploymentSettings,verifiedEmailSettings} from '../self-hosted/preflight.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:'LONG FIXTURE PASSPHRASE'}});
const key='ab'.repeat(32),values={AFFIMARO_MIGRATION_MAINTENANCE:'true',AFFIMARO_MIGRATION_EXPORT_PUBLIC_KEY:pair.publicKey,PAYMENT_DATA_KEY_V1:key},uid='11111111-1111-4111-8111-111111111111';
const decode=bundle=>decryptMigration(JSON.stringify(bundle),pair.privateKey,'LONG FIXTURE PASSPHRASE'),fails=status=>error=>error instanceof AppError&&error.status===status;
async function fixture(t){const db=database(t),owner=service(db,{userId:'native-owner-id',email:'owner@example.com'});await owner.saveAccount({name:"Owner O'Brien'); DROP TABLE accounts;--"});await owner.createBusiness({name:'Preserved workspace',website:''});return {db,owner};}

test('migration export is explicitly owner-gated and disabled without a paused source',async t=>{
  const f=await fixture(t);for(const [id,settings] of [[undefined,{}],['owner',{}],['other',{AFFIMARO_MIGRATION_ENABLED:'true',AFFIMARO_MIGRATION_OWNER_ID:'owner'}]])assert.throws(()=>requireMigrationOwner(id,settings),fails(404));
  requireMigrationOwner('owner',{AFFIMARO_MIGRATION_ENABLED:'true',AFFIMARO_MIGRATION_OWNER_ID:'owner'});
  await assert.rejects(encryptedMigration(f.db,{...values,AFFIMARO_MIGRATION_MAINTENANCE:'false'},'https://source.example'),fails(409));
  await assert.rejects(encryptedMigration(f.db,{...values,PAYMENT_DATA_KEY_V1:''},'https://source.example'),fails(503));
  await assert.rejects(encryptedMigration(f.db,{...values,AFFIMARO_MIGRATION_EXPORT_PUBLIC_KEY:'invalid'},'https://source.example'),fails(503));
});
test('maintenance blocks browser writes, machine delivery and pages with potential writes, while leaving encrypted export available',()=>{
  for(const [path,method] of [['/api/woocommerce/event','POST'],['/api/payments','POST'],['/billing','GET'],['/workspace','GET'],['/auth/login','POST']]){
    const req=new Request('https://source.example'+path,{method});assert.equal(migrationMaintenance(req,{}),null);assert.equal(migrationMaintenance(req,values).status,503);
  }
  for(const [path,method] of [['/migration','GET'],['/api/migration/export','POST'],['/demo/app.js','GET'],['/','GET']])assert.equal(migrationMaintenance(new Request('https://source.example'+path,{method}),values),null);
});
test('encrypted migration preserves IDs and payment keys without exporting authentication sessions or unrelated runtime credentials',async t=>{
  const f=await fixture(t),encrypted=await sealPayment({account:'FIXTURE_PRIVATE_BANK_ACCOUNT'},key,'bank/native-owner-id');
  f.db.sqlite.prepare('INSERT INTO bank_profiles VALUES (?,?,?,?,?)').run('native-owner-id',encrypted,'ending 1234','USD',new Date().toISOString());
  f.db.sqlite.prepare('INSERT INTO auth_identities VALUES (?,?,?)').run(uid,'native-owner-id',new Date().toISOString());
  f.db.sqlite.prepare('INSERT INTO auth_sessions (id,token_hash,provider_id,user_id,encrypted_tokens,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').run('private-session','FIXTURE_SESSION_TOKEN_HASH',uid,'native-owner-id','FIXTURE_PROVIDER_SESSION',1,new Date().toISOString());
  const bundle=await encryptedMigration(f.db,{...values,NATIVE_OAUTH_SECRET:'UNRELATED_NATIVE_SECRET',AUTH_SESSION_ENCRYPTION_KEY:'AUTH_SECRET_NOT_FOR_EXPORT'},'https://source.example'),serialized=JSON.stringify(bundle);
  for(const secret of [key,'FIXTURE_PRIVATE_BANK_ACCOUNT','FIXTURE_SESSION_TOKEN_HASH','FIXTURE_PROVIDER_SESSION','UNRELATED_NATIVE_SECRET','native-owner-id'])assert.ok(!serialized.includes(secret));
  const payload=decode(bundle);assert.equal(payload.tables.accounts[0].id,'native-owner-id');assert.equal(payload.settings.PAYMENT_DATA_KEY_V1,key);assert.deepEqual(Object.keys(payload.settings),['PAYMENT_DATA_KEY_V1']);assert.ok(!Object.hasOwn(payload.tables,'auth_sessions'));assert.equal(payload.tables.auth_identities.length,1);
  assert.equal((await openPayment(payload.tables.bank_profiles[0].encrypted_details,key,'bank/native-owner-id')).account,'FIXTURE_PRIVATE_BANK_ACCOUNT');
  validateAgainstSchema(payload,process.cwd());
  const target=new DatabaseSync(':memory:');t.after(()=>target.close());target.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())target.exec(readFileSync('drizzle/'+file,'utf8'));for(const statement of migrationStatements(payload))target.exec(statement);
  assert.equal(target.prepare('SELECT display_name FROM accounts').get().display_name,(await f.owner.account()).display_name);assert.equal(target.prepare('SELECT owner_id FROM workspaces').get().owner_id,'native-owner-id');assert.equal(target.prepare('SELECT count(*) n FROM auth_sessions').get().n,0);
});
test('migration envelopes reject tampering, wrong passphrases, unexpected tables/columns and unsafe values',async t=>{
  const f=await fixture(t),bundle=await encryptedMigration(f.db,values,'https://source.example'),payload=decode(bundle);
  const cipher=Buffer.from(bundle.ciphertext,'base64');cipher[0]^=1;assert.throws(()=>decode({...bundle,ciphertext:cipher.toString('base64')}));assert.throws(()=>decryptMigration(JSON.stringify(bundle),pair.privateKey,'wrong'));
  for(const mutate of [p=>p.tables.auth_sessions=[],p=>p.tables.accounts[0].extra='injected',p=>p.tables.accounts[0].id={sql:'bad'},p=>p.settings.NATIVE_OAUTH_SECRET='bad',p=>p.tables.accounts[0].created_at=Infinity]){const candidate=structuredClone(payload);mutate(candidate);assert.throws(()=>validateMigration(candidate));}
  const broken=structuredClone(payload);broken.tables.workspaces[0].owner_id='missing';assert.throws(()=>validateAgainstSchema(broken,process.cwd()));
});
test('unresolved financial operations and sync leases prevent migration',async t=>{
  const f=await fixture(t),workspace=await f.owner.workspace();f.db.sqlite.prepare('INSERT INTO billing_accounts (id,workspace_id,platform_id,mode,lease_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run('billing',workspace.id,'acct_FIXTURE123','live','in-flight',new Date().toISOString(),new Date().toISOString());
  await assert.rejects(encryptedMigration(f.db,values,'https://source.example'),fails(409));
  f.db.sqlite.prepare('UPDATE billing_accounts SET lease_id=NULL').run();
  f.db.sqlite.prepare("INSERT INTO billing_checkouts (id,account_id,workspace_id,price_id,amount,state,first_submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,'review',?,?,?)").run('checkout','billing',workspace.id,'price_FIXTURE123',1900,new Date().toISOString(),new Date().toISOString(),new Date().toISOString());
  await assert.rejects(encryptedMigration(f.db,values,'https://source.example'),fails(409));
  f.db.sqlite.prepare("UPDATE billing_checkouts SET state='expired'").run();assert.equal(decode(await encryptedMigration(f.db,values,'https://source.example')).tables.billing_checkouts[0].state,'expired');
});
test('export refuses row counts above its bound rather than silently truncating',async t=>{
  const f=await fixture(t),insert=f.db.sqlite.prepare('INSERT INTO accounts VALUES (?,?,?,?)');f.db.sqlite.exec('BEGIN');for(let i=0;i<5000;i++)insert.run('extra-'+i,'extra@example.com','Extra',new Date().toISOString());f.db.sqlite.exec('COMMIT');await assert.rejects(encryptedMigration(f.db,values,'https://source.example'),fails(413));
});
test('operator identity mapping requires verified email and preserves existing identity uniqueness',async t=>{
  const f=await fixture(t),user={id:uid,email:'owner@example.com',email_confirmed_at:new Date().toISOString()};assert.throws(()=>mappingStatement('native-owner-id',{...user,email_confirmed_at:null}));
  f.db.sqlite.exec(mappingStatement('native-owner-id',{...user,email:'wrong@example.com'}));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM auth_identities').get().n,0);
  f.db.sqlite.exec(mappingStatement('native-owner-id',user));f.db.sqlite.exec(mappingStatement('native-owner-id',user));assert.equal(f.db.sqlite.prepare('SELECT user_id FROM auth_identities').get().user_id,'native-owner-id');
  assert.throws(()=>f.db.sqlite.exec(mappingStatement('native-owner-id',{...user,id:'22222222-2222-4222-8222-222222222222'})));
});
test('deployment preflight rejects placeholders, privileged keys, wrong origins and changed payment-key reuse',()=>{
  const env={CLOUDFLARE_API_TOKEN:'FIXTURE_TOKEN',CLOUDFLARE_ACCOUNT_ID:'ac'.repeat(16),CLOUDFLARE_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',APP_ORIGIN:'https://affimaro.example',SUPABASE_URL:'https://fixture-project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FIXTURE_KEY_123456789012',AUTH_SESSION_ENCRYPTION_KEY:'cd'.repeat(32),PAYMENT_DATA_KEY_V1:key};
  assert.equal(deploymentSettings(env).origin,env.APP_ORIGIN);
  for(const change of [{CLOUDFLARE_API_TOKEN:''},{CLOUDFLARE_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000000'},{APP_ORIGIN:'https://affimaro-preview.kindsky66.chatgpt.site'},{APP_ORIGIN:'https://configure.invalid'},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_PRIVATE'},{AUTH_SESSION_ENCRYPTION_KEY:key},{APP_ORIGIN:'https://affimaro.example/path'}])assert.throws(()=>deploymentSettings({...env,...change}));
});
test('deployment preflight checks the verified-email provider policy without credentials or writes',async()=>{
  const settings={supabaseUrl:'https://fixture-project.supabase.co'},key='sb_publishable_FIXTURE_KEY_123456789012';
  const fetcher=body=>async(url,init)=>{assert.equal(url,settings.supabaseUrl+'/auth/v1/settings');assert.equal(init.headers.apikey,key);assert.equal(init.method,undefined);assert.equal(init.redirect,'error');assert.equal(init.body,undefined);return Response.json(body);};
  await verifiedEmailSettings(settings,key,fetcher({mailer_autoconfirm:false,external:{email:true}}));
  for(const body of [{mailer_autoconfirm:true,external:{email:true}},{mailer_autoconfirm:false,external:{email:false}},{other:'value'}])await assert.rejects(verifiedEmailSettings(settings,key,fetcher(body)));
  await assert.rejects(verifiedEmailSettings(settings,key,async()=>new Response('a'.repeat(70000))));
});
