import {BillingView,type BillingQuery} from '../../billing/page';
export const dynamic='force-dynamic';
export default async function AgencyBilling({searchParams}:{searchParams:Promise<BillingQuery>}){return BillingView('agency',await searchParams);}
