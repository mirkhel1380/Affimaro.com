import {AppError} from '../lib/service.ts';
import {cookieValue,clearAuthCookie,FLOW_COOKIE,SESSION_COOKIE,safeReturnTo,type AuthFlow,emailAuth} from './auth-core.ts';

import {portalHome,type Portal} from '../lib/portal-policy.ts';
type Auth=ReturnType<typeof emailAuth>;
const authPath=(kind:string,portal?:Portal)=>'/auth/'+(portal?portal+'/':'')+kind;
const escape=(value:string)=>value.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
const commonHeaders={
  // HTML POST navigation needs its real Origin for CSRF validation. Keep
  // referrers on this domain; no-referrer would turn that Origin into null.
  'Cache-Control':'private, no-store','Vary':'Cookie','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security':'max-age=31536000',
};
const style=`:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f8f2;color:#183e31;font:16px/1.6 system-ui,sans-serif}a{color:inherit;text-underline-offset:4px}.wrap{min-height:100svh;display:grid;grid-template-columns:1fr 1fr;max-width:1280px;margin:auto;padding:56px;gap:80px;align-items:center}.brand{display:inline-flex;align-items:center;gap:9px;color:#153b32;font-weight:650;font-size:29px;text-decoration:none;letter-spacing:-1.2px}.brand-period{color:#709554}.mark svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.mark{display:inline-grid;place-items:center;background:#d5ec98;color:#153b32;border-radius:12px;width:40px;height:40px;margin-right:0}.tag{color:#597848;font-size:11px;letter-spacing:2px;font-weight:700;margin:50px 0 12px}h1{font-size:clamp(36px,5vw,64px);line-height:1.08;letter-spacing:-2px;margin:0 0 24px}h1 em{font-family:Georgia,serif;font-weight:400}.intro{max-width:400px;color:#516259}.card{background:white;border:1px solid #dde4d8;border-radius:24px;padding:36px;box-shadow:0 18px 70px #173b2d09}h2{font-size:28px;letter-spacing:-1px;margin:0 0 8px}p{margin:0 0 22px}.muted{color:#637067;font-size:14px}label{display:block;font-weight:650;font-size:13px;margin:20px 0 7px}input{display:block;width:100%;padding:13px 14px;border:1px solid #cdd6c9;border-radius:9px;font:inherit;background:#fff;color:#183e31}input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px #f1f6e7 inset;-webkit-text-fill-color:#183e31;caret-color:#183e31}input:focus{outline:3px solid #d5f77b;border-color:#466940}button{cursor:pointer;width:100%;margin:24px 0 14px;padding:14px;border:0;border-radius:9px;background:#193e30;color:white;font:650 15px system-ui}button:hover{background:#2b5540}.secondary{background:#eef2e9;color:#183e31;margin-top:4px}.links{display:flex;justify-content:space-between;gap:16px;font-size:13px}.error{padding:13px 16px;border-radius:10px;background:#fff0e8;color:#813f24;font-size:14px}.foot{margin:30px 0 0;font-size:12px;color:#637067}.email{overflow-wrap:anywhere;font-weight:650}.code{font-size:24px;letter-spacing:3px;text-align:center}.password-field{position:relative}.password-field input{padding-right:53px}.password-toggle{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:42px;height:42px;padding:9px;margin:0;background:transparent;color:#4c6851;border-radius:7px}.password-toggle[hidden]{display:none}.password-toggle:hover{background:#edf3e3;color:#193e30}.password-toggle:focus-visible{outline:3px solid #b4d78b;outline-offset:1px}.password-toggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.eye-slash{display:none}.password-toggle[aria-pressed=true] .eye-slash{display:block}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:760px){.wrap{grid-template-columns:1fr;padding:25px 18px;gap:25px}.tag{margin-top:28px}h1{font-size:42px}.intro{display:none}.card{padding:26px}.foot{margin:20px 0}}`;

