import {portalName,businessPortal,portalHome,type Portal} from '../lib/portal-policy';
import type {ReactNode} from 'react';
import {emailSignIn} from '../lib/auth-mode';
import {chatGPTSignOutPath} from './chatgpt-auth';
import {PortalNavigation,type PortalNavLink,type PortalNavGroup} from './portal-navigation';
import {relationshipsPath} from '../lib/relationships';
import {settingsPath} from '../lib/account-preferences';
import {PreferencesBridge} from './settings/preferences-bridge';
import {previewHref} from '../lib/portal-preview';
export {Logo,Icon,PageHeading,Card,Note,Badge,Empty,Stat,formatDate} from './portal-elements';
export function Shell({name,email,active,children,portal='brand',reviewOnly=false,previewMode=false}:{name:string;email:string;active:string;children:ReactNode;portal?:Portal;reviewOnly?:boolean;previewMode?:boolean}){
 const label=portalName(portal),business=businessPortal(portal),relationships=relationshipsPath(portal),prefix=({brand:'/workspace',agency:'/agency',affiliate:'/partner',creator:'/creator'})[portal],reports=({brand:'/reports?view=business',agency:'/agency/reports',affiliate:'/reports?view=affiliate',creator:'/creator/reports'})[portal],payments=({brand:'/payments?view=business',agency:'/agency/payments',affiliate:'/payments?view=affiliate',creator:'/creator/payments'})[portal];
 const link=(key:string,href:string,text:string,description?:string):PortalNavLink=>({key,href:previewMode?previewHref(portal,href):href,label:text,description,current:active===key}),group=(id:string,text:string,links:PortalNavLink[],keys:string[]=[]):PortalNavGroup=>({id,label:text,links,current:links.some(l=>l.current)||keys.includes(active)});
 const relationshipLinks=[link('relationships',relationships,business?'All partners':'All my brands'),...(['approved','pending'] as const).map(tab=>link('relationship-'+tab,relationships+'?tab='+tab,tab==='approved'?(business?'Approved partners':'Approved brands'):'Pending applications')),link('invitations',relationships+'?tab=invitations',business?'Sent invitations':'Invitations'),link('relationship-rejected',relationships+'?tab=rejected','Declined applications'),link('relationship-suspended',relationships+'?tab=suspended','Suspended partnerships')];
 const groups:PortalNavGroup[]=reviewOnly?[group('application','Application',[link('application','/application','Application status')]),group('ownership','Channels',[link('ownership','/application/media','Channels & ownership')])]:[
  group('overview','Overview',[link(({brand:'business',agency:'agency',affiliate:'partner',creator:'creator'})[portal],portalHome(portal),'Overview')]),
  group('discover','Discover',[link('discover',prefix+'/discover',business?'Find affiliates & creators':'Find brand programs'),link('saved',prefix+'/discover?tab=saved','Saved profiles'),link('listing',prefix+'/discover?tab=listing','My discovery listing')]),
  group('partnerships',business?'My partners':'My brands',relationshipLinks),
  ...(business?[group('program',portal==='agency'?'Agency tools':'Program & assets',[
    ...(portal==='agency'?[link('clients','/agency/clients','Client directory'),link('business','/agency/program','Represented program')]:[link('program-settings','/workspace','Program & store settings')]),
    link('resources',prefix+'/resources','Brand assets','Banners, images and approved promotional copy'),link('coupons',prefix+'/resources?tab=coupons','Coupon codes','Publish offers for approved partners')])]:portal==='creator'?[group('content','Content',[link('content','/creator/content','Content planner'),link('profile','/creator/profile','Channels & profile')])]:[]),
  group('reports','Reports',[link('reports',reports,'Performance reports'),link('orders',prefix+'/orders','Referred orders','Search your complete recorded order history'),link('clicks',prefix+'/clicks','Clicks','Daily trends, sources and click activity')]),
  group('payments',business?'Payments':'Earnings',[
   link('payments',payments,business?'Partner payments':portal==='creator'?'My earnings':'My commissions'),link('payment-history',prefix+'/payment-history','Payment history','Search all partner commission requests'),
   ...(business?[link('commission-approvals',prefix+'/commission-approvals','Commission approvals','Review every referred order before payment'),link('billing',portal==='agency'?'/agency/billing':'/billing','Package & billing')]:[])
  ])
 ];
 const account:PortalNavLink[]=[...(!reviewOnly?[link('account','/account',label+' account'),link('application','/application',portal==='agency'?'Agency profile':'Application profile')]:[]),link('ownership','/application/media','Channels & ownership'),link('settings',reviewOnly?'/account/close':settingsPath(portal),'Settings'),...(!reviewOnly&&(portal==='brand'||portal==='affiliate')?[link('start',portal==='affiliate'?'/start?view=affiliate':'/start','Getting started')]:[]),...(!previewMode&&emailSignIn?[{key:'install',href:'/install',label:'Install Affimaro'}]:[]),{key:'preview',href:previewMode?'/preview':'/demo/'+({brand:'brands',affiliate:'affiliates',creator:'creators',agency:'agencies'})[portal],label:previewMode?'All four portal previews':'Explore the '+label.toLowerCase()+' demo'}];
 return <div className="a-shell a-shell-top" data-portal={portal}><a className="a-skip" href="#account-main">Skip to content</a><PortalNavigation groups={groups} account={account} name={name} email={email} label={label} previewMode={previewMode} reviewOnly={reviewOnly} exitHref={previewMode?'/preview':chatGPTSignOutPath('/')}/><div className="a-main-wrap"><main className="a-main" id="account-main" tabIndex={-1}><PreferencesBridge portal={portal} previewMode={previewMode}/>{children}</main><footer className="a-app-footer">Affimaro{reviewOnly?' · Application review':' · '+label+' portal'}</footer></div></div>;
}
