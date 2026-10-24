import {ClicksView} from '../../clicks-view';
export const dynamic='force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return ClicksView({portal:'creator',searchParams});}
