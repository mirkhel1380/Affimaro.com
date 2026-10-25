export const settingsSections=[['profile','Profile'],['appearance','Appearance'],['reports','Reports & links'],['notifications','Notifications'],['privacy','Privacy'],['security','Security'],['tools','Portal tools'],['data','Data & account']] as const;
export type SettingsSection=typeof settingsSections[number][0];
export function settingsSection(value:unknown):SettingsSection|undefined{return settingsSections.find(([key])=>key===value)?.[0];}
