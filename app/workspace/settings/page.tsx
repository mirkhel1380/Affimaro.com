import {SettingsView} from '../../settings/view';
export const dynamic='force-dynamic';
export const metadata={title:'Brand settings | Affimaro',robots:{index:false,follow:false}};
export default function Page(props:{searchParams:Promise<{tab?:string}>}){return SettingsView({...props,portal:'brand'});}
