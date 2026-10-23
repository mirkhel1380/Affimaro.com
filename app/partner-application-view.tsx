import {notFound} from 'next/navigation';
import {requirePortalUser} from './portal-auth';
import {getRawDb} from '../db';
import {partnerApplicationReview} from '../lib/partner-review';
import {relationshipsPath} from '../lib/relationships';
import {AppError} from '../lib/service';
import {Shell,PageHeading} from './ui';
import {ActionButton} from './forms';
import {PartnerReviewPanel} from './partner-review-panel';
export async function PartnerApplicationView({portal,params}:{portal:'brand'|'agency';params:Promise<{id:string}>}){
 const {id}=await params,base=relationshipsPath(portal),path=base+'/'+encodeURIComponent(id),user=await requirePortalUser(portal,path);
 let review;try{review=await partnerApplicationReview(getRawDb(),user,id);}catch(e){if(e instanceof AppError&&e.status===404)notFound();throw e;}
 return <Shell name={user.fullName||user.email.split('@')[0]} email={user.email} portal={portal} active="relationships"><a className="a-text-link" href={base+'?tab='+encodeURIComponent(review.status)}>← Back to My partners</a><PageHeading eyebrow="PARTNER APPLICATION" title={review.name} description="Review this applicant’s audience, promotional approach and channel ownership before deciding on the partnership."/><PartnerReviewPanel review={review} actions={!review.closed&&<>{review.status!=='approved'&&review.approvalReady&&<ActionButton body={{applicationId:id,status:'approved'}} label={review.status==='suspended'?'Restore partnership':'Approve partner'} variant="dark" returnTo={path}/>}{review.status==='approved'&&<ActionButton body={{applicationId:id,status:'suspended'}} label="Suspend partnership" returnTo={path}/>}{review.status==='pending'&&<ActionButton body={{applicationId:id,status:'rejected'}} label="Decline application" returnTo={path}/>}</>}/></Shell>;
}
