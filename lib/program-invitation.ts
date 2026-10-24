import {service,type Identity} from './service.ts';
import {trackedReferralPath} from './referral-link.ts';
import {accountPortal,businessPortal} from './portal-policy.ts';
import {getAdmission} from './admissions.ts';
import {mediaPropertiesFor,profileVerificationSummary} from './media-properties.ts';
import {partnershipProfile} from './partnership-profile.ts';
import {applicationJourney} from './application-journey.ts';
import {pendingProgramInvitation} from './relationships.ts';

type Stage='owner'|'brand'|'closed'|'account'|'profile'|'verification'|'apply'|'pending'|'approved'|'suspended'|'rejected'|'updated';
export async function programInvitation(db:D1Database,identity:Identity,programId:string){
  const s=service(db,identity);
  const [program,account,profile,portal,admission,properties]=await Promise.all([s.getProgram(programId),s.account(),s.profile(),accountPortal(db,identity.userId),getAdmission(db,identity.userId),mediaPropertiesFor(db,identity.userId)]);
  const application=program.application;
  let reviewed:Record<string,unknown>={};try{const value=JSON.parse(admission?.profile_json||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))reviewed=value;}catch{}
  const profileApproved=admission?.status==='approved'&&!!profile,verificationReady=profileVerificationSummary(properties,reviewed).ready,path=`/join/${program.id}`,journey=applicationJourney(portal||undefined,path);
  let stage:Stage;
  if(program.isOwner)stage='owner';
  else if(portal&&businessPortal(portal))stage='brand';
  else if(program.ownerClosed)stage='closed';
  else if(application)stage=['pending','approved','suspended','rejected'].includes(application.status)?application.status as Stage:'updated';
  else if(!program.active)stage='closed';
  else stage=!account?'account':!profileApproved?'profile':!verificationReady?'verification':'apply';
  // Only this applicant's currently approved, active, verified partnership can
  // produce a referral link. Loading an invitation never reads financial secrets.
  const link=stage==='approved'?await db.prepare(`SELECT c.store_url,c.platform,a.id AS application_id,p.id AS program_id
    FROM applications a JOIN programs p ON p.id=a.program_id JOIN store_connections c ON c.workspace_id=p.workspace_id
    WHERE p.id=? AND a.affiliate_user_id=? AND a.status='approved' AND p.active=1 AND c.active=1 AND c.last_seen IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM account_closures closed WHERE closed.user_id IN(a.affiliate_user_id,(SELECT owner_id FROM workspaces WHERE id=p.workspace_id)))`).bind(program.id,identity.userId).first<{platform:string;store_url:string;application_id:string;program_id:string}>():null;
  const steps=[
    {id:'account',title:'Your account',complete:!!account},
    {id:'profile',title:(portal==='creator'?'Creator':'Affiliate')+' profile review',complete:profileApproved},
    {id:'application',title:'Send application',complete:!!application},
  ];
  const current=steps.find(step=>!step.complete)?.id;
  const pendingInvitation=profileApproved&&portal&&!businessPortal(portal)&&!program.ownerClosed?await pendingProgramInvitation(db,identity,program.id):null;
  return {program,account,profile,portal,stage,path,journey,pendingInvitation,applicationStatus:admission?.status||null,applicantProfile:partnershipProfile(reviewed),verificationReady,referralLink:link?trackedReferralPath(link.application_id):null,referralPlatform:link?.platform||null,
    steps:steps.map(step=>({...step,current:step.id===current})),completed:steps.filter(step=>step.complete).length};
}
export type ProgramInvitation=Awaited<ReturnType<typeof programInvitation>>;
