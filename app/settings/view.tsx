import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../chatgpt-auth';
import {requirePortalUser} from '../portal-auth';
import {getRawDb} from '../../db';
import {isPlatformAdmin} from '../../lib/admissions';
import {accountSettings} from '../../lib/account-settings';
import {settingsPath} from '../../lib/account-preferences';
import {portalName,type Portal} from '../../lib/portal-policy';
import {emailSignIn} from '../../lib/auth-mode';
import {portalReturnPath,type PortalPageQuery} from '../../lib/portal-return-path';
import {Shell,PageHeading} from '../ui';
import {SettingsPanel} from './settings-panel';
import {settingsSection} from './sections';
export async function SettingsView({portal,searchParams}:{portal?:Portal;searchParams:Promise<PortalPageQuery>}){
 const query=await searchParams,tab=settingsSection(query.tab),path=portalReturnPath(portal?settingsPath(portal):'/settings',{tab},{tab:16});
 const user=portal?await requirePortalUser(portal,path):await requireChatGPTUser(path),db=getRawDb();
 if(await isPlatformAdmin(db,user.userId))redirect('/owner/settings');
 const data=await accountSettings(db,user).snapshot();
 return <Shell accountId={data.accountId} portal={data.portal} name={data.name} email={data.email} active="settings"><PageHeading eyebrow={portalName(data.portal).toUpperCase()+' ACCOUNT SETTINGS'} title={tab==='profile'?'User profile':'Account settings'} description="Your account information, profile, security, finance and connected tools."/><SettingsPanel initial={data} initialTab={tab} emailAuth={emailSignIn}/></Shell>;
}
