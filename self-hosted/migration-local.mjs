import {constants,createDecipheriv,privateDecrypt} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {migrationTables} from './migration-schema.ts';
import {migrationSettings} from './migration.ts';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function decryptMigration(raw,privateKey,passphrase){
  if(typeof raw!=='string'||Buffer.byteLength(raw)>6*1024*1024)throw new Error('Invalid migration envelope.');
  const envelope=JSON.parse(raw);
  if(!only(envelope,['format','version','algorithm','iv','wrappedKey','ciphertext'])||envelope.format!=='affimaro-encrypted-migration'||envelope.version!==1||envelope.algorithm!=='RSA-OAEP-SHA256+A256GCM')throw new Error('Invalid migration envelope.');
  for(const key of ['iv','wrappedKey','ciphertext'])if(typeof envelope[key]!=='string'||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(envelope[key]))throw new Error('Invalid migration encoding.');
  const iv=Buffer.from(envelope.iv,'base64'),wrapped=Buffer.from(envelope.wrappedKey,'base64'),cipher=Buffer.from(envelope.ciphertext,'base64');
  if(iv.length!==12||wrapped.length<384||wrapped.length>1024||cipher.length<16||cipher.length>4*1024*1024+16)throw new Error('Invalid migration size.');
  const secret=privateDecrypt({key:privateKey,passphrase,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},wrapped);
  try{const decipher=createDecipheriv('aes-256-gcm',secret,iv);decipher.setAAD(Buffer.from('Affimaro/migration/v1'));decipher.setAuthTag(cipher.subarray(-16));return validateMigration(JSON.parse(Buffer.concat([decipher.update(cipher.subarray(0,-16)),decipher.final()]).toString('utf8')));}finally{secret.fill(0);}
}
export function validateMigration(value){
  if(!only(value,['format','version','schema','sourceOrigin','createdAt','tables','settings'])||value.format!=='affimaro-migration'||value.version!==1||value.schema!==10||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw new Error('Unsupported migration version.');
  const origin=new URL(value.sourceOrigin);if(origin.protocol!=='https:'||origin.origin!==value.sourceOrigin)throw new Error('Invalid migration source.');
  if(!only(value.tables,Object.keys(migrationTables))||!object(value.settings)||Object.keys(value.settings).some(key=>!migrationSettings.includes(key)||typeof value.settings[key]!=='string'||value.settings[key].length>10000)||!/^[a-f0-9]{64}$/.test(value.settings.PAYMENT_DATA_KEY_V1||''))throw new Error('Invalid migration settings or table list.');
  for(const [table,columns] of Object.entries(migrationTables)){
    const rows=value.tables[table];if(!Array.isArray(rows)||rows.length>5000)throw new Error('Invalid migration row count.');
    for(const row of rows)if(!only(row,columns)||Object.values(row).some(cell=>cell!==null&&typeof cell!=='string'&&(typeof cell!=='number'||!Number.isSafeInteger(cell))))throw new Error('Invalid migration row.');
  }
  if(Buffer.byteLength(JSON.stringify(value))>4*1024*1024)throw new Error('Migration payload is too large.');
  return value;
}
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):value.includes('\0')?"CAST(X'"+Buffer.from(value).toString('hex')+"' AS TEXT)":"'"+value.replaceAll("'","''")+"'";
export function migrationStatements(payload){
  validateMigration(payload);const statements=[];
  for(const [table,columns] of Object.entries(migrationTables))for(const row of payload.tables[table])statements.push(`INSERT INTO "${table}" (${columns.map(column=>'"'+column+'"').join(',')}) VALUES (${columns.map(column=>literal(row[column])).join(',')});`);
  return statements;
}
export function validateAgainstSchema(payload,project){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  try{for(const file of readdirSync(project+'/drizzle').filter(file=>/^\d{4}_.+\.sql$/.test(file)).sort())db.exec(readFileSync(project+'/drizzle/'+file,'utf8'));db.exec('BEGIN');for(const statement of migrationStatements(payload))db.exec(statement);db.exec('COMMIT');if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Foreign-key validation failed.');}finally{db.close();}
}
export function mappingStatement(accountId,user){
  if(typeof accountId!=='string'||!accountId||accountId.length>200||!object(user)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)||typeof user.email!=='string'||!user.email_confirmed_at||!Number.isFinite(Date.parse(user.email_confirmed_at)))throw new Error('Use a verified Supabase identity and the original account ID.');
  return `INSERT INTO auth_identities (provider_id,user_id,created_at) SELECT ${literal(user.id)},id,${literal(new Date().toISOString())} FROM accounts WHERE id=${literal(accountId)} AND lower(email)=${literal(user.email.toLowerCase())} AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE provider_id=${literal(user.id)} AND user_id=${literal(accountId)});`;
}
