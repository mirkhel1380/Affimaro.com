import {SettingsView} from './view';
export const dynamic='force-dynamic';
export const metadata={title:'Settings | Affimaro',robots:{index:false,follow:false}};
export default function Page(props:{searchParams:Promise<{tab?:string}>}){return SettingsView(props);}
