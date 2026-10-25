import {notFound} from 'next/navigation';
import type {PortalPageQuery} from '../../../lib/portal-return-path';
import {ownerUsersPath,ownerRecordSource,ownerAccountBackPath} from '../navigation';
import {AppError} from '../../../lib/service';
import {ownerContext} from '../context';
import {OwnerShell} from '../shell';
import {ownerAccount,ownerRecords} from '../../../lib/owner';
import {PageHeading,Card,Badge,Stat,formatDate} from '../../ui';
import {RecordsTable,RecordFilters,RecordPagination} from '../records';
import {ProfileDetails} from '../../application/profile-details';
export const dynamic='force-dynamic';
export const metadata={title:'All accounts | Affimaro',robots:{index:false,follow:false}};
export default async function OwnerUsersPage({searchParams}:{searchParams:Promise<PortalPageQuery>}){
 const query=await searchParams,{user,db}=await ownerContext(ownerUsersPath(query));
 const selectedUser=typeof query.user==='string'?query.user:undefined;
 const invalidFilters=(message:string)=><OwnerShell name={user.fullName||'Owner'} email={user.email} active="users"><PageHeading title="Check your account filters." description="Choose one supported value for each account filter."/><Card><div className="a-card-body"><p role="alert">{message}</p><a className="a-btn a-btn-outline" href="/owner/users">Reset account filters</a></div></Card></OwnerShell>;
 for(const key of ['user','q','role','page','source','review'])if(query[key]!==undefined&&typeof query[key]!=='string')return invalidFilters('Use each account filter once.');
 if(selectedUser!==undefined&&(!selectedUser.trim()||selectedUser.length>200||/[\u0000-\u001f\u007f]/.test(selectedUser)))return invalidFilters('Choose a valid account to inspect.');
 if(query.source!==undefined&&!ownerRecordSource(query.source))return invalidFilters('Choose a supported records source.');
 if(selectedUser){let record;try{record=await ownerAccount(db,user,selectedUser);}catch(error){if(error instanceof AppError&&error.status===404)notFound();throw error;}const {account,detail,totals}=record;return <OwnerShell name={user.fullName||'Owner'} email={user.email} active="users"><PageHeading eyebrow="ACCOUNT DETAILS" title={String(account.display_name)} description={String(account.email)}><a href={ownerAccountBackPath(query)} className="a-btn a-btn-outline">{ownerRecordSource(query.source)?'Back to records':'All accounts'}</a>{ownerRecordSource(query.source)&&<a href="/owner/users" className="a-btn a-btn-outline">All accounts</a>}</PageHeading><div className="o-account-summary"><Badge status={String(account.portal)}/><Badge status={String(account.status).replaceAll('_',' ')}/><span>Joined {formatDate(String(account.created_at))}</span></div><div className="a-stats o-stats"><Stat label="Workspaces" value={totals.workspaces} caption="Owned program workspaces"/><Stat label="Partnership applications" value={totals.partnerships} caption="Applications to partner programs"/><Stat label="Creator content" value={totals.content} caption="Content directory records"/><Stat label="Agency clients" value={totals.clients} caption="Client directory records"/></div><Card title="Application profile"><div className="a-card-body">{detail?<><ProfileDetails profile={detail.application.profile}/><a className="a-btn a-btn-dark" href={'/owner/applications?status='+detail.application.status+'&applicant='+encodeURIComponent(selectedUser)}>Open application & review history</a></>:<p>This account has no platform application on record. Its original records have been preserved.</p>}</div></Card></OwnerShell>;}
 let data:Awaited<ReturnType<typeof ownerRecords>>;try{data=await ownerRecords(db,user,'users',query);}catch(error){if(!(error instanceof AppError)||error.status!==400)throw error;return invalidFilters(error.message);}
 return <OwnerShell name={user.fullName||'Owner'} email={user.email} active="users"><PageHeading eyebrow="ALL FOUR ACCOUNT TYPES" title="Every account. One directory." description={data.description}/><Card><RecordFilters data={data} path="/owner/users"/><RecordsTable data={data}/><RecordPagination data={data} path="/owner/users"/></Card></OwnerShell>;
}
