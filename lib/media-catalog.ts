export const mediaKinds=['Website','Social media','Video & livestream','Newsletter','Podcast','Mobile app','Community','Other'] as const;
export const mediaPlatforms=['Website / blog','Online store','Instagram','TikTok','YouTube','Facebook','X / Twitter','LinkedIn','Pinterest','Twitch','Snapchat','Threads','Bluesky','Reddit','Telegram','WhatsApp','Discord','Substack','beehiiv','Mailchimp','Spotify','Apple Podcasts','Apple App Store','Google Play','RSS feed','WeChat','Weibo','Vimeo','Dailymotion','Rumble','Kick','Patreon','Medium','WordPress','Blogger','Other'] as const;
export const propertyRelationships=['Owner','Authorized manager'] as const;
const domains:Partial<Record<typeof mediaPlatforms[number],string[]>>={Instagram:['instagram.com'],TikTok:['tiktok.com'],YouTube:['youtube.com'],Facebook:['facebook.com','fb.com'],'X / Twitter':['x.com','twitter.com'],LinkedIn:['linkedin.com'],Pinterest:['pinterest.com'],Twitch:['twitch.tv'],WeChat:['weixin.qq.com','wechat.com'],Weibo:['weibo.com','weibo.cn'],Vimeo:['vimeo.com'],Dailymotion:['dailymotion.com'],Rumble:['rumble.com'],Kick:['kick.com'],Patreon:['patreon.com'],Medium:['medium.com'],Snapchat:['snapchat.com'],Threads:['threads.com','threads.net'],Bluesky:['bsky.app'],Reddit:['reddit.com'],Telegram:['t.me','telegram.me'],WhatsApp:['whatsapp.com','wa.me'],Discord:['discord.com','discord.gg'],Spotify:['open.spotify.com'],'Apple Podcasts':['podcasts.apple.com'],'Apple App Store':['apps.apple.com'],'Google Play':['play.google.com']};
export function publicMediaUrl(value:string){
 let u:URL;try{u=new URL(value.trim());}catch{throw new Error('Use a complete public HTTPS address.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.length>253||!u.hostname.includes('.')||u.hostname.endsWith('.')||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(u.hostname)||/\.(?:localhost|local|internal|home|lan)$/i.test(u.hostname)||/^\d+(?:\.\d+)*$/.test(u.hostname)||u.href.length>500||[...u.searchParams.keys()].some(k=>/token|secret|password|credential/i.test(k)))throw new Error('Use a public HTTPS property address without login credentials.');
 u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;
}
export function platformMatches(platform:string,url:string){const host=new URL(url).hostname,allowed=domains[platform as keyof typeof domains];return !allowed||allowed.some(domain=>host===domain||host.endsWith('.'+domain));}
export function propertyCovers(property:{url:string;kind:string;method?:string},value:string){try{const a=new URL(publicMediaUrl(property.url)),b=new URL(publicMediaUrl(value));return property.kind==='Website'&&a.hostname===b.hostname?(property.method==='dns_txt'||a.href===b.href||(!a.search&&(a.pathname==='/'||b.pathname.startsWith(a.pathname+'/')))):a.href===b.href;}catch{return false;}}
export function profileMediaUrls(profile:Record<string,unknown>){return [...new Set([profile.primaryUrl,...(Array.isArray(profile.additionalUrls)?profile.additionalUrls:[]),profile.agencyWebsite,profile.portfolioUrl].filter((s):s is string=>typeof s==='string'&&!!s))];}

export function platformKindMatches(kind:string,platform:string){
 if(kind!=='Website')return true;
 return ['Website / blog','Online store','WordPress','Blogger','Medium','Other'].includes(platform);
}
export function platformsForKind(kind:string){
 const groups:Record<string,string[]>={Website:['Website / blog','Online store','WordPress','Blogger','Medium'], 'Social media':['Instagram','TikTok','Facebook','X / Twitter','LinkedIn','Pinterest','Snapchat','Threads','Bluesky','WeChat','Weibo'], 'Video & livestream':['YouTube','TikTok','Twitch','Vimeo','Dailymotion','Rumble','Kick'], Newsletter:['Substack','beehiiv','Mailchimp','Patreon'], Podcast:['Spotify','Apple Podcasts','RSS feed'], 'Mobile app':['Apple App Store','Google Play'], Community:['Reddit','Telegram','WhatsApp','Discord','Patreon']};
 return kind==='Other'?mediaPlatforms:mediaPlatforms.filter(p=>p==='Other'||(groups[kind]||[]).includes(p));
}
