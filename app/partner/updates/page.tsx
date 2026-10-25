import {UpdatesView} from '../../updates-view';
export const dynamic='force-dynamic';
export const metadata={title:'Updates | Affimaro',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return UpdatesView({portal:'affiliate',searchParams});}
