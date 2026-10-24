import {OrdersView} from '../../orders-view';
export const dynamic='force-dynamic';
export const metadata={title:'Order history | Affimaro',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return OrdersView({portal:'brand',searchParams});}
