/* Shared with the controls: blocked storage cannot undo a choice for this visit. */
(()=>{
 const scope=typeof window==='undefined'?globalThis:window;
 if(scope.__affimaroThemeBooted)return;scope.__affimaroThemeBooted=true;
 const owner=location.hostname.startsWith('admin.')||/^\/(?:owner|admin)(?:\/|$)/.test(location.pathname),key=owner?'affimaro.owner.appearance.v1':'affimaro.appearance.v1';
 const values=scope.__affimaroAppearanceV1||(scope.__affimaroAppearanceV1={});let device;
 try{if(typeof matchMedia==='function')device=matchMedia('(prefers-color-scheme: dark)');}catch{}
 function apply(){
  let p=values[key]?.value;
  if(!p){try{const saved=JSON.parse(localStorage.getItem(key)||'{}');p=saved&&typeof saved==='object'?saved:{};}catch{p={};}p={theme:['light','dark','system'].includes(p.theme)?p.theme:'system',density:p.density==='compact'?'compact':'comfortable',reduceMotion:p.reduceMotion===true};values[key]={value:p,serial:0};}
  const root=document.documentElement;if(!root)return;
  let dark=false;try{dark=!!device?.matches;}catch{}
  root.dataset.affimaroThemeChoice=p.theme;root.dataset.affimaroTheme=p.theme==='system'?(dark?'dark':'light'):p.theme;root.dataset.affimaroDensity=p.density;root.dataset.affimaroMotion=p.reduceMotion?'reduced':'normal';
 }
 apply();
 try{if(typeof device?.addEventListener==='function')device.addEventListener('change',apply);else if(typeof device?.addListener==='function')device.addListener(apply);}catch{}
 addEventListener('storage',event=>{if(event.key===key||event.key===null){const serial=(values[key]?.serial||0)+1;delete values[key];apply();values[key].serial=serial;}});
 addEventListener('affimaro:appearance',event=>{if(!event.detail||event.detail.owner===owner)apply();});
})();
