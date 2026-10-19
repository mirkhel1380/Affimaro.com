import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../chatgpt-auth';
import {requirePortalUser} from '../portal-auth';
import {getRawDb} from '../../db';
import {isPlatformAdmin} from '../../lib/admissions';
import {accountSettings} from '../../lib/account-settings';
import {settingsPath} from '../../lib/account-preferences';
import {portalName,type Portal} from '../../lib/portal-policy';
import {emailSignIn} from '../../lib/auth-mode';
import {Shell,PageHeading} from '../ui';
import {SettingsPanel} from './settings-panel';
export async function SettingsView({portal,searchParams}:{portal?:Portal;searchParams:Promise<{tab?:string}>}){const user=portal?await requirePortalUser(portal,settingsPath(portal)):await requireChatGPTUser('/settings'),db=getRawDb();if(await isPlatformAdmin(db,user.userId))redirect('/owner/settings');const data=await accountSettings(db,user).snapshot(),query=await searchParams;return <Shell portal={data.portal} name={data.name} email={data.email} active="settings"><PageHeading eyebrow={portalName(data.portal).toUpperCase()+' ACCOUNT SETTINGS'} title="Settings" description="Manage your profile, appearance, reporting preferences, privacy and account access."/><SettingsPanel initial={data} initialTab={query.tab} emailAuth={emailSignIn}/></Shell>;}
