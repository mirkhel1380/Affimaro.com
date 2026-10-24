import { z } from "zod";
import {accountPortal,portalFamily} from './portal-policy.ts';
import {partnerApprovalCondition,type PartnerApprovalSnapshot} from './partner-approval.ts';
import {timeAfter} from './partnership-time.ts';

export type Identity = { userId: string; email: string };
export type Account = {id:string;email:string;display_name:string;created_at:string};
export type Workspace = {id:string;owner_id:string;name:string;website:string|null;created_at:string};
export type Program = {id:string;workspace_id:string;name:string;rate_bps:number;window_days:number;active:number;created_at:string};
export type AffiliateProfile = {user_id:string;display_name:string;channel:string;website:string|null;bio:string;created_at:string};
export type Partner = {id:string;status:string;created_at:string;updated_at:string;display_name:string;email:string;channel:string;website:string|null;bio:string};
export type Membership = {id:string;program_id:string;status:string;created_at:string;updated_at:string;program_name:string;rate_bps:number;window_days:number;active:number;business_name:string;website:string|null};
export type Audit = {id:string;action:string;created_at:string};
export class AppError extends Error {
  status: number;
  constructor(status:number,message:string){super(message);this.status=status;}
}
const name=z.string().trim().min(2,"Use at least two characters.").max(60,"Use no more than 60 characters.");
const website=z.string().trim().max(300).refine(value=>{
  if(!value)return true;
  try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
},"Use a complete http:// or https:// website URL.").transform(v=>v||null);
const schemas={
  account:z.object({name}).strict(),
  business:z.object({name,website}).strict(),
  affiliate:z.object({name,channel:z.enum(['Content creator','Newsletter','Community','Blog','Other']),website,bio:z.string().trim().max(500)}).strict(),
  program:z.object({name,rate:z.number().min(1).max(50).refine(v=>Math.abs(v*100-Math.round(v*100))<0.000001,"Use up to two decimal places."),windowDays:z.number().int().min(1).max(90),active:z.boolean()}).strict(),
  application:z.object({programId:z.string().uuid()}).strict(),
  review:z.object({applicationId:z.string().uuid(),status:z.enum(['approved','suspended','rejected'])}).strict(),
};
function parse<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S> {
  const result=schema.safeParse(input);
  if(!result.success)throw new AppError(400,result.error.issues[0]?.message||"Check the form and try again.");
  return result.data;
}
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();

