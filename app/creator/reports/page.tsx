import {requirePortalUser} from '../../portal-auth';
import {portalReturnPath} from '../../../lib/portal-return-path';
import Page from '../../reports/page';
export const dynamic='force-dynamic';
export default async function RolePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams;await requirePortalUser('creator',portalReturnPath('/creator/reports',query,{applicationId:36,range:6,from:10,to:10}));return Page({searchParams:Promise.resolve({...query,view:'creator'})});}
