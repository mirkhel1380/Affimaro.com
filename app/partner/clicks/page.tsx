import {ClicksView} from '../../clicks-view';
export const dynamic='force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<{application?:string;days?:string;page?:string}>}){return ClicksView({portal:'affiliate',searchParams});}
