import {ProgramResourcesView} from '../../program-resources-view';
export const dynamic='force-dynamic';
export default function Page({searchParams}:{searchParams:Promise<{tab?:string}>}){return ProgramResourcesView({portal:'agency',searchParams});}
