import {BrandPartnershipView} from '../../../brand-partnership-view';
export const dynamic='force-dynamic';
export default function Page(props:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){return BrandPartnershipView({...props,portal:'affiliate'});}
