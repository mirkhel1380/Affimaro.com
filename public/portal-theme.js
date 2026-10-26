/* Shared with the controls: blocked storage cannot undo a choice for this visit. */
(()=>{
 const scope=typeof window==='undefined'?globalThis:window;
 if(scope.__affimaroThemeBooted)return;scope.__affimaroThemeBooted=true;
 const owner=location.hostname.startsWith('admin.')||/^\/(?:owner|admin)(?:\/|$)/.test(location.pathname),publicPage=!owner&&(document.documentElement?.dataset.affimaroAppearanceScope==='public'||/^\/preview\/?$/.test(location.pathname)),context=owner?'owner':publicPage?'public':'customer',key=owner?'affimaro.owner.appearance.v1':publicPage?'affimaro.public.appearance.v1':'affimaro.appearance.v1';
 const values=scope.__affimaroAppearanceV1||(scope.__affimaroAppearanceV1={});let device;
 try{if(typeof matchMedia==='function')device=matchMedia('(prefers-color-scheme: dark)');}catch{}
 function apply(){
  let p=values[key]?.value;
  if(!p){try{const saved=JSON.parse(localStorage.getItem(key)||'{}');p=saved&&typeof saved==='object'?saved:{};}catch{p={};}p={theme:['light','dark','system'].includes(p.theme)?p.theme:publicPage?'light':'system',density:p.density==='compact'?'compact':'comfortable',reduceMotion:p.reduceMotion===true};values[key]={value:p,serial:0};}
  const root=document.documentElement;if(!root)return;
  let dark=false;try{dark=!!device?.matches;}catch{}
  root.dataset.affimaroAppearanceScope=context;root.dataset.affimaroThemeChoice=p.theme;root.dataset.affimaroTheme=p.theme==='system'?(dark?'dark':'light'):p.theme;root.dataset.affimaroDensity=p.density;root.dataset.affimaroMotion=p.reduceMotion?'reduced':'normal';
 }
 apply();
 scope.__affimaroThemeControllerV1={scope:context,get:()=>({...values[key].value}),set:theme=>{
  if(!['light','dark','system'].includes(theme))return false;
  const value={...values[key].value,theme};values[key]={value,serial:(values[key].serial||0)+1};let saved=false;
  try{localStorage.setItem(key,JSON.stringify(value));saved=true;}catch{}
  apply();try{scope.dispatchEvent(new CustomEvent('affimaro:appearance',{detail:{owner,scope:context}}));}catch{}
  return saved;
 }};
 try{if(typeof device?.addEventListener==='function')device.addEventListener('change',apply);else if(typeof device?.addListener==='function')device.addListener(apply);}catch{}
 addEventListener('storage',event=>{if(event.key===key||event.key===null){const serial=(values[key]?.serial||0)+1;delete values[key];apply();values[key].serial=serial;}});
 addEventListener('affimaro:appearance',event=>{if(!event.detail||event.detail.owner===owner)apply();});
})();