function page(title:string,content:string,status=200,cookies:string[]=[],portal?:Portal){
  const headers=new Headers({...commonHeaders,'Content-Type':'text/html; charset=utf-8'});for(const cookie of cookies)headers.append('Set-Cookie',cookie);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Affimaro</title><link rel="icon" href="/demo/favicon.svg" type="image/svg+xml"><style>${style}</style><script src="/auth-form.js" defer></script></head><body data-portal="${portal||'account'}"><main class="wrap"><section><a class="brand" href="/" aria-label="Affimaro home"><span class="mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 22V13a8 8 0 0 1 16 0v9M8 17h16M16 17v8"/></svg></span><span>affimaro<span class="brand-period">.</span></span></a><p class="tag">${portal==='brand'?'FOR BRANDS':portal==='affiliate'?'FOR AFFILIATES':'YOUR AFFIMARO ACCOUNT'}</p><h1>${portal==='brand'?'Your program.<br><em>Your direction.</em>':portal==='affiliate'?'Your audience.<br><em>New possibilities.</em>':'Good partners.<br><em>Shared growth.</em>'}</h1><p class="intro">${portal==='brand'?'A dedicated workspace for your brand, partners, program rules and commission approvals.':portal==='affiliate'?'Your own portal for approved partnerships, referral links, earnings and payment requests.':'A clear home for your account and partnerships.'}</p></section><section class="card" aria-label="${escape(title)}">${content}</section></main></body></html>`,{status,headers});
}
function redirect(path:string,cookies:string[]=[]){const headers=new Headers({...commonHeaders,Location:path});for(const cookie of cookies)headers.append('Set-Cookie',cookie);return new Response(null,{status:303,headers});}
const hidden=(flow:AuthFlow)=>`<input type="hidden" name="nonce" value="${flow.nonce}">`;
const input=(name:string,label:string,type:string,autocomplete:string,extra='')=>{
  const field=`<input id="${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}>`;
  return `<label for="${name}">${label}</label>`+(type==='password'?`<div class="password-field">${field}<button type="button" class="password-toggle" data-password-toggle aria-controls="${name}" aria-label="Show password" aria-pressed="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg></button><span class="sr-only" data-password-status aria-live="polite"></span></div>`:field);
};
function form(flow:AuthFlow,error?:string){
  const link=(kind:string,portal=flow.portal)=>authPath(kind,portal)+'?return_to='+encodeURIComponent(flow.returnTo),alert=error?'<p class="error" role="alert">'+escape(error)+'</p>':'';
  const purpose=flow.purpose;
  if(purpose.startsWith('verify-'))return '<h2>Check your email</h2><p class="muted">If this address can receive a code, we have sent one to <span class="email">'+escape(flow.email||'your email')+'</span>. Enter the verification code below.</p>'+alert+'<form method="post" action="'+authPath('verify',flow.portal)+'">'+hidden(flow)+input('code','Verification code','text','one-time-code','class="code" inputmode="numeric" pattern="[0-9]{6,10}" minlength="6" maxlength="10"')+'<button type="submit">Verify email</button></form><form method="post" action="'+authPath('resend',flow.portal)+'">'+hidden(flow)+'<button class="secondary" type="submit">Send another code</button></form><a href="'+link('login')+'">Back to sign in</a>';
  const label=flow.portal==='brand'?'brand':flow.portal==='affiliate'?'affiliate':'Affimaro';
  const titles:Record<string,[string,string,string]>={
    login:['Sign in to your '+label+' account.','Continue to your dedicated '+(flow.portal==='brand'?'brand workspace.':flow.portal==='affiliate'?'affiliate portal.':'account.'),'Sign in'],
    signup:['Create your '+label+' account.','Verify your email, then complete your profile for owner review. Both brand and affiliate accounts need approval before portal access.','Create account'],
    recover:['Forgot your password?','We will email you a code to set a new password.','Send recovery code'],
    reset:['Choose a new password.','Use at least 12 characters. You will sign in again after saving.','Save new password'],
    logout:['Sign out?','Your saved work will be here when you return.','Sign out'],
  };
  const title=titles[purpose]||titles.login;
  let fields='';
  if(purpose==='signup'){
    fields+=input('name','Your name','text','name','minlength="2" maxlength="60"');
    if(flow.portal==='brand')fields+=input('businessName','Business name','text','organization','minlength="2" maxlength="60"');
    if(flow.portal==='affiliate')fields+='<label for="channel">Your main channel</label><select id="channel" name="channel" required style="width:100%;padding:13px;border:1px solid #cdd6c9;border-radius:9px;font:inherit">'+['Content creator','Newsletter','Community','Blog','Other'].map(value=>'<option>'+value+'</option>').join('')+'</select>';
  }
  if(['login','signup','recover'].includes(purpose))fields+=input('email','Email address','email','username','maxlength="254"');
  if(['login','signup','reset'].includes(purpose))fields+=input('password',purpose==='reset'?'New password':'Password','password',purpose==='login'?'current-password':'new-password','minlength="'+(purpose==='login'?1:12)+'" maxlength="128"');
  const links=purpose==='login'?'<a href="'+link('signup')+'">Create an account</a><a href="'+link('recover')+'">Forgot password?</a>':purpose==='logout'?'<a href="'+escape(flow.returnTo)+'">Keep working</a>':'<a href="'+link('login')+'">Back to sign in</a>';
  const separate=purpose==='login'&&flow.portal?'<p class="foot">Looking for '+(flow.portal==='brand'?'affiliate':'brand')+' access? <a href="'+link('login',flow.portal==='brand'?'affiliate':'brand')+'">Open '+(flow.portal==='brand'?'affiliate':'brand')+' sign in</a>.</p>':'';
  return '<h2>'+title[0]+'</h2><p class="muted">'+title[1]+'</p>'+alert+'<form method="post" action="'+authPath(purpose,flow.portal)+'">'+hidden(flow)+fields+'<button type="submit">'+title[2]+'</button></form><div class="links">'+links+'</div>'+separate;
}
async function readForm(request:Request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')throw new AppError(415,'Submit the form from this page.');
  if(Number(request.headers.get('content-length'))>8192)throw new AppError(413,'The form is too large.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'The form is empty.');let size=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();throw new AppError(413,'The form is too large.');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let params:URLSearchParams;try{params=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError(400,'The form could not be read.');}
  const values:Record<string,string>={};for(const [key,value] of params){if(Object.hasOwn(values,key)||!['nonce','email','password','name','code','businessName','channel'].includes(key))throw new AppError(400,'The form contains an unexpected field.');values[key]=value;}return values;
}
export function isAuthPath(path:string){return path.startsWith('/auth/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(path);}
export async function authPage(request:Request,auth:Auth,origin:string):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,matched=path.match(/^\/auth\/(brand|affiliate)\/([a-z-]+)$/),portal=matched?.[1] as Portal|undefined,kind=matched?.[2]||path.slice('/auth/'.length);let flow:AuthFlow|null=null;
  try{
    if(url.origin!==origin)throw new AppError(403,'Open this form on the application domain.');
    if(request.method==='GET'){
      if(path==='/signin-with-chatgpt'||path==='/callback')return redirect('/auth/login?return_to='+encodeURIComponent(safeReturnTo(url.searchParams.get('return_to'))));
      if(path==='/signout-with-chatgpt')return redirect('/auth/logout?return_to='+encodeURIComponent(safeReturnTo(url.searchParams.get('return_to'))));
      if(kind==='verify'){
        flow=await auth.flow(request);if(!flow?.purpose.startsWith('verify-'))throw new AppError(400,'Start email verification again.');
        if(!portal&&flow.portal)return redirect(authPath('verify',flow.portal));
        if(flow.portal!==portal)throw new AppError(403,'Open verification from your own portal.');
        return page('Verify your email',form(flow),200,[],flow.portal);
      }
      if(!['login','signup','recover','reset','logout'].includes(kind))throw new AppError(404,'This sign-in page could not be found.');
      if(kind==='reset'&&!await auth.canReset(request))throw new AppError(403,'Verify a password-recovery code first.');
      const returnTo=url.searchParams.has('return_to')?safeReturnTo(url.searchParams.get('return_to')):portal?portalHome(portal):'/account';
      const next=await auth.newFlow(kind,returnTo,undefined,portal);flow=next.flow;
      return page(kind==='login'?'Sign in':'Your account',form(flow,kind==='login'&&url.searchParams.get('password_changed')==='1'?'Password saved. Sign in with your new password.':undefined),200,[next.cookie],portal);
    }
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...commonHeaders,Allow:'GET, POST'}});
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Open the form on this site and try again.');
    const values=await readForm(request);flow=await auth.flow(request);
    if(!flow||values.nonce!==flow.nonce)throw new AppError(403,'This form expired. Open it again to continue.');
    if(flow.portal!==portal)throw new AppError(403,'Submit this form from your own portal.');
    if(!['login','signup','recover','reset','logout','verify','resend'].includes(kind)||((kind==='verify'||kind==='resend')?!flow.purpose.startsWith('verify-'):flow.purpose!==kind))throw new AppError(403,'Start this form again.');
    const {nonce:_,...input}=values,ip=request.headers.get('CF-Connecting-IP')||'unknown',previous=cookieValue(request,SESSION_COOKIE);
    if(kind==='login'){const result=await auth.login(input,ip,previous,flow.portal);return redirect(flow.returnTo,[result.cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(kind==='signup'){const result=await auth.signup(input,ip,flow.portal),next=await auth.newFlow('verify-signup',flow.returnTo,result.email,flow.portal,result.onboarding);return redirect(authPath('verify',flow.portal),[next.cookie]);}
    if(kind==='recover'){const result=await auth.recover(input,ip),next=await auth.newFlow('verify-recovery',flow.returnTo,result.email,flow.portal);return redirect(authPath('verify',flow.portal),[next.cookie]);}
    if(kind==='verify'){const result=await auth.verify(flow,input,ip,previous);return redirect(flow.purpose==='verify-recovery'?authPath('reset',flow.portal):flow.returnTo,[result.cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(kind==='resend'){if(Object.keys(input).length)throw new AppError(400,'Submit the verification form again.');await auth.resend(flow,ip);return redirect(authPath('verify',flow.portal));}
    if(kind==='reset'){const cookie=await auth.reset(request,input);return redirect(authPath('login',flow.portal)+'?password_changed=1',[cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(Object.keys(input).length)throw new AppError(400,'Submit the sign-out form again.');
    return redirect(flow.returnTo,[await auth.logout(request),clearAuthCookie(FLOW_COOKIE)]);
  }catch(error){
    const known=error instanceof AppError,message=known?error.message:'We could not complete sign-in. Please try again.';
    return page('Your account',flow?form(flow,message):'<h2>Let’s try that again.</h2><p class="error" role="alert">'+escape(message)+'</p><a href="'+authPath('login',portal)+'">Open sign in</a>',known?error.status:503,[],flow?.portal||portal);
  }
}
