import sprite from '../content/icon-sprite.html?raw';
import {renderMarketingDocument} from './marketing-content.mjs';
import {marketingPage} from './landing';
import {emailSignIn} from './auth-mode';
import independentProject from '../self-hosted/cloudflare-project.json';
export function publicMarketingResponse(path:string,options:{plan?:string;returnTo?:string}={}){
  const html=renderMarketingDocument(path,sprite,options);
  if(!html)return new Response('Page not found.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  return new Response(marketingPage(html,emailSignIn,independentProject.origin),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
