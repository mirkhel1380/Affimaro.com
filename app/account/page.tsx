import {redirect} from 'next/navigation';
import {emailSignIn} from '../../lib/auth-mode';
import {accountPortal,businessPortal,portalHome,portalName} from '../../lib/portal-policy';
import {requireChatGPTUser} from '../chatgpt-auth';
import {getRawDb} from '../../db';
import {service} from '../../lib/service';
import {ApiForm} from '../forms';
import {Shell,PageHeading,Card,Icon,Note} from '../ui';
export const dynamic='force-dynamic';
export default async function AccountPage(){
  const user=await requireChatGPTUser('/account'),db=getRawDb(),s=service(db,user),account=await s.account(),portal=await accountPortal(db,user.userId);
  if(!portal)redirect('/get-started');
  const name=account?.display_name||user.fullName||user.email.split('@')[0],brand=businessPortal(portal);
  const business=brand?await s.workspace():null;
  return <Shell name={name} email={user.email} active="account" portal={portal}>
    <PageHeading eyebrow={'YOUR '+portalName(portal).toUpperCase()+' ACCOUNT'} title={'Welcome, '+name.split(' ')[0]+'.'} description={brand?'Your program, partners and brand settings.':'Your partnerships, referral links and commission records.'}><a className="a-btn a-btn-outline" href={portal==='creator'||portal==='agency'?portalHome(portal):brand?'/start':'/start?view=affiliate'}>Getting started<Icon name="arrow"/></a></PageHeading>
    <div className="a-account-destination"><span className="a-launch-icon"><Icon name={brand?'store':'users'}/></span><div><span className="a-eyebrow">{portalName(portal).toUpperCase()+' PORTAL'}</span><h2>{brand?business?.name||'Your partner program.':'Your '+portalName(portal).toLowerCase()+' dashboard.'}</h2><p>{brand?'Review applicants, manage your store and keep your commission workflow together.':'Open your approved programs, share referral links and follow your own earnings.'}</p></div><a className="a-btn a-btn-dark" href={portalHome(portal)}>Open {portalName(portal).toLowerCase()} dashboard<Icon name="arrow"/></a></div>
    <div className="a-two-col"><Card title="Your profile"><div className="a-card-body"><div className="a-verified-email"><span>{emailSignIn?'Verified email':'Signed-in account'}</span><strong>{user.email}</strong></div><ApiForm endpoint="/api/account" fields={[{name:'name',label:'Display name',value:name,required:true,maxLength:60}]} label="Save profile"/></div></Card>
    <Card title="Your account type"><div className="a-card-body"><span className="a-badge">{portalName(portal)} account</span><p className="a-muted a-spaced-link">{portal==='agency'?'This agency account keeps a private client directory and manages its approved represented program.':portal==='creator'?'This creator account has its own channels, private content planner, partnerships and earnings.':brand?'This brand account manages its own program. Other account types keep their own portal and permissions.':'This affiliate account manages its publishing profile, partnerships, links and earnings.'}</p><Note>Your saved data belongs to this account. There is no dashboard role switch.</Note>{emailSignIn&&<a className="a-text-link a-spaced-link" href="/install">Install Affimaro on your phone<Icon name="arrow"/></a>}</div></Card></div>
  </Shell>;
}
