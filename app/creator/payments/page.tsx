import {requirePortalUser} from '../../portal-auth';
import Page from '../../payments/page';
export const dynamic='force-dynamic';
export default async function RolePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){await requirePortalUser('creator','/creator/payments');return Page({searchParams:Promise.resolve({...await searchParams,view:'creator'})});}
