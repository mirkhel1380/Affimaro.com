import {RelationshipsView} from '../../relationships-view';
export const dynamic='force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return RelationshipsView({portal:'creator',searchParams});}
