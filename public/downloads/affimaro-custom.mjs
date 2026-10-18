/** Affimaro custom website client v0.1.0. Node.js 22.13+; server use only. */
import {createHmac,randomUUID} from 'node:crypto';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const orderId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const statuses=new Set(['pending','on-hold','processing','completed','cancelled','failed','refunded']);
const orderFields=['orderId','revision','referralId','createdAt','currency','decimals','basis','refundedBasis','status','refundUnallocated'];
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const amount=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000_000;
function httpsUrl(value,originOnly=false){
  try{
    if(typeof value!=='string'||value.length>300)throw new Error();
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)||(originOnly&&url.pathname!=='/'))throw new Error();
    return originOnly?url.origin:value.trim().replace(/\/+$/,'');
  }catch{throw new TypeError(originOnly?'Use the HTTPS Affimaro origin without a path.':'Use the exact public HTTPS website home URL.');}
}
export class AffimaroDeliveryError extends Error{
  constructor(message,{eventId,status=0,code='network',retryable=false}){
    super(message);this.name='AffimaroDeliveryError';this.eventId=eventId;this.status=status;this.code=code;this.retryable=retryable;
  }
}
async function boundedJson(response){
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new Error();
  const reader=response.body?.getReader();if(!reader)throw new Error();
  const parts=[];let size=0;
  try{
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384)throw new Error();parts.push(next.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{await reader.cancel().catch(()=>{});throw new Error('Invalid response.');}
}
export function createAffimaroClient({origin,connectionId,signingKey,storeUrl,fetcher=globalThis.fetch}){
  const base=httpsUrl(origin,true),home=httpsUrl(storeUrl);
  if(typeof connectionId!=='string'||!uuid.test(connectionId))throw new TypeError('Use the connection ID from your custom website settings.');
  if(typeof signingKey!=='string'||!/^[a-f0-9]{64}$/.test(signingKey))throw new TypeError('Use the 64-character signing key from your custom website settings.');
  if(typeof fetcher!=='function')throw new TypeError('A server fetch implementation is required.');
  async function send(event,eventId){
    if(typeof eventId!=='string'||!uuid.test(eventId))throw new TypeError('Persist a UUID eventId in your server outbox before delivery. Reuse it on retries.');
    const raw=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));
    if(Buffer.byteLength(raw,'utf8')>16384)throw new TypeError('The event exceeds 16 KiB.');
    // The signing key is used as UTF-8 text, never decoded from hexadecimal.
    const signature=createHmac('sha256',signingKey).update(`${timestamp}.${eventId}.${raw}`,'utf8').digest('hex');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);timer.unref?.();
    try{
      let response;
      try{response=await fetcher(base+'/api/custom/event',{method:'POST',redirect:'manual',credentials:'omit',signal:controller.signal,headers:{'Content-Type':'application/json','X-Affimaro-Store':connectionId,'X-Affimaro-Event':eventId,'X-Affimaro-Timestamp':timestamp,'X-Affimaro-Signature':signature},body:raw});}
      catch{throw new AffimaroDeliveryError('Delivery was interrupted. Retry the same event ID and payload.',{eventId,retryable:true});}
      if(!response.ok){
        await response.body?.cancel().catch(()=>{});
        throw new AffimaroDeliveryError(`Affimaro rejected the event (HTTP ${response.status}).`,{eventId,status:response.status,code:'http',retryable:[408,429].includes(response.status)||response.status>=500});
      }
      let result;
      try{result=await boundedJson(response);}catch{throw new AffimaroDeliveryError('The delivery response could not be verified. Retry the same event ID and payload.',{eventId,status:response.status,code:'invalid-response',retryable:true});}
      const data=result?.data;
      if(result?.ok===true&&data&&typeof data==='object'){
        if(event.kind==='ping'&&data.connected===true)return {connected:true};
        if(event.kind==='referral'&&uuid.test(data.referralId)&&date(data.expiresAt))return {referralId:data.referralId,expiresAt:data.expiresAt};
        if(event.kind==='order'&&data.orderId===event.orderId&&(data.accepted===true||data.stale===true))return {orderId:data.orderId,...(data.stale===true?{stale:true}:{accepted:true})};
      }
      throw new AffimaroDeliveryError('The delivery response could not be verified. Retry the same event ID and payload.',{eventId,status:response.status,code:'invalid-response',retryable:true});
    }finally{clearTimeout(timer);}
  }
  return Object.freeze({
    ping:({eventId=randomUUID()}={})=>send({kind:'ping',storeUrl:home},eventId),
    referral(applicationId,{eventId}={}){
      if(typeof applicationId!=='string'||!uuid.test(applicationId))throw new TypeError('Use the application ID in an approved partner’s referral link.');
      return send({kind:'referral',applicationId},eventId);
    },
    order(snapshot,{eventId}={}){
      if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||Object.keys(snapshot).length!==orderFields.length||orderFields.some(field=>!Object.hasOwn(snapshot,field)))throw new TypeError('Send exactly the documented order snapshot fields.');
      const s=snapshot;
      if(typeof s.orderId!=='string'||!orderId.test(s.orderId)||!Number.isSafeInteger(s.revision)||s.revision<1||typeof s.referralId!=='string'||!uuid.test(s.referralId)||!date(s.createdAt)||typeof s.currency!=='string'||!(/^[A-Z]{3}$/).test(s.currency)||!Number.isInteger(s.decimals)||s.decimals<0||s.decimals>6||!amount(s.basis)||!amount(s.refundedBasis)||s.refundedBasis>s.basis||!statuses.has(s.status)||typeof s.refundUnallocated!=='boolean')throw new TypeError('Invalid order snapshot. Check the custom website setup guide.');
      // Stable field order allows the same persisted snapshot to be safely retried.
      return send({kind:'order',...Object.fromEntries(orderFields.map(field=>[field,s[field]]))},eventId);
    },
  });
}
