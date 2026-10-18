import {requirePortalUser} from '../../portal-auth';
import Page from '../../reports/page';
export const dynamic='force-dynamic';
export default async function RolePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){await requirePortalUser('agency','/agency/reports');return Page({searchParams:Promise.resolve({...await searchParams,view:'agency'})});}
