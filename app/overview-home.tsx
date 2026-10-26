import {accountIdFor} from '../lib/account-id';
import {redirect} from 'next/navigation';
import {getRawDb} from '../db';
import {portalHome,portalName,type Portal} from '../lib/portal-policy';
import {service} from '../lib/service';
import {portalOverview} from '../lib/portal-overview';
import {requirePortalUser} from './portal-auth';
import {Shell} from './ui';
import {OverviewPanels} from './overview-panels';
export async function OverviewHome({portal,searchParams=Promise.resolve({})}:{portal:Portal;searchParams?:Promise<{days?:string|string[]}>}){
 const query=await searchParams,days=query.days==='7'?7:query.days==='90'?90:30,path=portalHome(portal),user=await requirePortalUser(portal,path+'?days='+days,true),db=getRawDb(),account=await service(db,user).account();if(!account)redirect('/account');const data=await portalOverview(db,user,portal,{days}),accountId=await accountIdFor(db,user.userId);
 return <Shell accountId={accountId} portal={portal} name={account.display_name} email={user.email} active={({brand:'business',agency:'agency',affiliate:'partner',creator:'creator'})[portal]}><div className="a-overview-heading"><div><span>{portalName(portal).toUpperCase()} WORKSPACE</span><h1>Overview</h1><p>{portal==='agency'?'Your clients, represented program and partner activity.':portal==='creator'?'Your brand partnerships, content and recorded earnings.':portal==='brand'?'Your partner program, applications and recorded sales.':'Your brand partnerships and recorded performance.'}</p></div><form method="get" action={path}><label><span>Reporting period</span><select name="days" defaultValue={days}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><button className="a-btn a-btn-outline a-btn-small">Apply</button><small>UTC · through today</small></form></div><OverviewPanels data={data}/></Shell>;
}
