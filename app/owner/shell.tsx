import type {ReactNode} from 'react';
import {Logo,Icon} from '../ui';
import {emailSignIn} from '../../lib/auth-mode';
import {chatGPTSignOutPath} from '../chatgpt-auth';
import {publicOrigin} from '../../lib/public-origin-runtime';

const navigation=[
 ['overview','/owner','Overview','grid'],['users','/owner/users','All accounts','users'],
 ['reviews','/owner/applications','Application review','shield'],['programs','/owner/data?table=programs','Programs & partners','store'],
 ['orders','/owner/data?table=orders','Sales & commissions','chart'],['payouts','/owner/data?table=payouts','Partner payouts','shield'],
 ['billing','/owner/data?table=billing','Subscriptions','store'],['activity','/owner/data?table=activity','Platform activity','clock'],
 ['setup','/owner/settings','Settings & launch','check'],
];
export function OwnerShell({name,email,active,children}:{name:string;email:string;active:string;children:ReactNode}){
 return <div className="a-shell o-shell" data-portal="owner"><a className="a-skip" href="#owner-main">Skip to content</a>
 <aside className="a-sidebar"><Logo/><div className="a-sidebar-label">PLATFORM OWNER</div><nav aria-label="Owner navigation">{navigation.map(([key,href,label,icon])=><a href={href} key={key} className={key===active?'is-active':''} aria-current={key===active?'page':undefined}><Icon name={icon}/>{label}</a>)}</nav><div className="a-sidebar-bottom"><div className="a-private"><Icon name="shield"/><strong>Your independent control panel</strong><p>One view across brands, affiliates, creators and agencies.</p></div><a className="a-sidebar-demo" href={publicOrigin()}>View public website<Icon name="arrow"/></a></div></aside>
 <div className="a-main-wrap"><header className="a-topbar"><div><span className="a-topbar-dot"/>OWNER CONTROL PANEL</div><div className="a-user"><span className="a-user-avatar"><Icon name="shield"/></span><span>{name}<small>{email} · Owner</small></span><a href={emailSignIn?'/auth/owner/logout':chatGPTSignOutPath('/')} target="_top" aria-label="Sign out"><Icon name="exit"/></a></div></header><main className="a-main" id="owner-main" tabIndex={-1}>{children}</main><footer className="a-app-footer">Affimaro · Owner control panel</footer></div></div>;
}
