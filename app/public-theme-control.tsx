import {publicThemeMenu} from '../lib/public-theme.mjs';
export function PublicThemeControl(){return <><div dangerouslySetInnerHTML={{__html:publicThemeMenu}}/><script src="/site-theme.js?v=1" defer/></>;}
