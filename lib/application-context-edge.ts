import {isIP} from 'node:net';
export {applicationContextHeader} from './application-context-catalog.ts';
const clean=(value:unknown,max=100)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max)||null:null;
export function edgeApplicationNetwork(request:Request){
 const cf=(request as Request&{cf?:Record<string,unknown>}).cf,ip=request.headers.get('cf-connecting-ip')||'',country=clean(cf?.country,2),asn=cf?.asn;
 return {ip:isIP(ip)?ip:null,country:country&&/^[A-Z]{2}$/.test(country)&&country!=='XX'?country:null,region:clean(cf?.region),city:clean(cf?.city),asn:typeof asn==='number'&&Number.isSafeInteger(asn)&&asn>0?asn:null,organization:clean(cf?.asOrganization,150),httpProtocol:clean(cf?.httpProtocol,30),tlsVersion:clean(cf?.tlsVersion,30),source:(isIP(ip)||cf?'cloudflare':'unavailable') as 'cloudflare'|'unavailable'};
}
