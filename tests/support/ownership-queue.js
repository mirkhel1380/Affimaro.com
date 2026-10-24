import {queueFixture,seedApplicant,queueAt} from './admission-queue.js';
export {queueFixture,seedApplicant,queueAt};
export function seedProperty(f,userId,options={}){
 const p={id:crypto.randomUUID(),kind:'Website',platform:'Website / blog',name:'Example property',url:'https://property-'+crypto.randomUUID()+'.example/',status:'review_pending',archived:0,challenge:'affimaro-verify='+crypto.randomUUID(),at:queueAt,...options},expires=new Date(Date.now()+86400000).toISOString();
 f.db.sqlite.prepare('INSERT INTO media_properties(id,user_id,kind,platform,name,url,relationship,challenge,challenge_expires_at,method,status,proof_url,review_note,verified_at,revision,archived,created_at,updated_at) VALUES (?,?,?,?,?,?,\'Owner\',?,?,\'public_challenge\',?,?,?, ?,2,?,?,?)').run(p.id,userId,p.kind,p.platform,p.name,p.url,p.challenge,expires,p.status,p.url,'The public verification code appears on this exact property.',p.status==='verified'?new Date().toISOString():null,p.archived,p.at,p.at);return {...p,user_id:userId,revision:2,challenge_expires_at:expires};
}
export function seedPropertyQueue(f,total=131,role='creator'){
 const rows=[];for(let i=0;i<total;i++){const user='member-'+String(Math.floor(i/10)).padStart(3,'0');if(i%10===0)seedApplicant(f,user,role);rows.push(seedProperty(f,user,{id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0'),name:'Property '+i,url:'https://site-'+i+'.example/'}));}return rows;
}
