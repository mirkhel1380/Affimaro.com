import {RelationshipsView} from '../../relationships-view';
export const dynamic='force-dynamic';
export const metadata={title:'My brands | Affimaro',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return RelationshipsView({portal:'creator',searchParams});}
