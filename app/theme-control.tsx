'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {defaultPreferences,preferenceSchema,settingsPath,type SettingsSnapshot} from '../lib/account-preferences';
import type {Portal} from '../lib/portal-policy';
import {applyAppearance,readAppearance,type Appearance} from './settings/appearance';
type Theme=Appearance['theme'];
const choices=[['light','Light','A bright, clear interface'],['dark','Dark','A darker workspace'],['system','Device','Follow your device setting']] as const;
export function ThemeControl({owner=false,portal='brand',previewMode=false,reviewOnly=false,onOpen,inline=false}:{inline?:boolean;owner?:boolean;portal?:Portal;previewMode?:boolean;reviewOnly?:boolean;onOpen?:(menu:HTMLDetailsElement)=>void}){
 const [theme,setTheme]=useState<Theme>('system'),[busy,setBusy]=useState(false),[error,setError]=useState(''),menu=useRef<HTMLDetailsElement>(null),id=useId();
 useEffect(()=>{const sync=()=>setTheme(readAppearance(owner).theme);sync();window.addEventListener('affimaro:appearance',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('affimaro:appearance',sync);window.removeEventListener('storage',sync);};},[owner]);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target)&&menu.current)menu.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 async function choose(next:Theme){
  if(busy)return;const previous=readAppearance(owner);setBusy(true);setError('');applyAppearance({...previous,theme:next},owner);setTheme(next);
  try{
   if(previewMode){const key='affimaro.preview.settings.v1.'+portal;let saved:Record<string,unknown>={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}const preferences={...defaultPreferences,...preferenceSchema.parse(saved.preferences||{}),theme:next},revision=Number(saved.revision||0)+1;localStorage.setItem(key,JSON.stringify({...saved,portal,preferences,revision}));window.dispatchEvent(new CustomEvent('affimaro:preferences',{detail:{preferences,revision}}));}
   else if(!owner&&!reviewOnly){
    const response=await fetch('/api/account-settings',{credentials:'same-origin',cache:'no-store'}),value=await response.json() as {ok?:boolean;data?:SettingsSnapshot;error?:string};
    if(!response.ok||!value.ok||value.data?.portal!==portal)throw new Error(value.error||'Reload your account before changing its theme.');
    const preferences={...preferenceSchema.parse(value.data.preferences),theme:next},saved=await fetch('/api/account-settings',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preferences',data:{preferences,revision:value.data.revision}})}),result=await saved.json() as {ok?:boolean;error?:string;data?:{preferences:unknown;revision:number}};
    if(!saved.ok||!result.ok||!result.data)throw new Error(result.error||'Your theme could not be saved.');
    const checked=preferenceSchema.parse(result.data.preferences);applyAppearance({...readAppearance(),theme:checked.theme});window.dispatchEvent(new CustomEvent('affimaro:preferences',{detail:{preferences:checked,revision:result.data.revision}}));
   }
   if(menu.current)menu.current.open=false;
  }catch(cause){applyAppearance({...readAppearance(owner),theme:previous.theme},owner);setTheme(previous.theme);setError(cause instanceof Error?cause.message:'Your theme could not be saved.');}
  finally{setBusy(false);}
 }
 if(inline)return <div className="a-theme-inline"><fieldset disabled={busy}><legend>Theme</legend><div>{choices.map(([value,label])=><label key={value} className={theme===value?'is-selected':''}><input type="radio" name={'theme-inline-'+id} value={value} checked={theme===value} onChange={()=>choose(value)}/><span>{label}</span></label>)}</div></fieldset>{busy&&<small>Saving theme…</small>}{error&&<p className="a-form-error" role="alert">{error}</p>}</div>;
 return <details className="a-theme-menu" ref={menu} onToggle={event=>{if(event.currentTarget.open)onOpen?.(event.currentTarget);}} onKeyDown={event=>{if(event.key==='Escape'&&menu.current){event.stopPropagation();menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary title="Themes" aria-label={'Themes: '+(theme==='system'?'Device':theme)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span>Themes</span></summary><div className="a-theme-popover"><fieldset disabled={busy}><legend>Choose your theme</legend>{choices.map(([value,label,description])=><label className={theme===value?'is-selected':''} key={value}><input type="radio" name={'theme-'+id} value={value} checked={theme===value} onChange={()=>choose(value)}/><span className={'a-theme-dot a-theme-dot-'+value} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span></label>)}</fieldset><p>{busy?'Saving theme…':owner||reviewOnly||previewMode?'Saved on this device.':'Saved to your account.'}</p>{!owner&&!reviewOnly&&<a href={previewMode?'/preview/'+portal+'/settings?tab=appearance':settingsPath(portal)+'?tab=appearance'}>More appearance settings ↗</a>}{error&&<p className="a-form-error" role="alert">{error}</p>}</div></details>;
}
