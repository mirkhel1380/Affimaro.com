(() => {
  const toggle=document.querySelector('.mobile-nav-toggle');
  const navigation=document.querySelector('#main-nav');
  if(!toggle||!navigation)return;
  const close=()=>{navigation.classList.remove('open');toggle.setAttribute('aria-expanded','false');};
  toggle.addEventListener('click',()=>{
    const open=navigation.classList.toggle('open');
    toggle.setAttribute('aria-expanded',String(open));
  });
  navigation.addEventListener('click',event=>{if(event.target.closest('a'))close();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&navigation.classList.contains('open')){close();toggle.focus();}
  });
})();
