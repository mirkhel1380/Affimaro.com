import type {ProgramInvitation} from '../lib/relationships';
import {relationshipsPath} from '../lib/relationships';
import {businessPortal,type Portal} from '../lib/portal-policy';
import {applicationJourney} from '../lib/application-journey';
import {Badge,formatDate} from './portal-elements';
import {DiscoveryButton} from './discover/actions';

export function ProgramInvitationCard({invitation:i,portal,ownershipReady}:{invitation:ProgramInvitation;portal:Portal;ownershipReady:boolean}){
 const business=businessPortal(portal),base=relationshipsPath(portal),program='/join/'+i.program_id,verifiedPath=applicationJourney(portal,base+'?tab=invitations').channels;
 const canAccept=i.status==='pending'&&!!i.program_active&&!i.superseded&&ownershipReady&&!i.target_closed;
 return <article><div className="a-portal-record-head"><h3>{business?i.partner_name:i.brand_name}</h3><Badge status={i.status}/></div>
  <p>{i.program_name} · {i.rate_bps/100}% · {i.window_days}-day attribution</p><p className="a-invitation-note">{i.note}</p><small>Invited {formatDate(i.created_at)}</small>
  <div className="a-relationship-facts"><span>Current program application: {i.application_status?<Badge status={i.application_status}/>:<>Not submitted</>}</span>{!i.program_active&&<span>Program paused</span>}</div>
  {i.target_closed?<p className="a-muted">This account is closed. Its invitation and application history are retained.</p>:<>
   {!!i.superseded&&<p className="a-note">This invitation is older than the program’s latest decision. {business?'Withdraw it and send a new invitation if you want this partner to reapply.':'A new invitation is required to reapply.'}</p>}
   {!i.program_active&&i.status==='pending'&&<p className="a-muted">Applications are paused. This invitation can be accepted when the program is active again.</p>}
   {!business&&i.status==='pending'&&!ownershipReady&&<p className="a-note">Your channel verification needs attention before you can accept. <a href={verifiedPath}>Manage websites & channels</a>.</p>}
   <div className="a-inline-actions a-spaced-link"><a className="a-text-link" href={program}>Review program ↗</a>
    {i.application_id&&(business?<a className="a-btn a-btn-outline a-btn-small" href={base+'/'+i.application_id}>{i.application_status==='approved'?'View partner profile':'Review application'}</a>:i.application_status==='approved'?<a className="a-btn a-btn-outline a-btn-small" href={base+'/'+i.application_id}>Open partnership tools</a>:<a className="a-text-link" href={program}>View your application</a>)}
    {i.status==='pending'&&(business?<DiscoveryButton action="respond" data={{id:i.id,decision:'withdrawn'}} label="Withdraw invitation"/>:<>{canAccept&&<DiscoveryButton action="respond" data={{id:i.id,decision:'accepted'}} label={i.application_id?'Acknowledge invitation':'Accept invitation & apply'} variant="dark" successPath={program}/>}<DiscoveryButton action="respond" data={{id:i.id,decision:'declined'}} label="Decline invitation"/></>)}
   </div>
  </>}
  {i.status==='accepted'&&<p className="a-fine-print">{i.application_status==='approved'?'The partnership is approved. Invitation acceptance and program approval are separate records.':i.application_status==='pending'?'The program application is waiting for the business’s decision.':i.application_status==='rejected'?'The program application is currently declined. Accepting an invitation does not override that decision.':i.application_status==='suspended'?'The partnership is currently suspended. Its earlier invitation acceptance is retained.':'Invitation accepted. Open the program to check its current application status.'}</p>}
 </article>;
}
