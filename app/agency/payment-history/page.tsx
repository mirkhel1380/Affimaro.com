import {PaymentHistoryView} from '../../payment-history-view';
export const dynamic='force-dynamic';
export const metadata={title:'Payment history | Affimaro',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return PaymentHistoryView({portal:'agency',searchParams});}
