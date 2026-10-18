import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {accountPortal,portalFamily,businessPortal,type Portal} from './portal-policy.ts';
import {applicationProfile,type ApplicationProfile} from './application-profile.ts';

export type AdmissionStatus='draft'|'pending'|'changes_requested'|'approved'|'rejected';
export type PlatformApplication={user_id:string;portal:Portal;status:AdmissionStatus;profile_json:string;revision:number;submitted_at:string|null;reviewed_at:string|null;reviewed_by:string|null;review_note:string;transition_id:string|null;created_at:string;updated_at:string};
export type ApplicationView=Omit<PlatformApplication,'profile_json'|'transition_id'|'reviewed_by'>&{profile:Partial<ApplicationProfile>};
const now=()=>new Date().toISOString(),uuid=()=>crypto.randomUUID();
const resolvedPortal="COALESCE((SELECT portal FROM account_portals r WHERE r.user_id=p.user_id),p.portal)";
const fields=`p.user_id,${resolvedPortal} AS portal,p.status,p.profile_json,p.revision,p.submitted_at,p.reviewed_at,p.reviewed_by,p.review_note,p.transition_id,p.created_at,p.updated_at`;
export const getAdmission=(db:D1Database,userId:string)=>db.prepare(`SELECT ${fields} FROM platform_applications p WHERE p.user_id=?`).bind(userId).first<PlatformApplication>();
export async function isPlatformAdmin(db:D1Database,userId:string){return !!await db.prepare('SELECT user_id FROM platform_admins WHERE user_id=?').bind(userId).first();}
export async function requirePlatformAdmin(db:D1Database,identity:Identity){if(!await isPlatformAdmin(db,identity.userId))throw new AppError(403,'Only the Affimaro owner can access platform administration.');}
export async function requireApprovedAccount(db:D1Database,identity:Identity){
  const app=await getAdmission(db,identity.userId);
  if(app?.status!=='approved')throw new AppError(403,app?.status==='pending'?'Your Affimaro application is under review. Open Application status to follow it.':'Complete your Affimaro application and wait for owner approval before using the portal.');
  return app;
}
function view(row:PlatformApplication):ApplicationView{
  const {profile_json,transition_id:_,reviewed_by:__,...safe}=row;
  let profile:Partial<ApplicationProfile>={};try{profile=JSON.parse(profile_json);}catch{}
  return {...safe,profile};
}
export function admissions(db:D1Database,identity:Identity){
  const own=()=>getAdmission(db,identity.userId);
  async function start(portal:Portal,prefill:Record<string,unknown>={}){
    const actual=await accountPortal(db,identity.userId);if(actual&&actual!==portal)throw new AppError(403,'This account already belongs to the other portal.');
    const account=await db.prepare('SELECT display_name FROM accounts WHERE id=?').bind(identity.userId).first<{display_name:string}>();if(!account)throw new AppError(409,'Save your account first.');
    const initial={name:account.display_name,contactName:account.display_name,...(typeof prefill.businessName==='string'?{businessName:prefill.businessName}:{}),...(typeof prefill.channel==='string'?{channel:prefill.channel}:{}),...(businessPortal(portal)&&['starter','growth','business'].includes(String(prefill.plan))?{plan:prefill.plan}:{})},at=now(),family=portalFamily(portal);
    await db.batch([
      db.prepare(`INSERT INTO account_portals (user_id,portal,created_at) SELECT ?,?,? WHERE
        NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=? AND ?<>'brand')
        AND NOT EXISTS(SELECT 1 FROM affiliate_profiles WHERE user_id=? AND ?<>'affiliate' AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=?))
        AND NOT EXISTS(SELECT 1 FROM platform_applications WHERE user_id=? AND portal<>?) ON CONFLICT(user_id) DO NOTHING`).bind(identity.userId,portal,at,identity.userId,family,identity.userId,family,identity.userId,identity.userId,family),
      db.prepare(`INSERT INTO platform_applications (user_id,portal,status,profile_json,revision,created_at,updated_at)
        SELECT ?,?,'draft',?,1,?,? WHERE EXISTS(SELECT 1 FROM account_portals WHERE user_id=? AND portal=?)
        ON CONFLICT(user_id) DO NOTHING`).bind(identity.userId,family,JSON.stringify(initial),at,at,identity.userId,portal),
    ]);
    const app=await own();if(!app||app.portal!==portal)throw new AppError(409,'Your account type changed. Reload your application.');return view(app);
  }
  return {
    start,
    async own(){const row=await own();return row?view(row):null;},
    async history(){return (await db.prepare('SELECT action,revision,note,created_at FROM platform_review_events WHERE applicant_id=? ORDER BY rowid DESC LIMIT 20').bind(identity.userId).all<{action:string;revision:number;note:string;created_at:string}>()).results;},
    async submit(input:unknown){
      const parsed=z.object({revision:z.number().int().positive(),profile:z.unknown()}).strict().safeParse(input);if(!parsed.success)throw new AppError(400,'Check your application request.');
      const app=await own();if(!app)throw new AppError(409,'Choose your account type first.');
      if(app.status==='approved')throw new AppError(409,'Your application is already approved.');
      if(app.status==='pending')throw new AppError(409,'Your application is already under review.');
      if(app.revision!==parsed.data.revision)throw new AppError(409,'Your application changed. Reload before submitting.');
      const profile=applicationProfile(app.portal,parsed.data.profile);if(!profile.success){const issue=profile.error.issues[0];throw new AppError(400,(issue.path.join('.')||'Profile')+': '+issue.message);}
      const at=now(),token=uuid();
      await db.batch([
        db.prepare(`UPDATE platform_applications SET status='pending',profile_json=?,revision=revision+1,submitted_at=?,reviewed_at=NULL,reviewed_by=NULL,review_note='',transition_id=?,updated_at=? WHERE user_id=? AND revision=? AND status IN ('draft','changes_requested','rejected')`).bind(JSON.stringify(profile.data),at,token,at,identity.userId,app.revision),
        db.prepare(`INSERT INTO platform_review_events (id,applicant_id,actor_id,action,revision,note,created_at) SELECT ?,user_id,?,'submitted',revision,'',? FROM platform_applications WHERE user_id=? AND transition_id=?`).bind(uuid(),identity.userId,at,identity.userId,token),
      ]);
      const saved=await own();if(saved?.transition_id!==token)throw new AppError(409,'Your application changed. Reload its latest status.');return view(saved);
    },
    async edit(input:unknown){
      const parsed=z.object({revision:z.number().int().positive()}).strict().safeParse(input);if(!parsed.success)throw new AppError(400,'Reload your application.');
      const at=now(),token=uuid();await db.batch([
        db.prepare(`UPDATE platform_applications SET status='draft',revision=revision+1,transition_id=?,updated_at=? WHERE user_id=? AND revision=? AND status='pending'`).bind(token,at,identity.userId,parsed.data.revision),
        db.prepare(`INSERT INTO platform_review_events (id,applicant_id,actor_id,action,revision,note,created_at) SELECT ?,user_id,?,'withdrawn_for_edit',revision,'',? FROM platform_applications WHERE user_id=? AND transition_id=?`).bind(uuid(),identity.userId,at,identity.userId,token),
      ]);const saved=await own();if(saved?.transition_id!==token)throw new AppError(409,'Your application changed. Reload its latest status.');return view(saved);
    },
    async queue(status:AdmissionStatus='pending',portal?:Portal){
      await requirePlatformAdmin(db,identity);
      if(!['pending','changes_requested','approved','rejected','draft'].includes(status))throw new AppError(400,'Choose a valid application status.');
      const conditions=portal?` AND ${resolvedPortal}=?`:'',args=portal?[status,portal]:[status];
      const results=await db.prepare(`SELECT p.user_id,${resolvedPortal} AS portal,p.status,p.revision,p.submitted_at,p.updated_at,a.display_name,a.email FROM platform_applications p JOIN accounts a ON a.id=p.user_id WHERE p.status=?${conditions} ORDER BY p.submitted_at,p.user_id LIMIT 101`).bind(...args).all<{user_id:string;portal:Portal;status:AdmissionStatus;revision:number;submitted_at:string|null;updated_at:string;display_name:string;email:string}>();
      return {applications:results.results.slice(0,100),truncated:results.results.length>100,counts:(await db.prepare(`SELECT p.status,${resolvedPortal} AS portal,count(*) AS total FROM platform_applications p GROUP BY p.status,${resolvedPortal}`).all<{status:AdmissionStatus;portal:Portal;total:number}>()).results};
    },
    async inspect(userId:string){
      await requirePlatformAdmin(db,identity);const row=await getAdmission(db,userId);if(!row)throw new AppError(404,'Application not found.');
      const account=await db.prepare('SELECT display_name,email FROM accounts WHERE id=?').bind(userId).first<{display_name:string;email:string}>();
      const history=(await db.prepare('SELECT action,revision,note,created_at FROM platform_review_events WHERE applicant_id=? ORDER BY rowid DESC LIMIT 50').bind(userId).all()).results;
      return {application:view(row),account,history};
    },
    async review(input:unknown){
      await requirePlatformAdmin(db,identity);
      const parsed=z.object({userId:z.string().min(1).max(200),revision:z.number().int().positive(),decision:z.enum(['approved','changes_requested','rejected']),note:z.string().trim().max(1500)}).strict().safeParse(input);if(!parsed.success)throw new AppError(400,'Check the review decision.');
      const value=parsed.data;if(value.userId===identity.userId)throw new AppError(403,'You cannot review your own application.');
      if(value.decision!=='approved'&&value.note.length<10)throw new AppError(400,'Explain the changes or rejection in at least 10 characters.');
      const app=await getAdmission(db,value.userId);if(!app)throw new AppError(404,'Application not found.');
      if(app.status!=='pending'||app.revision!==value.revision)throw new AppError(409,'This application changed or has already been reviewed. Reload before deciding.');
      const profile=applicationProfile(app.portal,JSON.parse(app.profile_json));if(!profile.success)throw new AppError(409,'A complete valid profile is required before review.');
      const p=profile.data,at=now(),token=uuid(),workspaceId=uuid(),programId=uuid();
      const statements=[
        db.prepare(`UPDATE platform_applications SET status=?,revision=revision+1,reviewed_at=?,reviewed_by=?,review_note=?,transition_id=?,updated_at=? WHERE user_id=? AND revision=? AND status='pending'`).bind(value.decision,at,identity.userId,value.note,token,at,value.userId,value.revision),
        db.prepare(`INSERT INTO platform_review_events (id,applicant_id,actor_id,action,revision,note,created_at) SELECT ?,user_id,?,?,revision,?,? FROM platform_applications WHERE user_id=? AND transition_id=?`).bind(uuid(),identity.userId,value.decision,value.note,at,value.userId,token),
      ];
      if(value.decision==='approved'){
        if(businessPortal(app.portal)&&'businessName' in p){
          statements.push(
            db.prepare(`INSERT INTO workspaces (id,owner_id,name,website,created_at) SELECT ?,user_id,?,?,? FROM platform_applications WHERE user_id=? AND transition_id=? AND portal='brand' AND status='approved' AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=?) AND NOT EXISTS(SELECT 1 FROM affiliate_profiles WHERE user_id=?)`).bind(workspaceId,p.businessName,p.primaryUrl,at,value.userId,token,value.userId,value.userId),
            db.prepare(`INSERT INTO programs (id,workspace_id,name,rate_bps,window_days,active,created_at) SELECT ?,w.id,'Store partners',1000,30,1,? FROM workspaces w JOIN platform_applications a ON a.user_id=w.owner_id WHERE a.user_id=? AND a.transition_id=? AND a.status='approved' AND a.portal='brand' AND NOT EXISTS(SELECT 1 FROM programs WHERE workspace_id=w.id)`).bind(programId,at,value.userId,token),
            db.prepare(`INSERT INTO program_rule_revisions (id,program_id,rate_bps,window_days,active,effective_at) SELECT ?,p.id,1000,30,1,? FROM programs p JOIN workspaces w ON w.id=p.workspace_id JOIN platform_applications a ON a.user_id=w.owner_id WHERE p.id=? AND a.user_id=? AND a.transition_id=?`).bind(uuid(),at,programId,value.userId,token),
          );
        }else if(!businessPortal(app.portal)&&'channel' in p){
          statements.push(db.prepare(`INSERT INTO affiliate_profiles (user_id,display_name,channel,website,bio,created_at) SELECT user_id,?,?,?,?,? FROM platform_applications WHERE user_id=? AND transition_id=? AND portal='affiliate' AND status='approved' AND NOT EXISTS(SELECT 1 FROM workspaces WHERE owner_id=?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,channel=excluded.channel,website=excluded.website,bio=excluded.bio`).bind(p.name,p.channel,p.primaryUrl,p.description,at,value.userId,token,value.userId));
        }
      }
      if(value.decision==='approved'&&businessPortal(app.portal)&&'plan' in p){
        statements.push(db.prepare(`INSERT INTO plan_requests (user_id,requested_plan,active_plan,status,revision,updated_at)
          SELECT user_id,?,?,'approved',1,? FROM platform_applications WHERE user_id=? AND transition_id=? AND status='approved'
          ON CONFLICT(user_id) DO UPDATE SET requested_plan=excluded.requested_plan,active_plan=excluded.active_plan,status='approved',revision=plan_requests.revision+1,updated_at=excluded.updated_at`).bind(p.plan,p.plan,at,value.userId,token));
      }
      await db.batch(statements);const saved=await getAdmission(db,value.userId);if(saved?.transition_id!==token)throw new AppError(409,'This application changed. Your decision was not saved.');return view(saved);
    },
  };
}
