import {DiscoveryView} from '../../discover/page';
export const dynamic='force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return DiscoveryView({searchParams,expected:'affiliate'});}
