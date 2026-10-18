import {BillingView} from '../../billing/page';
export const dynamic='force-dynamic';
export default async function AgencyBilling({searchParams}:{searchParams:Promise<{plan?:string}>}){return BillingView('agency',await searchParams);}
