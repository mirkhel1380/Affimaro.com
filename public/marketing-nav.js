(() => {
  // Old sample links now open a dedicated, role-specific demo document.
  const legacy=location.hash.match(/^#\/demo\/(merchant|affiliate)(?:\/([a-z-]+))?$/);
  if(legacy){location.replace('/demo/'+(legacy[1]==='merchant'?'brands':'affiliates')+location.hash);return;}
  const hero=document.querySelector('.m-partnership-visual'),motion=document.querySelector('.m-hero-motion-toggle');
  if(hero&&motion){
    hero.classList.add('is-animated');motion.hidden=false;
    motion.addEventListener('click',()=>{
      const paused=hero.classList.toggle('is-paused');
      motion.textContent=paused?'Resume motion':'Pause motion';
      motion.setAttribute('aria-label',paused?'Resume decorative motion':'Pause decorative motion');
    });
  }
  const toggle=document.querySelector('.mobile-nav-toggle'),navigation=document.querySelector('#main-nav');
  if(!toggle||!navigation)return;
  const items=[...navigation.querySelectorAll('.m-nav-item')];
  const setMenu=(item,open)=>{
    item.classList.toggle('is-open',open);
    item.querySelector('.m-nav-expand')?.setAttribute('aria-expanded',String(open));
  };
  const closeMenus=except=>items.forEach(item=>{if(item!==except)setMenu(item,false);});
  const closeNavigation=()=>{navigation.classList.remove('open');toggle.setAttribute('aria-expanded','false');closeMenus();};
  toggle.addEventListener('click',()=>{const open=navigation.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));if(!open)closeMenus();});
  for(const item of items){
    const expand=item.querySelector('.m-nav-expand');
    const open=()=>{closeMenus(item);setMenu(item,true);};
    item.addEventListener('mouseenter',()=>{if(matchMedia('(hover: hover) and (min-width: 1101px)').matches)open();});
    item.addEventListener('mouseleave',()=>{if(!item.contains(document.activeElement))setMenu(item,false);});
    item.addEventListener('focusin',event=>{if(event.target!==expand)open();});
    item.addEventListener('focusout',()=>queueMicrotask(()=>{if(!item.contains(document.activeElement))setMenu(item,false);}));
    expand?.addEventListener('click',()=>{const wasOpen=item.classList.contains('is-open');closeMenus();setMenu(item,!wasOpen);});
    item.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){event.preventDefault();open();item.querySelector('.m-menu-links a')?.focus();}
      if(event.key==='Escape'){event.preventDefault();setMenu(item,false);expand?.focus();}
    });
  }
  navigation.addEventListener('click',event=>{if(event.target.closest('a'))closeNavigation();});
  document.addEventListener('click',event=>{if(!event.target.closest('.site-header'))closeNavigation();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&navigation.classList.contains('open')){closeNavigation();toggle.focus();}else if(event.key==='Escape')closeMenus();});
})();
