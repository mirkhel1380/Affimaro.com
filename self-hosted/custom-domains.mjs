import {independentWorkerName} from './routing.mjs';
// Run before migrations, secrets or Worker upload: an unavailable domain must
// never replace a working production origin or remove unrelated bindings.
export async function prepareCustomDomains(settings,apiToken,fetcher=fetch){
 const wanted=(settings.routing.routes||[]).filter(r=>r.custom_domain).map(r=>r.pattern);if(!wanted.length)return;
 const manual='In Cloudflare, open Workers & Pages > '+independentWorkerName+' > Settings > Domains & Routes and add Custom Domains '+wanted.join(' and ')+', then retry this build. The current Worker has not been replaced.';
 const root='https://api.cloudflare.com/client/v4',headers={Authorization:'Bearer '+apiToken,'Content-Type':'application/json'};
 async function api(path,body){
  let response;try{response=await fetcher(root+path,{method:body?'PUT':'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000),...(body?{body:JSON.stringify(body)}:{})});}catch{throw new Error('Custom domain readiness could not be verified. '+manual);}
  if(!response.ok){await response.body?.cancel();throw new Error('Custom domain access failed (HTTP '+response.status+'). '+manual);}
  const reader=response.body?.getReader();if(!reader)throw new Error(manual);const chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();throw new Error('Custom domain metadata exceeded its limit. '+manual);}chunks.push(Buffer.from(part.value));}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error(manual);}
  if(data.success!==true||data.result_info?.total_pages>1)throw new Error(manual);return data.result;
 }
 const accountPath='/accounts/'+settings.accountId+'/workers/domains',production=d=>!d.environment||d.environment==='production';
 function inspect(bindings){
  if(!Array.isArray(bindings)||bindings.some(d=>!d||typeof d.hostname!=='string'||typeof d.service!=='string'))throw new Error('Invalid custom domain metadata. '+manual);
  for(const binding of bindings){
   if(wanted.includes(binding.hostname)&&(binding.service!==independentWorkerName||!production(binding)))throw new Error('A requested hostname belongs to another Worker. No binding was replaced. '+manual);
   if(binding.service===independentWorkerName&&production(binding)&&!wanted.includes(binding.hostname))throw new Error('An existing production hostname is absent from this deployment. Preserve it before retrying; no binding was removed.');
  }
  return wanted.filter(host=>!bindings.some(d=>d.hostname===host&&d.service===independentWorkerName&&production(d)));
 }
 const missing=inspect(await api(accountPath));
 if(missing.length){
  const zoneName=new URL(settings.origin).hostname,zones=await api('/zones?'+new URLSearchParams({name:zoneName,'account.id':settings.accountId}));
  if(!Array.isArray(zones)||zones.length!==1||zones[0].name!==zoneName||zones[0].status!=='active'||zones[0].account?.id!==settings.accountId||!/^([a-f0-9]{32})$/.test(zones[0].id))throw new Error('The exact active domain zone could not be verified. '+manual);
  for(const hostname of missing)await api(accountPath,{hostname,service:independentWorkerName,environment:'production',zone_id:zones[0].id});
 }
 if(inspect(await api(accountPath)).length)throw new Error('Custom domain bindings are still pending. '+manual);
 for(const hostname of wanted){
  let response;try{response=await fetcher('https://'+hostname+'/auth/'+(hostname===new URL(settings.ownerOrigin||settings.origin).hostname&&settings.ownerOrigin?'owner':'brand')+'/login',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000)});}catch{throw new Error('DNS or HTTPS is still preparing for '+hostname+'. Retry after it is active. The current Worker has not been replaced.');}
  await response.body?.cancel();if(![200,307,403].includes(response.status))throw new Error('HTTPS is not ready for '+hostname+' (HTTP '+response.status+'). Retry after it is active. The current Worker has not been replaced.');
 }
}
