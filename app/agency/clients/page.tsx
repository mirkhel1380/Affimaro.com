import {AgencyWorkspace} from '../page';
export const dynamic='force-dynamic';
export default function Clients({searchParams=Promise.resolve({})}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){return AgencyWorkspace('clients',searchParams);}
