import {Badge,Empty,formatDate} from './ui';
import type {TrackedOrder} from '../lib/woocommerce';
import {money} from '../lib/money';
import {ordersPath,type Portal} from '../lib/portal-policy';
import {reportTimestamp,type AccountPreferences} from '../lib/account-preferences';
export {money};
export function OrderTable({orders,partner=false,portal=partner?'affiliate':'brand',preferences,history}:{orders:TrackedOrder[];partner?:boolean;portal?:Portal;preferences?:AccountPreferences;history?:{from:number;to:number;total:number}}){
  const reports=portal==='agency'?'/agency/reports':portal==='creator'?'/creator/reports':`/reports?view=${partner?'affiliate':'business'}`;
  if(!orders.length)return <><Empty icon="store" title="Your first referred sale belongs here.">Verified store orders will appear after a store is connected and an approved partner’s referral leads to an order.</Empty><p className="a-table-foot"><a href={ordersPath(portal)}>Search all recorded orders ↗</a></p></>;
  return <div className="a-table-wrap"><table className="a-order-table"><thead><tr><th>Order</th><th>{partner?'Business':'Partner'}</th><th>Net merchandise</th><th>Refunded</th><th>Commission</th><th>State</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong>#{o.external_id}</strong><small>{preferences?reportTimestamp(o.created_at,preferences):formatDate(o.created_at)} · {o.status}</small></td><td>{partner?o.business_name:o.partner_name}</td><td>{money(o.basis,o.currency,o.decimals)}</td><td>{money(o.refunded_basis,o.currency,o.decimals)}</td><td><strong>{money(o.commission,o.currency,o.decimals)}</strong><small>{o.rate_bps/100}% referral rate</small></td><td><Badge status={o.commission_state}/>{o.commission_state==='review'&&<small>Review the source order, then sync or retry.</small>}</td></tr>)}</tbody></table><p className="a-table-foot">{history?`Orders ${history.from}–${history.to} of ${history.total}`:'Latest 100 received orders'} · Estimated commission requires business approval. Manage approvals and payment requests in Payments. {!history&&<><a href={ordersPath(portal)}>Search all recorded orders ↗</a> · </>}<a href={reports}>Open dated reports ↗</a></p></div>;
}
