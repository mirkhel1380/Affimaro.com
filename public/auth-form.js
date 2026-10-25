const providerLink=document.querySelector('a[data-auth-redirect]');if(providerLink)try{const target=new URL(providerLink.href);if(target.protocol==='https:'&&!target.username&&!target.password)location.assign(target.href);}catch{}
// Progressive password visibility only. No values are read, stored or sent.
document.querySelectorAll('[data-password-toggle]').forEach(button=>{
  const input=document.getElementById(button.getAttribute('aria-controls'));
  if(!input||input.type!=='password')return;
  const status=button.parentElement.querySelector('[data-password-status]');
  button.hidden=false;
  button.addEventListener('click',()=>{
    const visible=input.type==='password';
    input.type=visible?'text':'password';
    button.setAttribute('aria-pressed',String(visible));
    button.setAttribute('aria-label',visible?'Hide password':'Show password');
    if(status)status.textContent=visible?'Password is visible.':'Password is hidden.';
  });
});
