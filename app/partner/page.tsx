import {OverviewHome} from '../overview-home';
import {type Portal} from '../../lib/portal-policy';
import {requirePortalUser} from '../portal-auth';
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getRawDb } from "../../db";
import { service } from "../../lib/service";
import {commerce} from "../../lib/woocommerce";
import {OrderTable,money} from "../tracking";
import { CopyButton } from "../forms";
import {AffiliateProfileForm} from "../affiliate-profile-form";
import { Shell,PageHeading,Card,Icon,Note,Stat,Badge,Empty,formatDate } from "../ui";
export const dynamic="force-dynamic";
export default function PartnerPage(props:{searchParams:Promise<{days?:string|string[]}>}){return OverviewHome({...props,portal:'affiliate'});}
export async function PartnerView({portal,path}:{portal:Portal;path:string}){
  const user=await requirePortalUser(portal,path,true),s=service(getRawDb(),user),account=await s.account();if(!account)redirect('/account');
  const {profile,memberships}=await s.partnerDashboard();
  const tracking=await commerce(getRawDb(),user).partnerTracking();

  return <Shell name={account.display_name} email={user.email} active="profile" portal={portal}><PageHeading eyebrow={portal==='creator'?'CREATOR PARTNERSHIPS':'AFFILIATE PORTAL'} title={profile?'Your next partnership.':'Let businesses get to know you.'} description="Your partnerships, referral links and estimated commission."/>{profile&&<div className="a-stats"><Stat label="Program applications" value={memberships.length} caption="Your own applications" icon="users"/><Stat label="Approved partnerships" value={memberships.filter(m=>m.status==='approved').length} caption="Reviewed by each business" icon="check" dark/><Stat label="Pending review" value={memberships.filter(m=>m.status==='pending').length} caption="Waiting for the business" icon="clock"/></div>}<div className="a-two-col"><Card title={portal==='creator'?'Your creator partnership profile':profile?'Your partner profile':'Create your affiliate profile'}><div className="a-card-body"><AffiliateProfileForm name={account.display_name} profile={profile} redirectTo={path}/></div></Card><div><Card title="Your programs">{memberships.length?<div className="a-memberships">{memberships.map(m=><article key={m.id}><div><Badge status={m.status}/><small>{formatDate(m.created_at)}</small></div><h3>{m.business_name}</h3><p>{m.program_name} · {m.rate_bps/100}% commission · {m.window_days} days</p><a className="a-text-link" href={`/join/${m.program_id}`}>View program <Icon name="arrow"/></a>{m.status==='approved'&&(tracking.links.find(l=>l.application_id===m.id)?<div className="a-referral-link"><small>YOUR STORE REFERRAL LINK</small><CopyButton path={tracking.links.find(l=>l.application_id===m.id)!.url}/>{tracking.links.find(l=>l.application_id===m.id)!.platform==='shopify'&&<p className="a-fine-print">Shopify sessions appear after the business syncs its orders. The program rules saved at the referral session determine the rate.</p>}</div>:<p className="a-fine-print">Approved. Your referral link appears after the business activates its program and verifies its store connection.</p>)}</article>)}</div>:<Empty icon="link" title="A link starts a partnership."><a href={portal==='creator'?'/creator/discover':'/partner/discover'}>Discover brands</a> or open a business’s Affimaro program link. Your reviewed applications appear here.</Empty>}</Card><Note>Businesses pay affiliates directly. <a href={portal==='creator'?'/creator/payments':'/payments?view=affiliate'}>Manage your bank details and payment requests ↗</a></Note></div></div>{tracking.totals.length>0&&<div className="a-commission-totals">{tracking.totals.map(t=><div key={`${t.currency}-${t.decimals}`}><small>ESTIMATED COMMISSION · {t.currency}</small><strong>{money(t.commission,t.currency,t.decimals)}</strong></div>)}</div>}<Card title="Your referred orders"><OrderTable orders={tracking.orders} partner portal={portal}/></Card></Shell>;
}
