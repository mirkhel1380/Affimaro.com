'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {defaultPreferences,preferenceSchema,settingsPath} from '../lib/account-preferences';
import type {Portal} from '../lib/portal-policy';
import {applyAppearance,readAppearance,type Appearance} from './settings/appearance';
type Theme=Appearance['theme'];
const choices=[['light','Light','A bright, clear interface'],['dark','Dark','A darker workspace'],['system','Device','Follow your device setting']] as const;
export function ThemeControl({owner=false,portal='brand',previewMode=false,reviewOnly=false,onOpen,inline=false}:{inline?:boolean;owner?:boolean;portal?:Portal;previewMode?:boolean;reviewOnly?:boolean;onOpen?:(menu:HTMLDetailsElement)=>void}){
 const [theme,setTheme]=useState<Theme>('system'),[busy,setBusy]=useState(false),[error,setError]=useState(''),menu=useRef<HTMLDetailsElement>(null),saving=useRef(false),lifecycle=useRef({active:true,generation:0,controller:null as AbortController|null}),id=useId();
 useEffect(()=>{const state=lifecycle.current;state.active=true;saving.current=false;setBusy(false);return()=>{state.active=false;state.generation++;state.controller?.abort();saving.current=false;};},[owner,portal,previewMode,reviewOnly]);
 useEffect(()=>{const sync=()=>setTheme(readAppearance(owner).theme);sync();window.addEventListener('affimaro:appearance',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('affimaro:appearance',sync);window.removeEventListener('storage',sync);};},[owner]);
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target)&&menu.current)menu.current.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 async function choose(next:Theme){
  if(saving.current)return;saving.current=true;const state=lifecycle.current,generation=++state.generation;let timer:ReturnType<typeof setTimeout>|undefined;setBusy(true);setError('');
  try{
   const persisted=applyAppearance({...readAppearance(owner),theme:next},owner);setTheme(next);
   if(!persisted)setError('Theme applied for this visit. Browser storage is unavailable.');
   if(previewMode){const key='affimaro.preview.settings.v1.'+portal;let saved:Record<string,unknown>={};try{const value=JSON.parse(localStorage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}const checked=preferenceSchema.safeParse(saved.preferences),preferences={...(checked.success?checked.data:defaultPreferences),theme:next},revision=(Number.isSafeInteger(saved.revision)&&Number(saved.revision)>=0?Number(saved.revision):0)+1;try{localStorage.setItem(key,JSON.stringify({...saved,portal,preferences,revision}));}catch{setError('Theme applied for this visit. Browser storage is unavailable.');}window.dispatchEvent(new CustomEvent('affimaro:preferences',{detail:{portal,preferences,revision}}));}
   else if(!owner&&!reviewOnly){
    const controller=new AbortController();state.controller=controller;timer=setTimeout(()=>controller.abort(),8000);
    const saved=await fetch('/api/account-settings',{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'theme',data:{portal,theme:next}})}),result=await saved.json() as {ok?:boolean;data?:{portal:Portal;preferences:unknown;revision:number}};
    if(!state.active||generation!==state.generation)return;
    if(!saved.ok||!result.ok||result.data?.portal!==portal||!Number.isSafeInteger(result.data.revision)||result.data.revision<1)throw new Error('Theme account save failed.');
    const checked=preferenceSchema.parse(result.data.preferences);if(checked.theme!==next)throw new Error('Theme changed in another tab.');
    window.dispatchEvent(new CustomEvent('affimaro:preferences',{detail:{portal,preferences:checked,revision:result.data.revision}}));
   }
   if(menu.current)menu.current.open=false;
  }catch{if(state.active&&generation===state.generation)setError('Theme applied on this device. We could not save it to your account; try again when connected.');}
  finally{if(timer)clearTimeout(timer);if(state.active&&generation===state.generation){saving.current=false;state.controller=null;setBusy(false);}}
 }
 if(inline)return <div className="a-theme-inline"><fieldset disabled={busy}><legend>Theme</legend><div>{choices.map(([value,label])=><label key={value} className={theme===value?'is-selected':''}><input type="radio" name={'theme-inline-'+id} value={value} checked={theme===value} onChange={()=>choose(value)}/><span>{label}</span></label>)}</div></fieldset>{busy&&<small>Saving theme…</small>}{error&&<p className="a-form-error" role="alert">{error}</p>}</div>;
 return <details className="a-theme-menu" ref={menu} onToggle={event=>{if(event.currentTarget.open)onOpen?.(event.currentTarget);}} onKeyDown={event=>{if(event.key==='Escape'&&menu.current){event.stopPropagation();menu.current.open=false;menu.current.querySelector('summary')?.focus();}}}><summary title="Themes" aria-label={'Themes: '+(theme==='system'?'Device':theme)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span>Themes</span></summary><div className="a-theme-popover"><fieldset disabled={busy}><legend>Choose your theme</legend>{choices.map(([value,label,description])=><label className={theme===value?'is-selected':''} key={value}><input type="radio" name={'theme-'+id} value={value} checked={theme===value} onChange={()=>choose(value)}/><span className={'a-theme-dot a-theme-dot-'+value} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span></label>)}</fieldset><p>{busy?'Saving theme…':owner||reviewOnly||previewMode?'Saved on this device.':'Saved to your account.'}</p>{!owner&&!reviewOnly&&<a href={previewMode?'/preview/'+portal+'/settings?tab=appearance':settingsPath(portal)+'?tab=appearance'}>More appearance settings ↗</a>}{error&&<p className="a-form-error" role="alert">{error}</p>}</div></details>;
}
