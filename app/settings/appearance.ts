import type {AccountPreferences} from '../../lib/account-preferences';
export type Appearance=Pick<AccountPreferences,'theme'|'density'|'reduceMotion'>;
type Entry={value:Appearance;serial:number};
type AppearanceWindow=Window&{__affimaroAppearanceV1?:Record<string,Entry>};
export function appearanceKey(owner=false){return owner?'affimaro.owner.appearance.v1':'affimaro.appearance.v1';}
function normalize(value:Partial<Appearance>|null):Appearance{return {theme:value&&['light','dark','system'].includes(value.theme||'')?value.theme!:'system',density:value?.density==='compact'?'compact':'comfortable',reduceMotion:value?.reduceMotion===true};}
function cache(){if(typeof window==='undefined')return {};const w=window as AppearanceWindow;return w.__affimaroAppearanceV1??(w.__affimaroAppearanceV1={});}
export function readAppearance(owner=false):Appearance{
 const values=cache(),key=appearanceKey(owner);if(values[key])return {...values[key].value};
 let value:Partial<Appearance>|null={};try{value=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
 const result=normalize(value);values[key]={value:result,serial:0};return {...result};
}
export function appearanceSerial(owner=false){return cache()[appearanceKey(owner)]?.serial||0;}
export function applyAppearance(input:Appearance,owner=false){
 if(typeof window==='undefined')return false;
 const value=normalize(input),values=cache(),key=appearanceKey(owner);values[key]={value,serial:(values[key]?.serial||0)+1};
 let persisted=false;try{localStorage.setItem(key,JSON.stringify(value));persisted=true;}catch{}
 let dark=false;try{dark=typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches;}catch{}
 const root=document.documentElement;if(root){root.dataset.affimaroThemeChoice=value.theme;root.dataset.affimaroTheme=value.theme==='system'?(dark?'dark':'light'):value.theme;root.dataset.affimaroDensity=value.density;root.dataset.affimaroMotion=value.reduceMotion?'reduced':'normal';}
 try{window.dispatchEvent(new CustomEvent('affimaro:appearance',{detail:{owner}}));}catch{}
 return persisted;
}
