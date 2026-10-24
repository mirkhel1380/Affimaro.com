import {notFound} from 'next/navigation';
import {AppError} from '../../../lib/service';
import {ownerContext} from '../context';
import {OwnerShell} from '../shell';
import {ownerRecords,ownerDatasets} from '../../../lib/owner';
import {PageHeading,Card} from '../../ui';
import {DatasetTabs,RecordsTable,RecordFilters,RecordPagination} from '../records';
export const dynamic='force-dynamic';
export const metadata={title:'Platform records | Affimaro',robots:{index:false,follow:false}};
export default async function OwnerDataPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {user,db}=await ownerContext('/owner/data'),query=await searchParams,key=query.table===undefined?'programs':typeof query.table==='string'?query.table:'';
 if(key==='users'||!Object.hasOwn(ownerDatasets,key))notFound();
 let data:Awaited<ReturnType<typeof ownerRecords>>;
 try{data=await ownerRecords(db,user,key,query);}catch(error){if(!(error instanceof AppError)||error.status!==400)throw error;return <OwnerShell name={user.fullName||'Owner'} email={user.email} active={key}><PageHeading title="Check your record filters." description="Choose one supported value for each filter."/><Card><div className="a-card-body"><p role="alert">{error.message}</p><a className="a-btn a-btn-outline" href={'/owner/data?table='+key}>Reset filters</a></div></Card></OwnerShell>;}
 return <OwnerShell name={user.fullName||'Owner'} email={user.email} active={['partnerships','connections','clients','content'].includes(key)?'programs':key}><PageHeading eyebrow="PLATFORM RECORDS" title={data.title} description={data.description}/><DatasetTabs active={key}/><Card><RecordFilters data={data} path="/owner/data"/><RecordsTable data={data}/><RecordPagination data={data} path="/owner/data"/></Card></OwnerShell>;
}
