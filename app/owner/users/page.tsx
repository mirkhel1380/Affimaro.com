import {notFound} from 'next/navigation';
import {AppError} from '../../../lib/service';
import {ownerContext} from '../context';
import {OwnerShell} from '../shell';
import {ownerAccount,ownerRecords} from '../../../lib/owner';
import {PageHeading,Card,Badge,Stat,formatDate} from '../../ui';
import {RecordsTable,RecordFilters,RecordPagination} from '../records';
import {ProfileDetails} from '../../application/profile-details';
export const dynamic='force-dynamic';
export const metadata={title:'All accounts | Affimaro',robots:{index:false,follow:false}};
export default async function OwnerUsersPage({searchParams}:{searchParams:Promise<{q?:string;page?:string;role?:string;user?:string}>}){
 const {user,db}=await ownerContext('/owner/users'),query=await searchParams;
 if(query.user){let record;try{record=await ownerAccount(db,user,query.user);}catch(error){if(error instanceof AppError&&error.status===404)notFound();throw error;}const {account,detail,totals}=record;return <OwnerShell name={user.fullName||'Owner'} email={user.email} active="users"><PageHeading eyebrow="ACCOUNT DETAILS" title={String(account.display_name)} description={String(account.email)}><a href="/owner/users" className="a-btn a-btn-outline">All accounts</a></PageHeading><div className="o-account-summary"><Badge status={String(account.portal)}/><Badge status={String(account.status).replaceAll('_',' ')}/><span>Joined {formatDate(String(account.created_at))}</span></div><div className="a-stats o-stats"><Stat label="Workspaces" value={totals.workspaces} caption="Owned program workspaces"/><Stat label="Partnership applications" value={totals.partnerships} caption="Applications to partner programs"/><Stat label="Creator content" value={totals.content} caption="Content directory records"/><Stat label="Agency clients" value={totals.clients} caption="Client directory records"/></div><Card title="Application profile"><div className="a-card-body">{detail?<><ProfileDetails profile={detail.application.profile}/><a className="a-btn a-btn-dark" href={'/owner/applications?status='+detail.application.status+'&applicant='+encodeURIComponent(query.user)}>Open application & review history</a></>:<p>This account has no platform application on record. Its original records have been preserved.</p>}</div></Card></OwnerShell>;}
 const data=await ownerRecords(db,user,'users',query);
 return <OwnerShell name={user.fullName||'Owner'} email={user.email} active="users"><PageHeading eyebrow="ALL FOUR ACCOUNT TYPES" title="Every account. One directory." description={data.description}/><Card><RecordFilters data={data} path="/owner/users"/><RecordsTable data={data}/><RecordPagination data={data} path="/owner/users"/></Card></OwnerShell>;
}
