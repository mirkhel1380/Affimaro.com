import {seedOrder} from './order-history.js';
export function seedReportPartners(f,count,{programId=f.program.id,store=f.connected.connection,created='2026-10-24T10:00:00.000Z'}={}){
 const apps=[],at='2026-10-24T10:00:00.000Z';
 f.db.sqlite.exec('BEGIN');try{for(let i=0;i<count;i++){
  const userId='export-partner-'+crypto.randomUUID(),application={id:crypto.randomUUID(),program_id:programId,affiliate_user_id:userId};
  f.db.sqlite.prepare('INSERT INTO accounts (id,email,display_name,created_at) VALUES (?,?,?,?)').run(userId,userId+'@example.com','Export member '+i,at);
  f.db.sqlite.prepare("INSERT INTO affiliate_profiles (user_id,display_name,channel,bio,created_at) VALUES (?,?,'Blog','',?)").run(userId,'Export partner '+String(i).padStart(5,'0'),at);
  f.db.sqlite.prepare("INSERT INTO applications (id,program_id,affiliate_user_id,status,created_at,updated_at) VALUES (?,?,?,'approved',?,?)").run(application.id,programId,userId,at,at);
  seedOrder(f,application,store,{external:'EXPORT-'+application.id,created});apps.push(application);
 }f.db.sqlite.exec('COMMIT');}catch(error){f.db.sqlite.exec('ROLLBACK');throw error;}return apps;
}
export function reportCsvRows(text){
 const cells=[...text.replace(/^\uFEFF/,'').matchAll(/"((?:""|[^"])*)"(?:,|\r\n|$)/g)].map(m=>m[1].replaceAll('""','"')),columns=cells.splice(0,26),rows=[];
 if(cells.length%columns.length)throw new Error('Malformed report CSV');for(let i=0;i<cells.length;i+=columns.length)rows.push(Object.fromEntries(columns.map((key,index)=>[key,cells[i+index]])));return rows;
}
