import {accountIdFor} from '../../lib/account-id';
import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../chatgpt-auth';
import {getRawDb} from '../../db';
import {mediaPropertiesFor,profileVerificationSummary} from '../../lib/media-properties';
import {admissions,isPlatformAdmin} from '../../lib/admissions';
import {portalHome,portalName} from '../../lib/portal-policy';
import {applicationJourney} from '../../lib/application-journey';
import {Shell,PageHeading,Card,Badge,Icon} from '../ui';
import {ApplicationForm,ApplicationEdit,ApplicationTypeChoice} from './application-form';
import {ProfileDetails} from './profile-details';
import {OwnershipChecklist} from './ownership-checklist';
export const dynamic='force-dynamic';
export const metadata={title:'Application status | Affimaro',robots:{index:false,follow:false}};
export default async function ApplicationPage({searchParams}:{searchParams:Promise<{return_to?:string;step?:string}>}){
  const query=await searchParams,entry=applicationJourney(undefined,query.return_to),user=await requireChatGPTUser(query.step==='channels'?entry.resume:entry.application,{allowApplication:true}),db=getRawDb(),api=admissions(db,user),application=await api.own(),admin=await isPlatformAdmin(db,user.userId);
  if(admin)redirect('/owner');
  const accountId=await accountIdFor(db,user.userId),properties=await mediaPropertiesFor(db,user.userId);
  const ownership=profileVerificationSummary(properties,application?.profile||{});
  const status=application?.status,portal=application?.portal||'brand',approved=status==='approved',editable=!!application&&['draft','changes_requested','rejected'].includes(application.status);
  const journey=applicationJourney(portal,query.return_to),next=journey.destination,continueTo=next==='/application'||next.startsWith('/application?')||next==='/account'?portalHome(portal):next,continueLabel=continueTo.startsWith('/join/')?'Return to program':/^\/(?:billing|agency\/billing)(?:[/?]|$)/.test(continueTo)?'Continue to payment':'Open '+portal+' portal';
  return <Shell name={user.fullName||user.email.split('@')[0]} email={user.email} accountId={accountId} active="application" portal={portal} reviewOnly={!approved}><div className="a-application-page"><PageHeading eyebrow={application?portal.toUpperCase()+' APPLICATION':'APPLY TO AFFIMARO'} title={approved?'Your application is approved.':status==='pending'?'Your application is under review.':status==='changes_requested'?'A little more detail is needed.':status==='rejected'?'Review your application.':'A complete profile. A considered review.'} description="Brand, affiliate, creator and agency accounts each have a reviewed profile and a separate portal."/>
    <div className="a-application-progress" aria-label="Account approval progress"><span className="is-complete"><b>01</b>Email verified</span><span className={status&&status!=='draft'?'is-complete':''}><b>02</b>Complete application</span><span className={approved?'is-complete':status==='pending'?'is-current':''}><b>03</b>Owner review</span><span className={approved?'is-complete':''}><b>04</b>Portal access</span></div>
    {application&&<div className="a-application-state"><Badge status={application.status.replaceAll('_',' ')}/><strong>{user.email}</strong>{accountId&&<span className="a-account-id">Account ID: {accountId}</span>}{application.submitted_at&&<span>Submitted {new Date(application.submitted_at).toUTCString()}</span>}</div>}
    {!application?<Card title="Choose your account type"><div className="a-card-body"><ApplicationTypeChoice/></div></Card>:<>
      {application.review_note&&<Card title="Message from the reviewer"><div className="a-card-body"><p className="a-application-review-note">{application.review_note}</p></div></Card>}
      <Card title="Channels & ownership"><div className="a-card-body a-channel-overview"><div><strong>{ownership.verified} / {properties.length} properties verified</strong><p>Verify every website and channel listed on your profile. Each one has its own code and status.</p>{!approved&&<OwnershipChecklist summary={ownership}/>}</div><a href={journey.channels} className="a-btn a-btn-outline">Manage websites & channels</a></div></Card>{editable?<Card title={'Your '+portalName(portal).toLowerCase()+' application'}><div className="a-card-body"><ApplicationForm portal={portal} revision={application.revision} profile={application.profile} properties={properties} channelsPath={journey.channels} returnTo={journey.destination} resumeChannels={query.step==='channels'}/></div></Card>:<Card title={approved?'Approved profile':'Submitted profile'}><div className="a-card-body">{approved?<div className="a-application-actions"><a className="a-btn a-btn-dark" href={continueTo}>{continueLabel}<Icon name="arrow"/></a></div>:<div className="a-application-pending"><p>Your request is in the owner’s review queue. You can return here to see an approval, a request for more information or a decision. No approval time is guaranteed.</p><a className="a-btn a-btn-outline" href={journey.application}>Check latest status</a></div>}<ProfileDetails profile={application.profile}/>{status==='pending'&&<ApplicationEdit revision={application.revision}/>}</div></Card>}
    </>}
  </div></Shell>;
}
