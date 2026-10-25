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

// Explain unconfigured providers without leaving the form or losing its fields.
// The server independently checks availability on every real provider request.
document.querySelectorAll('form').forEach(form=>{
 const button=form.querySelector('[data-provider-unavailable]');if(!button)return;
 form.addEventListener('submit',event=>{event.preventDefault();const provider=button.getAttribute('data-provider-unavailable'),name=provider==='google'?'Google':provider==='apple'?'Apple':'Organization SSO',feedback=document.getElementById('auth-provider-feedback');if(feedback){feedback.textContent=button.getAttribute('data-provider-state')==='unknown'?name+' sign-in availability could not be checked. Use your email below or reload the page to try again.':name+' sign-in is not connected yet. Use the email form below, or try again after the site owner completes setup.';feedback.setAttribute('tabindex','-1');feedback.focus();}});
});
