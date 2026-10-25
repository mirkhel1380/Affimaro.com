(()=>{
 const form=document.querySelector('[data-contact-form]');if(!form)return;
 const feedback=form.querySelector('[data-contact-feedback]'),submit=form.querySelector('button[type="submit"]');
 if(!feedback||!submit||!globalThis.crypto?.randomUUID)return;
 const field=name=>form.elements.namedItem(name),read=()=>Object.fromEntries(['name','email','topic','message','fax'].map(name=>[name,field(name).value])),idle=submit.innerHTML;let busy=false,lastPayload=JSON.stringify(read()),id=field('id').value;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  const body=read();
  const payload=JSON.stringify(body);if(payload!==lastPayload||!id){id=crypto.randomUUID();lastPayload=payload;}body.id=id;field('id').value=id;
  busy=true;submit.disabled=true;submit.textContent='Sending…';form.setAttribute('aria-busy','true');feedback.textContent='';delete feedback.dataset.state;
  try{
   const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
   const isJson=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()==='application/json';let result;try{if(isJson)result=await response.json();}catch{}
   if(!response.ok||result?.ok!==true||typeof result.data?.reference!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.data.reference))throw new Error(typeof result?.error==='string'?result.error:'Your message could not be confirmed. Please try again.');
   feedback.textContent='Message received. Your reference is '+result.data.reference+'. Keep it if you contact us again.';feedback.dataset.state='success';if(JSON.stringify(read())===payload)form.reset();id='';lastPayload='';field('id').value='';
  }catch(error){feedback.textContent=error instanceof Error?error.message:'Your message could not be saved. Please try again.';feedback.dataset.state='error';}
  finally{busy=false;submit.disabled=false;submit.innerHTML=idle;form.removeAttribute('aria-busy');}
 });
})();
