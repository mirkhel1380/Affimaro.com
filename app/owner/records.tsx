import type {ReactNode} from 'react';
import {Badge,Empty,formatDate} from '../ui';
import {ownerDatasets,ownerRecords} from '../../lib/owner';
import {money} from '../../lib/money';
export function ownerMoney(value:number,currency:string,decimals:number){return money(value,currency,decimals,'code');}
export function RecordsTable({data}:{data:Awaited<ReturnType<typeof ownerRecords>>}){
 if(!data.rows.length)return <Empty title="No matching records.">{data.q?'Try another search or clear the filters.':'Records appear here as real accounts and activity are added to Affimaro.'}</Empty>;
 return <div className="a-table-wrap"><table className="a-order-table o-table"><caption className="o-sr-only">{data.title}</caption><thead><tr>{data.columns.map(c=><th scope="col" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={String(row.id)}>{data.columns.map(c=>{const value=row[c.key];let cell:ReactNode=value===null||value===undefined||value===''?'—':String(value);if(value!==null&&value!==undefined&&value!==''){
 if(c.kind==='account')cell=<a className="o-record-link" href={'/owner/users?user='+encodeURIComponent(String(row.user_id||row.id))}>{String(value)}</a>;
 if(c.kind==='status')cell=<Badge status={String(value).replaceAll('_',' ')}/>;
 if(c.kind==='date')cell=Number.isFinite(Date.parse(String(value)))?formatDate(String(value)):String(value);
 if(c.kind==='rate')cell=Number(value)/100+'%';
 if(c.kind==='money')cell=ownerMoney(Number(value),String(row.currency),Number(row.decimals));
 }return <td key={c.key}>{cell}</td>;})}</tr>)}</tbody></table></div>;
}
export function DatasetTabs({active}:{active:string}){return <nav className="a-tabs o-data-tabs" aria-label="Operational datasets">{Object.entries(ownerDatasets).filter(([k])=>k!=='users').map(([key,set])=><a href={'/owner/data?table='+key} key={key} className={active===key?'is-active':''} aria-current={active===key?'page':undefined}>{set.title}</a>)}</nav>;}
export function RecordFilters({data,path}:{data:Awaited<ReturnType<typeof ownerRecords>>;path:string}){
 return <form className="o-filters" action={path} method="get">{data.key!=='users'&&<input type="hidden" name="table" value={data.key}/>}<label className="a-field"><span>Search {data.title.toLowerCase()}</span><input type="search" name="q" defaultValue={data.q} maxLength={120} placeholder={data.key==='orders'?'Order ID, business or partner':'Name, email or status'}/></label>{data.key==='users'&&<label className="a-field"><span>Account type</span><select name="role" defaultValue={data.role}><option value="">All account types</option>{['brand','affiliate','creator','agency','owner','unassigned'].map(p=><option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}</select></label>}{data.key==='orders'&&<label className="a-field"><span>Order review</span><select name="review" defaultValue={data.review}><option value="">All orders</option><option value="required">Needs review</option><option value="clear">Clear</option></select></label>}<button className="a-btn a-btn-dark" type="submit">Apply filters</button><a className="a-btn a-btn-outline" href={path+(data.key==='users'?'':'?table='+data.key)}>Clear</a></form>;
}
export function RecordPagination({data,path}:{data:Awaited<ReturnType<typeof ownerRecords>>;path:string}){
 const link=(page:number)=>path+'?'+new URLSearchParams({...(data.key!=='users'?{table:data.key}:{}),...(data.q?{q:data.q}:{}),...(data.role?{role:data.role}:{}),...(data.review?{review:data.review}:{}),page:String(page)});
 const start=data.rows.length?(data.page-1)*data.pageSize+1:0,end=data.rows.length?start+data.rows.length-1:0;
 return <div className="o-pagination"><span>{start}–{end} of {data.total} records</span><div>{data.page>1&&<a className="a-btn a-btn-outline a-btn-small" href={link(data.page-1)}>Previous</a>}{data.page*data.pageSize<data.total&&<a className="a-btn a-btn-outline a-btn-small" href={link(data.page+1)}>Next</a>}</div></div>;
}
