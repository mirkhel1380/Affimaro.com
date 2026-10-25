import {requirePortalUser} from './portal-auth';
import {getRawDb} from '../db';
import {orderHistory,orderQuery,orderSearchParams,orderQueryKeys,orderStates} from '../lib/order-history';
import {ordersPath,portalName,type Portal} from '../lib/portal-policy';
import {AppError} from '../lib/service';
import {OrderTable} from './tracking';
import {Shell,PageHeading,Card,Stat,Empty,Note,Icon} from './ui';
import {portalReturnPath} from '../lib/portal-return-path';

export async function OrdersView({portal,searchParams}:{portal:Portal;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const path=ordersPath(portal),params=await searchParams,user=await requirePortalUser(portal,portalReturnPath(path,params,{state:10,currency:3,range:3,page:7,q:100})),query=new URLSearchParams();
 for(const key of orderQueryKeys){const value=params[key];if(typeof value==='string')query.set(key,value);else if(Array.isArray(value))for(const item of value)query.append(key,item);}
 const shell={portal,name:user.fullName||user.email.split('@')[0],email:user.email,active:'orders'};
 let data:Awaited<ReturnType<typeof orderHistory>>;
 try{data=await orderHistory(getRawDb(),user,orderSearchParams(query));}
 catch(error){if(!(error instanceof AppError)||error.status!==400)throw error;return <Shell {...shell}><PageHeading title="Referred orders" description="Search the saved order history of your own partnerships."/><Card title="Check your order filters"><div className="a-card-body"><p role="alert">{error.message}</p><a className="a-btn a-btn-outline a-btn-small" href={path}>Clear filters</a></div></Card></Shell>;}
 const {filters}=data,href=(page:number)=>path+(orderQuery(filters,page)?'?'+orderQuery(filters,page):''),reports=portal==='agency'?'/agency/reports':portal==='creator'?'/creator/reports':`/reports?view=${data.business?'business':'affiliate'}`;
 return <Shell {...shell}><PageHeading eyebrow={portalName(portal).toUpperCase()+' ORDER HISTORY'} title="Referred orders" description="Find older orders and follow their latest recorded commission state."><a href={reports} className="a-btn a-btn-outline a-btn-small">Performance reports<Icon name="arrow"/></a></PageHeading>
 <div className="a-stats"><Stat label="Matching orders" value={data.summary.total} caption="Every matching saved order, across all pages" icon="store"/><Stat label="Accruing commission" value={data.summary.accrued} caption="Estimated, before business approval" icon="check" dark/><Stat label="Orders needing review" value={data.summary.review} caption="Held or incomplete source data, across all pages" icon="clock"/></div>
 <Card><form className="a-relationship-filters" method="get" action={path}>
  <label className="a-field"><span>Order ID or {data.business?'partner':'business'} name</span><input type="search" name="q" maxLength={100} defaultValue={filters.q} placeholder={data.business?'12345 or partner name':'12345 or business name'}/></label>
  <label className="a-field"><span>Commission state</span><select name="state" defaultValue={filters.state}><option value="all">All states</option>{orderStates.map(state=><option key={state} value={state}>{state==='accrued'?'Accruing commission':state==='review'?'Needs review':state[0].toUpperCase()+state.slice(1)}</option>)}</select></label>
  <label className="a-field"><span>Currency</span><select name="currency" defaultValue={filters.currency}><option value="">All currencies</option>{data.currencies.map(currency=><option key={currency}>{currency}</option>)}</select></label>
  <label className="a-field"><span>Order creation date · UTC</span><select name="range" defaultValue={filters.range}><option value="all">All recorded history</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></label>
  <button className="a-btn a-btn-outline a-btn-small">Apply filters</button><a href={path} className="a-text-link">Clear filters</a>
 </form>{data.currenciesTruncated&&<p className="a-card-body a-fine-print">The selector shows the first 200 currencies and keeps your selection. All currencies remain included when no currency is selected.</p>}</Card>
 <Card title="Order activity">{data.rows.length?<OrderTable orders={data.rows} partner={!data.business} portal={portal} preferences={data.preferences} history={{from:(filters.page-1)*data.pageSize+1,to:(filters.page-1)*data.pageSize+data.rows.length,total:data.summary.total}}/>:<Empty icon="store" title="No referred orders match these filters.">Try fewer filters or choose All recorded history. Orders appear after the business receives a signed store update or imports an eligible Shopify order.</Empty>}</Card>
 {data.pages>0&&<nav className="a-pagination" aria-label="Order history pages">{filters.page>1&&<a className="a-btn a-btn-outline a-btn-small" href={href(filters.page-1)}>Previous</a>}<span>Page {filters.page} of {data.pages}</span>{filters.page<data.pages&&<a className="a-btn a-btn-outline a-btn-small" href={href(filters.page+1)}>Next</a>}</nav>}
 <Note>Dates in the filter use UTC; order timestamps use {data.preferences.timeZone}. Rows are sorted by the latest received update. Later refunds or source holds can change an older order. Estimated commission requires business approval; manage approvals and payment requests in Payments. This page reads saved records. Store data updates when the business completes a sync or its backend delivers a signed update.</Note></Shell>;
}
