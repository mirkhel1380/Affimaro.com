(()=>{
 const controller=window.__affimaroThemeControllerV1;
 if(!controller||controller.scope!=='public')return;
 for(const menu of document.querySelectorAll('[data-public-theme]')){
  if(menu.dataset.ready==='true')continue;menu.dataset.ready='true';
  const inputs=[...menu.querySelectorAll('input[name="public-theme"]')],status=menu.querySelector('[data-theme-status]');
  const sync=()=>{const choice=controller.get().theme;for(const input of inputs)input.checked=input.value===choice;};
  sync();
  menu.addEventListener('change',event=>{
   if(!inputs.includes(event.target)||!event.target.checked)return;
   const saved=controller.set(event.target.value);sync();
   if(status){status.hidden=saved;status.textContent=saved?'':'Applied for this visit. Browser storage is unavailable.';}
  });
  window.addEventListener('affimaro:appearance',sync);window.addEventListener('storage',sync);
  document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();menu.open=false;menu.querySelector('summary')?.focus();}});
 }
})();
