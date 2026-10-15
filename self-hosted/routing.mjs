import selectedProject from './cloudflare-project.json' with {type:'json'};
export const independentWorkerName=selectedProject.workerName;

export function independentRouting(value){
  if(!value)return {origin:'https://configure-affimaro.invalid',workersSubdomain:null,config:{workers_dev:false,preview_urls:false,routes:[]}};
  let url;try{url=new URL(value);}catch{throw new Error('APP_ORIGIN must be your independent HTTPS origin.');}
  if(url.protocol!=='https:'||url.pathname!=='/'||url.port||url.username||url.password||url.search||url.hash||url.hostname==='chatgpt.site'||url.hostname.endsWith('.chatgpt.site')||url.hostname.endsWith('.invalid')||url.hostname.endsWith('.'))throw new Error('APP_ORIGIN must be your independent HTTPS origin.');
  if(url.hostname==='workers.dev'||url.hostname.endsWith('.workers.dev')){
    const labels=url.hostname.split('.');
    if(labels.length!==4||labels[0]!==independentWorkerName||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(labels[1]))throw new Error('Use https://'+independentWorkerName+'.YOUR_ACCOUNT_SUBDOMAIN.workers.dev for this Worker.');
    return {origin:url.origin,workersSubdomain:labels[1],config:{workers_dev:true,preview_urls:false,routes:[]}};
  }
  return {origin:url.origin,workersSubdomain:null,config:{workers_dev:false,preview_urls:false,routes:[{pattern:url.hostname,custom_domain:true}]}};
}
