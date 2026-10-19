import {requireChatGPTUser} from '../../chatgpt-auth';
import {getRawDb} from '../../../db';
import {accountPortal,businessPortal} from '../../../lib/portal-policy';
import {getAdmission,isPlatformAdmin} from '../../../lib/admissions';
import {accountClosureStatus} from '../../../lib/account-closure';
import {Shell,PageHeading,Card,Note} from '../../ui';
import {CloseAccountForm} from './close-form';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={title:'Close account | Affimaro',robots:{index:false,follow:false}};
export default async function CloseAccountPage(){
 const user=await requireChatGPTUser('/account/close',{allowApplication:true}),db=getRawDb();if(await isPlatformAdmin(db,user.userId))redirect('/owner');
 const portal=await accountPortal(db,user.userId)||'affiliate',app=await getAdmission(db,user.userId),status=await accountClosureStatus(db,user.userId),billing=portal==='agency'?'/agency/billing':'/billing';
 return <Shell name={user.fullName||user.email.split('@')[0]} email={user.email} portal={portal} active="settings" reviewOnly={app?.status!=='approved'}><PageHeading eyebrow="ACCOUNT SETTINGS" title="Close your Affimaro account" description="Review outstanding activity and confirm your identity before closing access."/><div className="a-two-col"><Card title="Before you close"><div className="a-card-body"><p>Your account will disappear from discovery, new participation will stop and all Affimaro sessions will end. You will no longer be able to sign in to this account.</p><p>Closing access retains financial records, existing transactions, identity mapping and review history. It does not reverse payments or erase records.</p>{status.blockers.length>0?<div className="a-closure-blockers" role="status"><h3>Resolve these items first</h3>{status.blockers.map(b=><p key={b.code}>{b.message}</p>)}</div>:<Note>No outstanding blockers were found. Eligibility is checked again when you confirm.</Note>}{businessPortal(portal)&&<a className="a-btn a-btn-outline" href={billing}>Package & billing</a>}<a className="a-text-link a-spaced-link" href="/application">Return to your profile ↗</a></div></Card><Card title="Confirm account closure"><div className="a-card-body"><CloseAccountForm eligible={status.eligible}/></div></Card></div></Shell>;
}
