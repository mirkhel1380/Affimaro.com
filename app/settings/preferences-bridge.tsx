'use client';
import {useEffect,useState} from 'react';
import {preferenceSchema,settingsPath,type AccountPreferences,type SettingsSnapshot} from '../../lib/account-preferences';
import {businessPortal,type Portal} from '../../lib/portal-policy';
import {applyAppearance,appearanceSerial,readAppearance} from './appearance';
export function PreferencesBridge({portal,previewMode}:{portal:Portal;previewMode:boolean}){
 const [data,setData]=useState<SettingsSnapshot|null>(null);
 useEffect(()=>{
  if(previewMode){try{const saved=JSON.parse(localStorage.getItem('affimaro.preview.settings.v1.'+portal)||'null');if(saved?.portal===portal&&preferenceSchema.safeParse(saved.preferences).success){setData(saved);applyAppearance(saved.preferences);if(typeof saved.name==='string'&&saved.name.length>=2&&saved.name.length<=60)window.dispatchEvent(new CustomEvent('affimaro:profile',{detail:{accountId:saved.accountId,name:saved.name,hasAvatar:!!saved.memberProfile?.hasAvatar,avatarRevision:saved.memberProfile?.revision||0}}));}}catch{}return;}
  let current=true,latest:{preferences:AccountPreferences;revision:number}|undefined;const serial=appearanceSerial();
  const update=(event:Event)=>{const value=(event as CustomEvent).detail,checked=preferenceSchema.safeParse(value?.preferences);if(value?.portal!==portal||!checked.success||!Number.isSafeInteger(value.revision)||value.revision<1||latest&&value.revision<latest.revision)return;latest={preferences:checked.data,revision:value.revision};setData(old=>old&&old.revision<=value.revision?{...old,...latest}:old);};
  window.addEventListener('affimaro:preferences',update);
  fetch('/api/account-settings',{credentials:'same-origin',cache:'no-store'}).then(async response=>await response.json() as {ok?:boolean;data?:SettingsSnapshot}).then(result=>{
   if(!current||!result.ok||!result.data||result.data.portal!==portal||!preferenceSchema.safeParse(result.data.preferences).success)return;
   let saved=latest&&latest.revision>result.data.revision?{...result.data,...latest}:result.data;
   if(appearanceSerial()!==serial)saved={...saved,preferences:{...saved.preferences,...readAppearance()}};
   setData(saved);applyAppearance(saved.preferences);window.dispatchEvent(new CustomEvent('affimaro:profile',{detail:{accountId:saved.accountId,name:saved.name,hasAvatar:!!saved.memberProfile?.hasAvatar,avatarRevision:saved.memberProfile?.revision||0}}));window.dispatchEvent(new CustomEvent('affimaro:account-summary',{detail:{portal:saved.portal,preferences:saved.preferences,pendingApplications:saved.pendingApplications,pendingInvitations:saved.pendingInvitations,openPayments:saved.openPayments||0}}));
  }).catch(()=>{});
  return()=>{current=false;window.removeEventListener('affimaro:preferences',update);};
 },[portal,previewMode]);
 useEffect(()=>{if(data)window.dispatchEvent(new CustomEvent('affimaro:account-summary',{detail:{portal:data.portal,preferences:data.preferences,pendingApplications:data.pendingApplications,pendingInvitations:data.pendingInvitations,openPayments:data.openPayments||0}}));},[data]);
 const applications=data?.preferences.applicationAlerts?data.pendingApplications:0,invitations=data?.preferences.invitationAlerts?data.pendingInvitations:0;
 if(!data?.preferences.showReminders||!(applications||invitations))return null;
 const base=({brand:'/workspace/partners',agency:'/agency/partners',affiliate:'/partner/brands',creator:'/creator/brands'})[portal];
 return <aside className="a-settings-reminder" aria-label="Partnership reminders"><strong>Partnership updates</strong><span>{applications} pending {businessPortal(portal)?'partner applications':'applications'} · {invitations} {businessPortal(portal)?'sent':'incoming'} invitations</span><a href={base}>View partnerships ↗</a><a href={settingsPath(portal)+'?tab=notifications'}>Manage reminders</a></aside>;
}
