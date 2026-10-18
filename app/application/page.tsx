import {requireChatGPTUser} from '../chatgpt-auth';
import {getRawDb} from '../../db';
import {admissions,isPlatformAdmin} from '../../lib/admissions';
import {portalHome} from '../../lib/portal-policy';
import {safeReturnTo} from '../../self-hosted/auth-core';
import {Shell,PageHeading,Card,Badge,Icon} from '../ui';
import {ApplicationForm,ApplicationEdit,ApplicationTypeChoice} from './application-form';
import {ProfileDetails} from './profile-details';
export const dynamic='force-dynamic';
export const metadata={title:'Application status | Affimaro',robots:{index:false,follow:false}};
export default async function ApplicationPage({searchParams}:{searchParams:Promise<{return_to?:string}>}){
  const query=await searchParams,user=await requireChatGPTUser('/application'+(query.return_to?'?return_to='+encodeURIComponent(safeReturnTo(query.return_to)):''),{allowApplication:true}),db=getRawDb(),api=admissions(db,user),application=await api.own(),admin=await isPlatformAdmin(db,user.userId);
  const status=application?.status,portal=application?.portal||'brand',approved=status==='approved',editable=!!application&&['draft','changes_requested','rejected'].includes(application.status);
  const next=safeReturnTo(query.return_to),continueTo=next==='/application'||next.startsWith('/application?')||next==='/account'?portalHome(portal):next;
  return <Shell name={user.fullName||user.email.split('@')[0]} email={user.email} active="application" portal={portal} reviewOnly={!approved} admin={admin}><PageHeading eyebrow={application?portal.toUpperCase()+' APPLICATION':'APPLY TO AFFIMARO'} title={approved?'Your application is approved.':status==='pending'?'Your application is under review.':status==='changes_requested'?'A little more detail is needed.':status==='rejected'?'Review your application.':'A complete profile. A considered review.'} description="Both brand and affiliate accounts are reviewed by the Affimaro owner before portal access."/>
    <div className="a-application-progress" aria-label="Account approval progress"><span className="is-complete"><b>01</b>Email verified</span><span className={status&&status!=='draft'?'is-complete':''}><b>02</b>Complete application</span><span className={approved?'is-complete':status==='pending'?'is-current':''}><b>03</b>Owner review</span><span className={approved?'is-complete':''}><b>04</b>Portal access</span></div>
    {application&&<div className="a-application-state"><Badge status={application.status.replaceAll('_',' ')}/><strong>{user.email}</strong>{application.submitted_at&&<span>Submitted {new Date(application.submitted_at).toUTCString()}</span>}</div>}
    {!application?<Card title="Choose your account type"><div className="a-card-body"><ApplicationTypeChoice/></div></Card>:<>
      {application.review_note&&<Card title="Message from the reviewer"><div className="a-card-body"><p className="a-application-review-note">{application.review_note}</p></div></Card>}
      {editable?<Card title={portal==='brand'?'Your brand application':'Your affiliate application'}><div className="a-card-body"><ApplicationForm portal={portal} revision={application.revision} profile={application.profile}/></div></Card>:<Card title={approved?'Approved profile':'Submitted profile'}><div className="a-card-body">{approved?<div className="a-application-actions"><a className="a-btn a-btn-dark" href={continueTo}>Open {portal} portal<Icon name="arrow"/></a>{admin&&<a className="a-btn a-btn-outline" href="/admin/applications">Review applications</a>}</div>:<div className="a-application-pending"><p>Your request is in the owner’s review queue. You can return here to see an approval, a request for more information or a decision. No approval time is guaranteed.</p><a className="a-btn a-btn-outline" href={'/application'+(query.return_to?'?return_to='+encodeURIComponent(next):'')}>Check latest status</a></div>}<ProfileDetails profile={application.profile}/>{status==='pending'&&<ApplicationEdit revision={application.revision}/>}</div></Card>}
    </>}
  </Shell>;
}