// Identity is supplied only by the server's dispatch-authenticated request helper.
// Every business query derives the owner from that identity, never from form data.
export function service(db:D1Database,identity:Identity) {
  if(!identity.userId||!identity.email)throw new AppError(401,"Sign in to continue.");
  const one=<T>(query:string,...values:unknown[])=>db.prepare(query).bind(...values).first<T>();
  const all=async<T>(query:string,...values:unknown[])=>(await db.prepare(query).bind(...values).all<T>()).results;
  const account=()=>one<Account>("SELECT * FROM accounts WHERE id = ?",identity.userId);
  const workspace=()=>one<Workspace>("SELECT * FROM workspaces WHERE owner_id = ?",identity.userId);
  const profile=()=>one<AffiliateProfile>("SELECT * FROM affiliate_profiles WHERE user_id = ?",identity.userId);
  const requireAccount=async()=>{const row=await account();if(!row)throw new AppError(409,"Create your Affimaro profile first.");return row;};
  const requireWorkspace=async()=>{await requireAccount();const row=await workspace();if(!row)throw new AppError(404,"Your business workspace was not found.");return row;};
  const event=(workspaceId:string,action:string)=>db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) VALUES (?,?,?,?,?)").bind(id(),workspaceId,identity.userId,action,now());
  return {
    account,workspace,profile,
    async saveAccount(input:unknown) {
      const value=parse(schemas.account,input);
      await db.prepare("INSERT INTO accounts (id,email,display_name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,email=excluded.email").bind(identity.userId,identity.email,value.name,now()).run();
      return account();
    },
    async createBusiness(input:unknown) {
      await requireAccount();const value=parse(schemas.business,input);
      const existing=await workspace();if(existing)return existing;
      if(await profile())throw new AppError(403,'Affiliate accounts cannot create a brand workspace.');
      const workspaceId=id(),programId=id(),created=now();
      try {
        await db.batch([
          db.prepare("INSERT INTO workspaces (id,owner_id,name,website,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM affiliate_profiles WHERE user_id=?)").bind(workspaceId,identity.userId,value.name,value.website,created,identity.userId),
          db.prepare("INSERT INTO programs (id,workspace_id,name,rate_bps,window_days,active,created_at) VALUES (?,?,?,?,?,?,?)").bind(programId,workspaceId,'Store partners',1000,30,1,created),
          db.prepare('INSERT INTO program_rule_revisions (id,program_id,rate_bps,window_days,active,effective_at) VALUES (?,?,1000,30,1,?)').bind(id(),programId,created),
          event(workspaceId,'workspace_created'),
        ]);
      }catch(error){if(await workspace())return workspace();if(await profile())throw new AppError(403,'Affiliate accounts cannot create a brand workspace.');throw error;}
      return workspace();
    },
    async saveBusiness(input:unknown) {
      const value=parse(schemas.business,input),business=await requireWorkspace();
      await db.batch([
        db.prepare("UPDATE workspaces SET name=?,website=? WHERE id=? AND owner_id=?").bind(value.name,value.website,business.id,identity.userId),
        event(business.id,'workspace_updated'),
      ]);
      return workspace();
    },
    async saveAffiliate(input:unknown) {
      await requireAccount();const value=parse(schemas.affiliate,input);
      if(await workspace())throw new AppError(403,'Brand accounts cannot create or edit an affiliate profile.');
      await db.prepare("INSERT INTO affiliate_profiles (user_id,display_name,channel,website,bio,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE owner_id=?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,channel=excluded.channel,website=excluded.website,bio=excluded.bio WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE owner_id=?)").bind(identity.userId,value.name,value.channel,value.website,value.bio,now(),identity.userId,identity.userId).run();
      if(portalFamily((await accountPortal(db,identity.userId))||'affiliate')!=='affiliate')throw new AppError(403,'Brand accounts cannot create or edit an affiliate profile.');
      return profile();
    },
    async businessDashboard() {
      const business=await workspace();if(!business)return null;
      const program=await one<Program>("SELECT * FROM programs WHERE workspace_id = ?",business.id);
      const partners=await all<Partner>("SELECT a.id,a.status,a.created_at,a.updated_at,f.display_name,u.email,f.channel,f.website,f.bio FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id JOIN affiliate_profiles f ON f.user_id=a.affiliate_user_id JOIN accounts u ON u.id=a.affiliate_user_id WHERE w.id=? AND w.owner_id=? ORDER BY a.created_at DESC",business.id,identity.userId);
      const activity=await all<Audit>("SELECT e.id,e.action,e.created_at FROM audit_events e JOIN workspaces w ON w.id=e.workspace_id WHERE w.id=? AND w.owner_id=? ORDER BY e.created_at DESC,e.rowid DESC LIMIT 8",business.id,identity.userId);
      return {business,program,partners,activity};
    },
    async saveProgram(input:unknown) {
      const value=parse(schemas.program,input);const business=await requireWorkspace();
      if(value.windowDays>30&&await one("SELECT id FROM store_connections WHERE workspace_id=? AND platform='shopify'",business.id))throw new AppError(400,'Shopify native referral sessions support a maximum 30-day window.');
      await db.batch([
        db.prepare("UPDATE programs SET name=?,rate_bps=?,window_days=?,active=? WHERE workspace_id=? AND EXISTS (SELECT 1 FROM workspaces WHERE id=? AND owner_id=?)").bind(value.name,Math.round(value.rate*100),value.windowDays,value.active?1:0,business.id,business.id,identity.userId),
        db.prepare('INSERT INTO program_rule_revisions (id,program_id,rate_bps,window_days,active,effective_at) SELECT ?,id,?,?,?,? FROM programs WHERE workspace_id=?').bind(id(),Math.round(value.rate*100),value.windowDays,value.active?1:0,now(),business.id),
        event(business.id,'program_updated'),
      ]);
      return one<Program>("SELECT * FROM programs WHERE workspace_id = ?",business.id);
    },
    async partnerDashboard() {
      return {profile:await profile(),memberships:await all<Membership>("SELECT a.id,a.program_id,a.status,a.created_at,a.updated_at,p.name AS program_name,p.rate_bps,p.window_days,p.active,w.name AS business_name,w.website FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id WHERE a.affiliate_user_id=? ORDER BY a.created_at DESC",identity.userId)};
    },
    async getProgram(programId:string) {
      if(!z.string().uuid().safeParse(programId).success)throw new AppError(404,"Program not found.");
      const p=await one<Program & {business_name:string;website:string|null;owner_id:string;owner_closed:number}>("SELECT p.*,w.name AS business_name,w.website,w.owner_id,EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=w.owner_id) AS owner_closed FROM programs p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?",programId);
      if(!p)throw new AppError(404,"Program not found.");
      const existing=await one<{id:string;status:string}>("SELECT id,status FROM applications WHERE program_id=? AND affiliate_user_id=?",programId,identity.userId);
      const {owner_id,owner_closed,...publicProgram}=p;
      return {...publicProgram,ownerClosed:!!owner_closed,isOwner:owner_id===identity.userId,application:existing};
    },
    async apply(input:unknown) {
      await requireAccount();const value=parse(schemas.application,input);
      if(await workspace())throw new AppError(403,'Brand accounts cannot apply to affiliate programs.');
      if(!await profile())throw new AppError(409,"Complete your affiliate profile first.");
      const program=await one<Program & {owner_id:string}>("SELECT p.*,w.owner_id FROM programs p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=?",value.programId);
      if(!program||!program.active)throw new AppError(409,"This program is not accepting applications.");
      if(program.owner_id===identity.userId)throw new AppError(403,"You manage this program. Apply as an affiliate to another business instead.");
      const existing=await one<{id:string;status:string}>("SELECT id,status FROM applications WHERE program_id=? AND affiliate_user_id=?",value.programId,identity.userId);
      if(existing)return existing;
      const applicationId=id(),created=now();
      try {
        await db.batch([
          db.prepare("INSERT INTO applications (id,program_id,affiliate_user_id,status,created_at,updated_at) SELECT ?,p.id,?,'pending',?,? FROM programs p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND p.active=1 AND w.owner_id<>? AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id IN(w.owner_id,?))").bind(applicationId,identity.userId,created,created,value.programId,identity.userId,identity.userId),
          db.prepare("INSERT INTO audit_events(id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,'application_received',? WHERE changes()=1").bind(id(),program.workspace_id,identity.userId,created),
        ]);
      }catch(error){const retry=await one<{id:string;status:string}>("SELECT id,status FROM applications WHERE program_id=? AND affiliate_user_id=?",value.programId,identity.userId);if(retry)return retry;throw error;}
      if(!await one('SELECT id FROM applications WHERE id=?',applicationId))throw new AppError(409,'This program or account changed. Reopen the program before applying again.');
      return {id:applicationId,status:'pending'};
    },
    async review(input:unknown,approval?:PartnerApprovalSnapshot) {
      const value=parse(schemas.review,input);const business=await requireWorkspace();
      const application=await one<{id:string;updated_at:string;invited_at:string|null}>("SELECT a.id,a.updated_at,(SELECT max(i.created_at) FROM discovery_invitations i WHERE i.program_id=a.program_id AND i.recipient_id=a.affiliate_user_id) AS invited_at FROM applications a JOIN programs p ON p.id=a.program_id JOIN workspaces w ON w.id=p.workspace_id WHERE a.id=? AND w.id=? AND w.owner_id=?",value.applicationId,business.id,identity.userId);
      if(!application)throw new AppError(404,"Application not found in your workspace.");
      if(approval&&(value.status!=='approved'||approval.applicationId!==value.applicationId))throw new AppError(400,'The approval check does not match this application.');
      const evidence=approval?partnerApprovalCondition(approval):{sql:'',values:[]},open=" AND NOT EXISTS(SELECT 1 FROM account_closures c WHERE c.user_id=applications.affiliate_user_id OR c.user_id=?)";
      const at=timeAfter(application.updated_at,application.invited_at),writes=await db.batch([
        db.prepare(`UPDATE applications SET status=?,updated_at=? WHERE id=? AND program_id IN (SELECT id FROM programs WHERE workspace_id=?)
          AND (?<>'approved' OR status='approved' OR (SELECT count(*) FROM applications a JOIN programs p ON p.id=a.program_id WHERE p.workspace_id=? AND a.status='approved') < COALESCE((SELECT CASE active_plan WHEN 'growth' THEN 500 WHEN 'business' THEN 2000 ELSE 100 END FROM plan_requests WHERE user_id=?),100))${open}${evidence.sql}`).bind(value.status,at,value.applicationId,business.id,value.status,business.id,identity.userId,identity.userId,...evidence.values),
        db.prepare("INSERT INTO audit_events (id,workspace_id,actor_id,action,created_at) SELECT ?,?,?,'application_reviewed',? WHERE changes()=1").bind(id(),business.id,identity.userId,at),
      ]);
      if(!Number(writes[0].meta?.changes??(writes[0] as unknown as {changes?:number}).changes??0)){
        if(!await one(`SELECT id FROM applications WHERE id=?${open}${evidence.sql}`,value.applicationId,identity.userId,...evidence.values))throw new AppError(409,'This application, account or channel verification changed. Reload Review application before deciding again.');
        throw new AppError(409,'Your approved-partner package limit has been reached. Choose a larger package in billing and complete payment before approving another partner.');
      }
      return {id:value.applicationId,status:value.status};
    },
  };
}
