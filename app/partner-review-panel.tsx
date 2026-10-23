import type {ReactNode} from 'react';
import type {PartnerReview} from '../lib/partner-review';
import {portalName} from '../lib/portal-policy';
import {publicMediaUrl} from '../lib/media-catalog';
import {Card,Badge,Note,formatDate} from './portal-elements';
import {ProfileDetails} from './application/profile-details';

export function PartnerReviewPanel({review,actions,sample=false}:{review:PartnerReview;actions:ReactNode;sample?:boolean}){
 return <div className="a-directory-profile-layout a-partner-review"><div>
  <Card title={portalName(review.portal)+' profile'}><div className="a-card-body"><p className="a-muted">{sample?'Fictional sample profile. ':''}Audience figures, experience and promotional plans are self-reported by the applicant.</p>{Object.keys(review.profile).length?<ProfileDetails profile={review.profile}/>:<p>The applicant has not supplied a complete promotional profile.</p>}</div></Card>
  <Card title="Websites & channels"><div className="a-card-body a-public-properties"><p className="a-muted">Current ownership checks are shown separately from the partnership decision.</p>{review.channels.length?review.channels.map((p,i)=>{let url='';try{url=publicMediaUrl(p.url);}catch{}return <article key={i}><div className="a-portal-record-head"><h3>{p.name}</h3><Badge status={p.verified?'verified':p.status==='verified'?'verification expired':p.status}/></div><p>{p.platform} · {p.relationship} · {p.language}</p>{url&&<a href={url} target="_blank" rel="noopener noreferrer">{url} ↗</a>}{p.verified_at&&<p>Last verified {formatDate(p.verified_at)}</p>}</article>;}):<p>No active properties have been recorded.</p>}</div></Card>
 </div><aside>
  <Card title="Application decision"><div className="a-card-body"><Badge status={review.status}/><h3 className="a-spaced-link">{review.program_name}</h3><dl className="a-detail-list"><div><dt>Applied</dt><dd>{formatDate(review.created_at)}</dd></div><div><dt>Last updated</dt><dd>{formatDate(review.updated_at)}</dd></div><div><dt>Commission</dt><dd>{review.rate_bps/100}% per eligible sale</dd></div><div><dt>Attribution</dt><dd>{review.window_days} days</dd></div><div><dt>Program</dt><dd>{review.program_active?'Active':'Paused'}</dd></div></dl>
   <ul className="a-partner-readiness"><li>{review.closed?'Account closed':review.accountApproved?'Affimaro profile approved':'Affimaro profile approval required'}</li><li>{review.ownershipReady?'All listed channels have current verification':'Channel verification needs attention'}</li></ul>
   {!review.approvalReady&&<p className="a-muted">Approval is unavailable until the applicant has an open, approved account and completes their channel verification.</p>}
   <div className="a-inline-actions a-spaced-link">{actions}</div>
  </div></Card>
  <Note>Approval applies only to your program. It gives the partner access to its approved resources; it does not create a charge or transfer money.</Note>
 </aside></div>;
}
