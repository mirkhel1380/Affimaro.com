import {database} from './db.js';
import {service} from '../../lib/service.ts';
import {applicationProfile} from './application-profiles.js';
export const queueAt='2026-10-24T00:00:00.000Z';
export async function queueFixture(t){const db=database(t),owner={userId:'queue-owner',email:'owner@example.com'};await service(db,owner).saveAccount({name:'Queue owner'});db.sqlite.prepare('INSERT INTO platform_admins VALUES (?,?)').run(owner.userId,queueAt);return {db,owner};}
export function seedApplicant(f,id,role='affiliate',options={}){
 const v={status:'pending',name:'Applicant '+id,email:id+'@example.com',profile:applicationProfile(role),submitted:queueAt,revision:2,...options};
 f.db.sqlite.prepare('INSERT INTO accounts VALUES (?,?,?,?)').run(id,v.email,v.name,queueAt);
 f.db.sqlite.prepare('INSERT INTO account_portals VALUES (?,?,?)').run(id,role,queueAt);
 f.db.sqlite.prepare('INSERT INTO platform_applications(user_id,portal,status,profile_json,revision,submitted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id,['brand','agency'].includes(role)?'brand':'affiliate',v.status,typeof v.profile==='string'?v.profile:JSON.stringify(v.profile),v.revision,v.status==='draft'?null:v.submitted,queueAt,queueAt);
 return {userId:id,email:v.email,role,...v};
}
