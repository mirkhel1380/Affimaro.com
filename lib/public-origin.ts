import {AppError} from './service.ts';
export const SITES_ORIGIN='https://affimaro-preview.kindsky66.chatgpt.site';
export function trustedPublicOrigin(value?:string){
  if(!value)return SITES_ORIGIN;
  let url:URL;try{url=new URL(value);}catch{throw new AppError(503,'The application origin is not configured correctly.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)throw new AppError(503,'Use a complete HTTPS application origin without a path.');
  return url.origin;
}
