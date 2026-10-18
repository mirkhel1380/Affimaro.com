import {notFound} from 'next/navigation';
import {ownerContext} from '../context';
import {OwnerShell} from '../shell';
import {ownerRecords,ownerDatasets} from '../../../lib/owner';
import {PageHeading,Card} from '../../ui';
import {DatasetTabs,RecordsTable,RecordFilters,RecordPagination} from '../records';
export const dynamic='force-dynamic';
export const metadata={title:'Platform records | Affimaro',robots:{index:false,follow:false}};
export default async function OwnerDataPage({searchParams}:{searchParams:Promise<{table?:string;q?:string;page?:string}>}){
 const {user,db}=await ownerContext('/owner/data'),query=await searchParams,key=query.table||'programs';
 if(key==='users'||!Object.hasOwn(ownerDatasets,key))notFound();
 const data=await ownerRecords(db,user,key,query);
 return <OwnerShell name={user.fullName||'Owner'} email={user.email} active={['partnerships','connections','clients','content'].includes(key)?'programs':key}><PageHeading eyebrow="PLATFORM RECORDS" title={data.title} description={data.description}/><DatasetTabs active={key}/><Card><RecordFilters data={data} path="/owner/data"/><RecordsTable data={data}/><RecordPagination data={data} path="/owner/data"/></Card></OwnerShell>;
}
