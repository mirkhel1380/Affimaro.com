"use client";
import {useId,useState} from 'react';
import type {ReportFilters,ReportOption} from '../lib/reports';

export function ReportFiltersForm({filters,options,today,truncated}:{filters:ReportFilters;options:ReportOption[];today:string;truncated:boolean}){
  const [range,setRange]=useState(filters.range),id=useId();
  return <form className="a-report-filters" method="get" action="/reports">
    <input type="hidden" name="view" value={filters.view}/>
    <div><label htmlFor={`${id}-range`}>Order period</label><select id={`${id}-range`} name="range" value={range} onChange={event=>setRange(event.target.value as ReportFilters['range'])}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom dates</option></select></div>
    <div><label htmlFor={`${id}-partnership`}>{filters.view==='business'?'Affiliate':'Business / program'}</label><select id={`${id}-partnership`} name="applicationId" defaultValue={filters.applicationId||''}><option value="">All {filters.view==='business'?'affiliates':'your partnerships'}</option>{options.map(option=><option key={option.application_id} value={option.application_id}>{filters.view==='business'?option.partner_name:`${option.business_name} · ${option.program_name}`} · {option.status}</option>)}</select></div>
    <div><label htmlFor={`${id}-from`}>From · UTC</label><input id={`${id}-from`} name="from" type="date" defaultValue={filters.from} max={today} disabled={range!=='custom'} required={range==='custom'}/></div>
    <div><label htmlFor={`${id}-to`}>Through · UTC</label><input id={`${id}-to`} name="to" type="date" defaultValue={filters.to} max={today} disabled={range!=='custom'} required={range==='custom'}/></div>
    <button className="a-btn a-btn-dark" type="submit">Apply filters</button>
    <p>Periods include both dates, using UTC. Custom reports can cover up to 366 days.{truncated?' The selector shows up to 200 partnerships, including your current selection.':''}</p>
  </form>;
}
