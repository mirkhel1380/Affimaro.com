import {generateKeyPairSync} from 'node:crypto';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {decryptMigration,migrationStatements,validateAgainstSchema,mappingStatement} from '../self-hosted/migration-local.mjs';
import {migrationTables} from '../self-hosted/migration-schema.ts';
const args=process.argv.slice(2),mode=args[0],flag=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const project=process.cwd(),config=flag('--config')||'dist-self-hosted/server/wrangler.json';
async function target(){
  const value=JSON.parse(await readFile(config,'utf8'));
  if(value.name!=='affimaro'||!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID||value.account_id!==process.env.CLOUDFLARE_ACCOUNT_ID||!value.vars?.APP_ORIGIN||value.vars.APP_ORIGIN!==process.env.APP_ORIGIN||value.vars.APP_ORIGIN.endsWith('.chatgpt.site')||value.vars.APP_ORIGIN.endsWith('.invalid')||!value.d1_databases?.[0]?.database_id||value.d1_databases[0].database_id.startsWith('00000000-'))throw new Error('Target database configuration must point to the prepared independent deployment.');
}
function wrangler(command,input){
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...command,'--config',config],{encoding:'utf8',input,stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});
  // Provider/SQL error output can contain sensitive rows; never echo it here.
  if(result.status!==0)throw new Error('Cloudflare operation failed. Keep traffic paused; inspect the target privately before retrying or use a new empty database.');
  return result.stdout;
}
function query(sql){const raw=JSON.parse(wrangler(['d1','execute','DB','--remote','--json','--command',sql]));if(!Array.isArray(raw)||raw.some(result=>result.success===false))throw new Error('Target database check failed.');return raw;}
async function password(){
  if(!process.stdin.isTTY){let value='';for await(const chunk of process.stdin){value+=chunk;if(value.length>1024)throw new Error('Passphrase is too long.');}return value.replace(/\r?\n$/,'');}
  process.stdout.write('Migration private-key passphrase (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  return new Promise((resolve,reject)=>{let value='';const done=(error)=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};const read=chunk=>{for(const character of chunk){if(character==='\u0003')return done(new Error('Cancelled.'));if(character==='\r'||character==='\n')return done();if(character==='\u007f')value=value.slice(0,-1);else value+=character;if(value.length>1024)return done(new Error('Passphrase is too long.'));}};process.stdin.on('data',read);});
}
try{
  if(mode==='keygen'){
    const passphrase=await password();if(passphrase.length<16)throw new Error('Use a passphrase of at least 16 characters.');
    await mkdir('.migration',{recursive:true,mode:0o700});
    const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase}});
    await writeFile('.migration/recipient-private.pem',pair.privateKey,{mode:0o600,flag:'wx'});await writeFile('.migration/recipient-public.pem',pair.publicKey,{mode:0o600,flag:'wx'});
    console.log('Migration key pair created in .migration/. Keep the encrypted private key and passphrase separate. Configure only recipient-public.pem on the source Site.');
  }else if(mode==='inspect'||mode==='import'){
    if(!flag('--bundle'))throw new Error('Provide --bundle with the encrypted export path.');
    const payload=decryptMigration(await readFile(resolve(flag('--bundle')),'utf8'),await readFile(flag('--key')||'.migration/recipient-private.pem','utf8'),await password());
    validateAgainstSchema(payload,project);
    console.log('Migration validated. Created '+payload.createdAt+'. '+Object.entries(payload.tables).map(([table,rows])=>table+': '+rows.length).join(', ')+'.');
    if(mode==='import'){
      if(!args.includes('--apply'))throw new Error('Import is ready. Add --apply only for a new, empty target database.');
      await target();
      if(Date.now()-Date.parse(payload.createdAt)>86400000||Date.parse(payload.createdAt)>Date.now()+300000)throw new Error('Create a fresh export from the paused source.');
      const counts=query(Object.keys(migrationTables).concat(['auth_sessions','auth_rate_limits']).map(table=>`SELECT count(*) n FROM "${table}";`).join('\n'));
      if(counts.length!==Object.keys(migrationTables).length+2||counts.some(result=>result.results?.length!==1||result.results[0].n!==0))throw new Error('Target must be empty. No rows were imported.');
      const temporary=await mkdtemp(join(tmpdir(),'affimaro-import-'));
      try{const file=join(temporary,'import.sql');await writeFile(file,migrationStatements(payload).join('\n'),{mode:0o600});wrangler(['d1','execute','DB','--remote','--file',file,'--yes']);}finally{await rm(temporary,{recursive:true,force:true});}
      const verification=query(Object.keys(migrationTables).map(table=>`SELECT count(*) n FROM "${table}";`).join('\n'));
      if(verification.length!==Object.keys(migrationTables).length||verification.some((result,index)=>result.results?.[0]?.n!==payload.tables[Object.keys(migrationTables)[index]].length))throw new Error('Import counts differ. Keep the target offline and inspect it before proceeding.');
      wrangler(['secret','bulk'],JSON.stringify(payload.settings));
      console.log('Rows and original payment/billing settings copied to the independent target. Link verified identities before opening traffic. The source remains paused.');
    }
  }else if(mode==='link'){
    await target();
    const accountId=flag('--account-id'),providerId=flag('--provider-id'),origin=process.env.SUPABASE_URL,key=process.env.SUPABASE_ADMIN_KEY;
    if(!accountId||!providerId||!/^[a-f0-9-]{36}$/i.test(providerId)||!/^https:\/\/[a-z0-9-]{6,80}\.supabase\.co$/.test(origin||'')||!key)throw new Error('Set SUPABASE_URL and a temporary SUPABASE_ADMIN_KEY; provide --account-id and --provider-id.');
    const response=await fetch(origin+'/auth/v1/admin/users/'+providerId,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:'Bearer '+key}});
    if(!response.ok){await response.body?.cancel();throw new Error('Supabase could not verify this provider identity.');}
    const user=await response.json();if(user.id!==providerId)throw new Error('Supabase identity did not match.');
    const sql=mappingStatement(accountId,user);if(!args.includes('--apply')){console.log('Verified provider identity. Add --apply to link it to the selected original account.');process.exit(0);}
    query(sql);const escaped=value=>"'"+value.replaceAll("'","''")+"'",result=query(`SELECT count(*) n FROM auth_identities WHERE provider_id=${escaped(providerId)} AND user_id=${escaped(accountId)};`);
    if(result[0]?.results?.[0]?.n!==1)throw new Error('No mapping was created. Check the original account ID and verified email privately.');
    console.log('Verified identity linked. Existing account, workspace and encrypted record identifiers are preserved.');
  }else throw new Error('Choose keygen, inspect --bundle PATH, import --bundle PATH [--apply], or link --account-id ID --provider-id UUID [--apply].');
}catch(error){
  // Unexpected crypto, JSON and database errors may include data. Report only our fixed messages.
  const message=error instanceof Error?error.message:'';
  const safe=/^(Use |Invalid migration |Unsupported migration |Migration payload|Foreign-key validation|Provide |Import is ready|Target must|Cloudflare operation|Target database|Create a fresh|Import counts|Set SUPABASE|Supabase could|Supabase identity|No mapping|Choose |Cancelled|Passphrase|Migration private)/.test(message);
  console.error(safe?message:'Migration could not be completed. Verify the encrypted file, private key, passphrase and target configuration privately.');process.exit(1);
}
