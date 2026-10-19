import type {ReactNode} from 'react';
export function Logo(){return <a className="a-logo" href="/"><span><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 22V13a8 8 0 0 1 16 0v9M8 17h16M16 17v8"/></svg></span>affimaro<span className="a-logo-dot">.</span></a>;}
export function Icon({name}:{name:string}) {
  const paths:Record<string,ReactNode>={
    search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
    check:<path d="m5 12 4 4L19 6"/>,
    grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    users:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/></>,
    link:<path d="m10 13 4-4m-5 6-2 2a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0m2 2 2-2a4.2 4.2 0 0 1 6 6l-4 4a4.2 4.2 0 0 1-6 0"/>,
    shield:<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 10 3 3 5-6"/>,
    store:<path d="m4 3-2 6a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2l-2-6H4Zm0 9v9h16v-9M9 21v-7h6v7"/>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    exit:<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h11"/>,
    chart:<><path d="M4 3v17h17M9 15v-4m5 4V7m5 8V4"/></>,
  };
  return <svg className="a-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]||paths.grid}</svg>;
}
export function PageHeading({eyebrow,title,description,children}:{eyebrow?:string;title:string;description:string;children?:ReactNode}){return <div className="a-page-heading"><div>{eyebrow&&<span className="a-eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{children&&<div className="a-heading-action">{children}</div>}</div>;}
export function Card({title,kicker,children,className=''}:{title?:string;kicker?:string;children:ReactNode;className?:string}){return <section className={`a-card ${className}`}>{title&&<div className="a-card-heading">{kicker&&<span className="a-eyebrow">{kicker}</span>}<h2>{title}</h2></div>}{children}</section>;}
export function Note({children}:{children:ReactNode}){return <div className="a-note"><Icon name="shield"/><div>{children}</div></div>;}
export function Badge({status}:{status:string}){return <span className={`a-badge a-status-${status}`}>{status[0].toUpperCase()+status.slice(1)}</span>;}
export function Empty({icon='users',title,children}:{icon?:string;title:string;children:ReactNode}){return <div className="a-empty"><span><Icon name={icon}/></span><h3>{title}</h3><p>{children}</p></div>;}
export function Stat({label,value,caption,icon='grid',dark=false}:{label:string;value:string|number;caption:string;icon?:string;dark?:boolean}){return <div className={`a-stat ${dark?'a-stat-dark':''}`}><span>{label}<Icon name={icon}/></span><strong>{value}</strong><small>{caption}</small></div>;}
export const formatDate=(value:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value));
