import {z} from 'zod';
import {AppError,type Identity} from './service.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {requireApprovedAccount} from './admissions.ts';
import {planCatalog} from './pricing-catalog.mjs';
export type Plan='starter'|'growth'|'business';
// Pending/rejected values are retained for reading historical selections only.
export type PlanRequest={user_id:string;requested_plan:Plan;active_plan:Plan|null;status:'pending'|'approved'|'rejected';revision:number;review_note:string;updated_at:string};
export const getPlanRequest=(db:D1Database,userId:string)=>db.prepare('SELECT * FROM plan_requests WHERE user_id=?').bind(userId).first<PlanRequest>();
export async function activePlan(db:D1Database,userId:string){return (await getPlanRequest(db,userId))?.active_plan||'starter';}
export async function selectedPlan(db:D1Database,userId:string){const r=await getPlanRequest(db,userId);return r&&r.status!=='rejected'?r.requested_plan:r?.active_plan||'starter';}
export async function checkPlanCapacity(db:D1Database,userId:string,plan:Plan){
 const usage=await db.prepare("SELECT (SELECT count(*) FROM applications a JOIN programs g ON g.id=a.program_id JOIN workspaces w ON w.id=g.workspace_id WHERE w.owner_id=? AND a.status='approved') AS partners,(SELECT count(*) FROM agency_clients WHERE user_id=?) AS clients").bind(userId,userId).first<{partners:number;clients:number}>();
 const p=planCatalog[plan];if((usage?.partners||0)>p.partners||(usage?.clients||0)>p.clients)throw new AppError(409,'Your current usage exceeds this package. Reduce usage or choose a larger package before payment.');
}
export function planRequests(db:D1Database,user:Identity){return {
 async choose(input:unknown){
  await requireApprovedAccount(db,user);const portal=await accountPortal(db,user.userId);
  if(!portal||!businessPortal(portal))throw new AppError(403,'Packages belong to brand and agency accounts. Creator and affiliate access is free.');
  const parsed=z.object({plan:z.enum(['starter','growth','business']),revision:z.number().int().min(0)}).strict().safeParse(input);
  if(!parsed.success)throw new AppError(400,'Choose a valid package and reload its current status.');
  const v=parsed.data,r=await getPlanRequest(db,user.userId);
  if((r?.revision||0)!==v.revision)throw new AppError(409,'Your package selection changed. Reload before choosing again.');
  await checkPlanCapacity(db,user.userId,v.plan);
  const existing=await db.prepare("SELECT b.id FROM billing_accounts b JOIN workspaces w ON w.id=b.workspace_id WHERE w.owner_id=? AND b.subscription_id IS NOT NULL AND b.status NOT IN ('canceled','incomplete_expired') LIMIT 1").bind(user.userId).first();
  if(existing&&r?.active_plan!==v.plan)throw new AppError(409,'Manage your existing subscription before choosing another package. A second subscription will not be created.');
  if(r?.requested_plan===v.plan&&r.status==='approved')return r;
  const at=new Date().toISOString();
  if(!r)await db.prepare("INSERT INTO plan_requests (user_id,requested_plan,status,revision,updated_at) VALUES (?,?,'approved',1,?) ON CONFLICT(user_id) DO NOTHING").bind(user.userId,v.plan,at).run();
  else await db.prepare("UPDATE plan_requests SET requested_plan=?,status='approved',revision=revision+1,review_note='',updated_at=? WHERE user_id=? AND revision=?").bind(v.plan,at,user.userId,v.revision).run();
  const saved=await getPlanRequest(db,user.userId);
  if(saved?.revision!==v.revision+1||saved.requested_plan!==v.plan)throw new AppError(409,'Your package changed. Reload its latest selection.');
  // Selection never changes paid capacity. Only verified subscription evidence does.
  return saved;
 }
};}
