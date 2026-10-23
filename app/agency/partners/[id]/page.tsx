import {PartnerApplicationView} from '../../../partner-application-view';
export const dynamic='force-dynamic';
export const metadata={title:'Review partner application | Affimaro',robots:{index:false,follow:false}};
export default function Page({params}:{params:Promise<{id:string}>}){return PartnerApplicationView({portal:'agency',params});}
