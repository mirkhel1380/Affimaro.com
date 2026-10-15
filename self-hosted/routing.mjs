export const independentWorkerName='affimaro';

export function independentRouting(value){
  if(!value)return {origin:'https://configure-affimaro.invalid',workersSubdomain:null,config:{workers_dev:false,preview_urls:false,routes:[]}};
  let url;try{url=new URL(value);}catch{throw new Error('APP_ORIGIN must be your independent HTTPS origin.');}
  if(url.protocol!=='https:'||url.pathname!=='/'||url.port||url.username||url.password||url.search||url.hash||url.hostname==='chatgpt.site'||url.hostname.endsWith('.chatgpt.site')||url.hostname.endsWith('.invalid')||url.hostname.endsWith('.'))throw new Error('APP_ORIGIN must be your independent HTTPS origin.');
  if(url.hostname==='workers.dev'||url.hostname.endsWith('.workers.dev')){
    const match=/^affimaro\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.workers\.dev$/.exec(url.hostname);
    if(!match)throw new Error('Use https://affimaro.YOUR_ACCOUNT_SUBDOMAIN.workers.dev for this Worker.');
    return {origin:url.origin,workersSubdomain:match[1],config:{workers_dev:true,preview_urls:false,routes:[]}};
  }
  return {origin:url.origin,workersSubdomain:null,config:{workers_dev:false,preview_urls:false,routes:[{pattern:url.hostname,custom_domain:true}]}};
}
