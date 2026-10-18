import {WorkspaceView} from '../../workspace/page';
export const dynamic='force-dynamic';
export default function AgencyProgram(props:{searchParams:Promise<{tab?:string}>}){return WorkspaceView({...props,portal:'agency',base:'/agency/program'});}
