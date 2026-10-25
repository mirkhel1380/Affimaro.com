import {interiorPhotoMarkup} from '../lib/marketing-media.mjs';
import {AppError} from '../lib/service.ts';
import {cookieValue,clearAuthCookie,FLOW_COOKIE,SESSION_COOKIE,safeReturnTo,type AuthFlow,emailAuth} from './auth-core.ts';

import {portalHome,portalName,businessPortal,type Portal} from '../lib/portal-policy.ts';
import {plansForRole} from '../lib/pricing-catalog.mjs';
const portalCopy={brand:['FOR BRANDS','Your program.<br><em>Your direction.</em>','Your program, partner approvals, website connection and commissions.'],affiliate:['FOR AFFILIATE PARTNERS','Your reach.<br><em>Your partnerships.</em>','Your publishing profile, program applications, referral links and earnings.'],creator:['FOR CREATORS & INFLUENCERS','Your content.<br><em>Relevant partners.</em>','Plan your content, present your channels and follow your own partnerships and commission.'],agency:['FOR AGENCIES','Your clients.<br><em>A clearer workflow.</em>','Your client directory, represented program, partner reviews and reporting.']};
type Auth=ReturnType<typeof emailAuth>;
const authPath=(kind:string,portal?:Portal,ownerOnly=false)=>'/auth/'+(ownerOnly?'owner/':portal?portal+'/':'')+kind;
const escape=(value:string)=>value.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
const commonHeaders={
  // HTML POST navigation needs its real Origin for CSRF validation. Keep
  // referrers on this domain; no-referrer would turn that Origin into null.
  'Cache-Control':'private, no-store','Vary':'Cookie','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security':'max-age=31536000',
};
const style=`:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f8f2;color:#183e31;font:16px/1.6 system-ui,sans-serif}a{color:inherit;text-underline-offset:4px}.wrap{min-height:100svh;display:grid;grid-template-columns:1fr 1fr;max-width:1280px;margin:auto;padding:56px;gap:80px;align-items:center}.brand{display:inline-flex;align-items:center;gap:9px;color:#153b32;font-weight:650;font-size:29px;text-decoration:none;letter-spacing:-1.2px}.brand-period{color:#709554}.mark svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}.mark{display:inline-grid;place-items:center;background:#d5ec98;color:#153b32;border-radius:12px;width:40px;height:40px;margin-right:0}.tag{color:#597848;font-size:11px;letter-spacing:2px;font-weight:700;margin:50px 0 12px}h1{font-size:clamp(36px,5vw,64px);line-height:1.08;letter-spacing:-2px;margin:0 0 24px}h1 em{font-family:Georgia,serif;font-weight:400}.intro{max-width:400px;color:#516259}.card{background:white;border:1px solid #dde4d8;border-radius:24px;padding:36px;box-shadow:0 18px 70px #173b2d09}h2{font-size:28px;letter-spacing:-1px;margin:0 0 8px}p{margin:0 0 22px}.muted{color:#637067;font-size:14px}label{display:block;font-weight:650;font-size:13px;margin:20px 0 7px}input{display:block;width:100%;padding:13px 14px;border:1px solid #cdd6c9;border-radius:9px;font:inherit;background:#fff;color:#183e31}input:-webkit-autofill{-webkit-box-shadow:0 0 0 1000px #f1f6e7 inset;-webkit-text-fill-color:#183e31;caret-color:#183e31}input:focus{outline:3px solid #d5f77b;border-color:#466940}button{cursor:pointer;width:100%;margin:24px 0 14px;padding:14px;border:0;border-radius:9px;background:#193e30;color:white;font:650 15px system-ui}button:hover{background:#2b5540}.secondary{background:#eef2e9;color:#183e31;margin-top:4px}.links{display:flex;justify-content:space-between;gap:16px;font-size:13px}.error{padding:13px 16px;border-radius:10px;background:#fff0e8;color:#813f24;font-size:14px}.foot{margin:30px 0 0;font-size:12px;color:#637067}.email{overflow-wrap:anywhere;font-weight:650}.code{font-size:24px;letter-spacing:3px;text-align:center}.password-field{position:relative}.password-field input{padding-right:53px}.password-toggle{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:42px;height:42px;padding:9px;margin:0;background:transparent;color:#4c6851;border-radius:7px}.password-toggle[hidden]{display:none}.password-toggle:hover{background:#edf3e3;color:#193e30}.password-toggle:focus-visible{outline:3px solid #b4d78b;outline-offset:1px}.password-toggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.eye-slash{display:none}.password-toggle[aria-pressed=true] .eye-slash{display:block}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.selected-plan{padding:14px;border:1px solid #d0ddbd;background:#f1f7e7;border-radius:9px;font-size:13px}@media(max-width:760px){.wrap{grid-template-columns:1fr;padding:25px 18px;gap:25px}.tag{margin-top:28px}h1{font-size:42px}.intro{display:none}.card{padding:26px}.foot{margin:20px 0}}html[data-affimaro-theme=dark]{color-scheme:dark}html[data-affimaro-theme=dark] body{background:#121714;color:#e4eee0}html[data-affimaro-theme=dark] .card{background:#1c251f;border-color:#364235}html[data-affimaro-theme=dark] .brand{color:#e4eee0}html[data-affimaro-theme=dark] .mark{color:#153b32}html[data-affimaro-theme=dark] :is(.intro,.muted,.foot,.tag){color:#b3c8a5}html[data-affimaro-theme=dark] input{background:#131c17;color:#e4eee0;border-color:#4d6143}html[data-affimaro-theme=dark] button:not(.password-toggle){background:#d5ec98;color:#183b2b}html[data-affimaro-theme=dark] .password-toggle{color:#c0d5b1}html[data-affimaro-theme=dark] .password-toggle:hover{background:#30402a}html[data-affimaro-theme=dark] .selected-plan{background:#293923;color:#dfedce;border-color:#50683d}html[data-affimaro-theme=dark] .error{background:#41251f;color:#ffd5c7}`;

const formStyle=`
.auth-social{margin:22px 0}.auth-social form{margin:0}.auth-social button.social-button{display:flex;gap:12px;align-items:center;justify-content:center;background:#fff;color:#193e30;border:1px solid #cdd6c9;margin:9px 0}.auth-social button:disabled{opacity:.5;cursor:not-allowed}.auth-social summary{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;font-size:14px}.auth-social details{margin-top:12px}.auth-divider{text-align:center;font-size:12px;color:#637067;margin:24px 0 0}html[data-affimaro-theme=dark] .auth-social button.social-button{background:#243123;color:#e4eee0;border-color:#4d6143}

.wrap{grid-template-columns:repeat(2,minmax(0,1fr))}.wrap>section{min-width:0}h1,h2{overflow-wrap:anywhere}
input,select{min-width:0;max-width:100%;min-height:48px;font-size:16px}select{display:block;width:100%;padding:13px 14px;border:1px solid #cdd6c9;border-radius:9px;font:inherit;background:#fff;color:#183e31}select:focus{outline:3px solid #d5f77b;border-color:#466940}
.password-field input{padding-right:58px}.password-toggle{width:44px;height:44px}.field-hint{display:block;margin:7px 0 0;color:#637067;font-size:12px;line-height:1.7}
.links{flex-wrap:wrap;align-items:center;gap:4px 16px}.links a,.card>a{display:inline-flex;align-items:center;min-width:44px;min-height:44px;max-width:100%}
html[data-affimaro-theme=dark] select{background:#131c17;color:#e4eee0;border-color:#4d6143}html[data-affimaro-theme=dark] .field-hint{color:#b3c8a5}
@media(max-width:900px){.wrap{grid-template-columns:minmax(0,1fr);padding:32px 24px;gap:25px}.wrap>section{width:100%;max-width:540px;margin-inline:auto}.intro{display:none}.tag{margin-top:22px}h1{font-size:clamp(34px,8vw,42px);margin-bottom:12px}}
@media(max-width:760px){.wrap{padding:25px 18px}}
@media(max-width:380px){.wrap{padding:22px 14px;gap:20px}.card{padding:24px 18px;border-radius:18px}h2{font-size:26px}.links{gap:4px 12px}}
`;

function page(title:string,content:string,status=200,cookies:string[]=[],portal?:Portal,ownerOnly=false){
  const headers=new Headers({...commonHeaders,'Content-Type':'text/html; charset=utf-8'});for(const cookie of cookies)headers.append('Set-Cookie',cookie);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Affimaro</title><link rel="icon" href="/demo/favicon.svg" type="image/svg+xml"><style>${style}${formStyle}.auth-photo{margin:28px 0 0;max-width:520px;border-radius:12px;overflow:hidden}.auth-photo img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover}@media(max-width:760px){.auth-photo{max-width:420px;margin:24px auto 0}.auth-photo img{max-height:190px}}</style><script src="/portal-theme.js"></script><script src="/auth-form.js" defer></script></head><body data-portal="${ownerOnly?'owner':portal||'account'}"><main class="wrap"><section><a class="brand" href="/" aria-label="Affimaro home"><span class="mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 22V13a8 8 0 0 1 16 0v9M8 17h16M16 17v8"/></svg></span><span>affimaro<span class="brand-period">.</span></span></a><p class="tag">${ownerOnly?'FOR THE PLATFORM OWNER':portal?portalCopy[portal][0]:'YOUR AFFIMARO ACCOUNT'}</p><h1>${ownerOnly?'Your platform.<br><em>The complete view.</em>':portal?portalCopy[portal][1]:'Good partners.<br><em>Shared growth.</em>'}</h1><p class="intro">${ownerOnly?'Review every account type and oversee your entire Affimaro service.':portal?portalCopy[portal][2]:'A clear home for your account and partnerships.'}</p>${interiorPhotoMarkup('/auth/'+(ownerOnly?'owner':portal||'account')+'/login').replace('m-interior-photo','auth-photo')}</section><section class="card" aria-label="${escape(title)}">${content}</section></main></body></html>`,{status,headers});
}
function redirect(path:string,cookies:string[]=[]){const headers=new Headers({...commonHeaders,Location:path});for(const cookie of cookies)headers.append('Set-Cookie',cookie);return new Response(null,{status:303,headers});}
const hidden=(flow:AuthFlow)=>`<input type="hidden" name="nonce" value="${flow.nonce}">`;
const input=(name:string,label:string,type:string,autocomplete:string,extra='')=>{
  const field=`<input id="${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}>`;
  return `<label for="${name}">${label}</label>`+(type==='password'?`<div class="password-field">${field}<button type="button" class="password-toggle" data-password-toggle aria-controls="${name}" aria-label="Show password" aria-pressed="false" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg></button><span class="sr-only" data-password-status aria-live="polite"></span></div>`:field);
};
function form(flow:AuthFlow,error?:string,options?:{google:boolean;apple:boolean;sso:boolean},factors?:{id:string;type:string;name:string;phone:string|null}[]){
  const link=(kind:string,portal=flow.portal)=>authPath(kind,portal,flow.ownerOnly)+'?return_to='+encodeURIComponent(flow.returnTo)+(flow.plan&&portal&&businessPortal(portal)?'&plan='+flow.plan:''),alert=error?'<p class="error" role="alert">'+escape(error)+'</p>':'';
  const purpose=flow.purpose;
  if(purpose==='oauth')return '<h2>Continue signing in</h2>'+alert+'<a href="'+link('login')+'">Start sign-in again</a>';
  if(purpose==='mfa')return '<h2>Verify your sign-in.</h2><p class="muted">Use a second method already verified on your account.</p>'+alert+(flow.challengeId?'<form method="post" action="'+authPath('mfa',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+input('code','Six-digit verification code','text','one-time-code','class="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"')+'<button>Verify sign-in</button></form><a href="'+authPath('mfa',flow.portal,flow.ownerOnly)+'?choose_method=1">Choose another method</a>':(factors||[]).map(f=>'<form method="post" action="'+authPath('mfa',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+'<input type="hidden" name="factorId" value="'+f.id+'"><button>'+escape(f.type==='phone'?'Send a code to '+f.phone:'Use authenticator app')+'</button></form>').join(''))+'<a href="'+link('logout')+'">Sign out</a>';
  if(purpose==='complete'){const business=flow.portal&&businessPortal(flow.portal);return '<h2>Complete your account.</h2><p class="muted">Your email is verified. Add the details for your own portal, then complete your full application for owner review.</p>'+alert+'<form method="post" action="'+authPath('complete',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+input('name','Your name','text','name','minlength="2" maxlength="60"')+(business?input('businessName',flow.portal==='agency'?'Represented brand name':'Business name','text','organization','minlength="2" maxlength="60"'):'<label for="channel">Your main channel</label><select id="channel" name="channel" required>'+['Content creator','Newsletter','Community','Blog','Other'].map(v=>'<option>'+v+'</option>').join('')+'</select>')+'<button>Continue to application</button></form>';}
  if(purpose.startsWith('verify-'))return '<h2>Check your email</h2><p class="muted">If this address can receive a code, we have sent one to <span class="email">'+escape(flow.email||'your email')+'</span>. Enter the verification code below.</p>'+alert+'<form method="post" action="'+authPath('verify',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+input('code','Verification code','text','one-time-code','class="code" inputmode="numeric" pattern="[0-9]{6,10}" minlength="6" maxlength="10"')+'<button type="submit">Verify email</button></form><form method="post" action="'+authPath('resend',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+'<button class="secondary" type="submit">Send another code</button></form><a href="'+link('login')+'">Back to sign in</a>';
  const label=flow.ownerOnly?'owner':flow.portal?portalName(flow.portal).toLowerCase():'Affimaro';
  const titles:Record<string,[string,string,string]>={
    login:['Sign in to your '+label+' account.','Continue to your dedicated '+(flow.ownerOnly?'owner control panel.':flow.portal?portalName(flow.portal).toLowerCase()+' portal.':'account.'),'Sign in'],
    signup:['Create your '+label+' account.','Verify your email, then complete your profile for owner review. All four account types need owner approval before portal access.','Create account'],
    recover:['Forgot your password?','We will email you a code to set a new password.','Send recovery code'],
    reset:['Choose a new password.','Use at least 12 characters. You will sign in again after saving.','Save new password'],
    logout:['Sign out?','Your saved work will be here when you return.','Sign out'],
  };
  const title=titles[purpose]||titles.login;
  let fields='';
  if(purpose==='signup'){
    fields+=input('name','Your name','text','name','minlength="2" maxlength="60"');
    if(flow.portal&&businessPortal(flow.portal))fields+=input('businessName',flow.portal==='agency'?'Represented brand name':'Business name','text','organization','minlength="2" maxlength="60"');
    if(flow.portal&&!businessPortal(flow.portal))fields+='<label for="channel">Your main channel</label><select id="channel" name="channel" required>'+['Content creator','Newsletter','Community','Blog','Other'].map(value=>'<option>'+value+'</option>').join('')+'</select>';
  }
  if(['login','signup','recover'].includes(purpose))fields+=input('email','Email address','email','username','maxlength="254"');
  if(['login','signup','reset'].includes(purpose)){
    const newPassword=purpose!=='login';
    fields+=input('password',purpose==='reset'?'New password':'Password','password',newPassword?'new-password':'current-password','minlength="'+(newPassword?12:1)+'" maxlength="128"'+(newPassword?' aria-describedby="password-hint"':''));
    if(newPassword)fields+='<small class="field-hint" id="password-hint">Use at least 12 characters. A unique password helps protect your account.</small>';
  }
  const links=purpose==='login'?(flow.ownerOnly?'':'<a href="'+link('signup')+'">Create an account</a>')+'<a href="'+link('recover')+'">Forgot password?</a>':purpose==='logout'?'<a href="'+escape(flow.returnTo)+'">Keep working</a>':'<a href="'+link('login')+'">Back to sign in</a>';
  const separate=purpose==='login'&&!flow.ownerOnly?'<p class="foot">Your account has its own portal. <a href="/login?return_to='+encodeURIComponent(flow.returnTo)+'">Choose a different account type</a>.</p>':'';
  const selected=flow.plan&&flow.portal&&businessPortal(flow.portal)&&['login','signup'].includes(purpose)?'<p class="selected-plan"><strong>'+portalName(flow.portal)+' '+plansForRole(flow.portal)[flow.plan].name+' · $'+plansForRole(flow.portal)[flow.plan].amount+' USD / month</strong><br>Selected package · Account review comes first. Registration does not charge a card.</p>':'';
  const free=flow.portal&&!businessPortal(flow.portal)&&['signup','login'].includes(purpose)?'<p class="selected-plan" data-account-price="free"><strong>Free '+portalName(flow.portal).toLowerCase()+' account</strong><br>No subscription or card required. Email verification and owner review still apply.</p>':'';

  const social=['login','signup'].includes(purpose)?socialOptions(flow,options):'';
  return '<h2>'+title[0]+'</h2><p class="muted">'+title[1]+'</p>'+selected+free+alert+social+'<form method="post" action="'+authPath(purpose,flow.portal,flow.ownerOnly)+'">'+hidden(flow)+fields+'<button type="submit">'+title[2]+'</button></form><div class="links">'+links+'</div>'+separate;
}
function socialOptions(flow:AuthFlow,available?:{google:boolean;apple:boolean;sso:boolean}){
 const disabled=(kind:'google'|'apple'|'sso')=>available?.[kind]?'':' disabled';
 return '<div class="auth-social">'+(['google','apple'] as const).map(kind=>'<form method="post" action="'+authPath('social',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+'<input type="hidden" name="provider" value="'+kind+'"><button class="social-button" type="submit"'+disabled(kind)+'><img src="/auth-icons/'+kind+'.svg" width="20" height="20" alt="">Continue with '+(kind==='google'?'Google':'Apple')+'</button></form>').join('')+'<details><summary><img src="/auth-icons/sso.svg" width="20" height="20" alt="">Single sign-on (SSO)</summary><form method="post" action="'+authPath('social',flow.portal,flow.ownerOnly)+'">'+hidden(flow)+'<input type="hidden" name="provider" value="sso">'+input('domain','Organization domain','text','organization','placeholder="company.com" maxlength="253"')+'<button'+disabled('sso')+'>Continue with SSO</button></form></details>'+(!available?.google||!available.apple||!available.sso?'<small class="field-hint">Unavailable options need the site owner’s provider setup. You can continue with email.</small>':'')+'<p class="auth-divider">Or use your email</p></div>';
}
async function readForm(request:Request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')throw new AppError(415,'Submit the form from this page.');
  if(Number(request.headers.get('content-length'))>8192)throw new AppError(413,'The form is too large.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'The form is empty.');let size=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();throw new AppError(413,'The form is too large.');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let params:URLSearchParams;try{params=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError(400,'The form could not be read.');}
  const values:Record<string,string>={};for(const [key,value] of params){if(Object.hasOwn(values,key)||!['nonce','email','password','name','code','businessName','channel','provider','domain','factorId'].includes(key))throw new AppError(400,'The form contains an unexpected field.');values[key]=value;}return values;
}
export function isAuthPath(path:string){return path.startsWith('/auth/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(path);}
export async function authPage(request:Request,auth:Auth,origin:string):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,matched=path.match(/^\/auth\/(brand|affiliate|creator|agency|owner)\/([a-z-]+)$/),ownerOnly=matched?.[1]==='owner',portal=(ownerOnly?undefined:matched?.[1]) as Portal|undefined,kind=matched?.[2]||path.slice('/auth/'.length);let flow:AuthFlow|null=null;
  try{
    if(ownerOnly&&kind==='signup')throw new AppError(404,'Owner accounts cannot be registered publicly.');
    if(url.origin!==origin)throw new AppError(403,'Open this form on the application domain.');
    async function finish(result:{cookie:string;needsMfa:boolean;needsProfile:boolean},context:AuthFlow){
      if(result.needsMfa){const next=await auth.newFlow('mfa',context.returnTo,undefined,context.portal,undefined,context.plan,context.ownerOnly);return redirect(authPath('mfa',context.portal,context.ownerOnly),[result.cookie,next.cookie]);}
      if(result.needsProfile&&context.portal&&!context.ownerOnly){const next=await auth.newFlow('complete',context.returnTo,undefined,context.portal,undefined,context.plan);return redirect(authPath('complete',context.portal),[result.cookie,next.cookie]);}
      return redirect(context.returnTo,[result.cookie,clearAuthCookie(FLOW_COOKIE)]);
    }
    async function securityContext(){const state=await auth.securitySnapshot(request);if(ownerOnly&&!state.owner||portal&&state.portal&&portal!==state.portal)throw new AppError(403,'Use your own sign-in page.');return state;}
    if(request.method==='GET'&&kind==='callback'){
      flow=await auth.flow(request);if(!flow||flow.purpose!=='oauth'||flow.portal!==portal||Boolean(flow.ownerOnly)!==ownerOnly)throw new AppError(403,'Start provider sign-in again.');
      if(url.searchParams.has('error'))throw new AppError(400,'Provider sign-in was cancelled. You can try again.');
      if(url.searchParams.getAll('code').length!==1)throw new AppError(400,'Start provider sign-in again.');
      const result=await auth.finishSocial(flow,{code:url.searchParams.get('code')},request.headers.get('CF-Connecting-IP')||'unknown',cookieValue(request,SESSION_COOKIE));return finish(result,flow);
    }
    if(request.method==='GET'&&['mfa','complete'].includes(kind)){
      const state=await securityContext(),saved=await auth.flow(request);if(!portal&&!ownerOnly&&saved?.portal&&saved.purpose===kind)return redirect(authPath(kind,saved.portal));if(kind==='complete'&&state.requiresMfa)return redirect(authPath('mfa',portal,ownerOnly));
      if(kind==='mfa'&&!state.factors.some(f=>f.status==='verified'))return redirect(saved?.returnTo|| (ownerOnly?'/owner':portal?portalHome(portal):'/account'));
      const target=saved?.returnTo||safeReturnTo(url.searchParams.get('return_to'));
      const ownTarget=ownerOnly&&!/^\/owner(\/|[?#]|$)/.test(target)?'/owner':target;
      if(saved?.purpose===kind&&saved.portal===portal&&Boolean(saved.ownerOnly)===ownerOnly&&!url.searchParams.has('choose_method'))flow=saved;
      else {const next=await auth.newFlow(kind,ownTarget,undefined,portal,undefined,saved?.plan,ownerOnly);flow=next.flow;return page('Account security',form(flow,undefined,undefined,state.factors.filter(f=>f.status==='verified')),200,[next.cookie],portal,ownerOnly);}
      return page('Account security',form(flow,undefined,undefined,state.factors.filter(f=>f.status==='verified')),200,[],portal,ownerOnly);
    }
    if(request.method==='GET'){
      if(path==='/signin-with-chatgpt'||path==='/callback')return redirect('/auth/login?return_to='+encodeURIComponent(safeReturnTo(url.searchParams.get('return_to'))));
      if(path==='/signout-with-chatgpt')return redirect('/auth/logout?return_to='+encodeURIComponent(safeReturnTo(url.searchParams.get('return_to'))));
      if(kind==='verify'){
        flow=await auth.flow(request);if(!flow?.purpose.startsWith('verify-'))throw new AppError(400,'Start email verification again.');
        if(!ownerOnly&&flow.ownerOnly)return redirect(authPath('verify',undefined,true));
        if(!portal&&flow.portal)return redirect(authPath('verify',flow.portal,flow.ownerOnly));
        if(flow.portal!==portal||Boolean(flow.ownerOnly)!==ownerOnly)throw new AppError(403,'Open verification from your own portal.');
        return page('Verify your email',form(flow),200,[],flow.portal,flow.ownerOnly);
      }
      if(!['login','signup','recover','reset','logout'].includes(kind))throw new AppError(404,'This sign-in page could not be found.');
      let resetContext:AuthFlow|null=null;
      if(kind==='reset'){
        if(!await auth.canReset(request,ownerOnly))throw new AppError(403,'Verify a password-recovery code first.');
        const saved=await auth.flow(request);
        if(saved?.purpose==='reset'){
          if(!ownerOnly&&saved.ownerOnly)return redirect(authPath('reset',undefined,true));
          if(!portal&&saved.portal)return redirect(authPath('reset',saved.portal,saved.ownerOnly));
          if(saved.portal!==portal||Boolean(saved.ownerOnly)!==ownerOnly)throw new AppError(403,'Open password reset from your own recovery page.');
          resetContext=saved;
        }
      }
      const requestedReturn=resetContext?.returnTo??(url.searchParams.has('return_to')?safeReturnTo(url.searchParams.get('return_to')):ownerOnly?'/owner':portal?portalHome(portal):'/account');
      const returnTo=ownerOnly&&!/^\/owner(\/|[?#]|$)/.test(requestedReturn)?'/owner':requestedReturn;
      const plan=resetContext?resetContext.plan:portal&&businessPortal(portal)&&['starter','growth','business'].includes(url.searchParams.get('plan')||'')?url.searchParams.get('plan') as 'starter'|'growth'|'business':undefined;
      const next=await auth.newFlow(kind,returnTo,undefined,portal,undefined,plan,ownerOnly);flow=next.flow;
      return page(kind==='login'?'Sign in':'Your account',form(flow,kind==='login'&&url.searchParams.get('password_changed')==='1'?'Password saved. Sign in with your new password.':undefined,['login','signup'].includes(kind)?await auth.options().catch(()=>undefined):undefined),200,[next.cookie],portal,ownerOnly);
    }
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...commonHeaders,Allow:'GET, POST'}});
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Open the form on this site and try again.');
    const values=await readForm(request);flow=await auth.flow(request);
    if(!flow||values.nonce!==flow.nonce)throw new AppError(403,'This form expired. Open it again to continue.');
    if(flow.portal!==portal||Boolean(flow.ownerOnly)!==ownerOnly)throw new AppError(403,'Submit this form from your own portal.');
    const ip=request.headers.get('CF-Connecting-IP')||'unknown',previous=cookieValue(request,SESSION_COOKIE);
    if(kind==='social'){const {nonce:_,...input}=values;const next=await auth.beginSocial(flow,input,ip),cookie=await auth.saveFlow(next.flow);return page('Continue signing in','<h2>Continue with your provider.</h2><p class="muted">Your secure sign-in page is ready.</p><a data-auth-redirect href="'+escape(next.url)+'">Continue to sign in</a>',200,[cookie],portal,ownerOnly);}
    if(kind==='mfa'){
      if(flow.purpose!=='mfa')throw new AppError(403,'Start verification again.');const state=await securityContext();const {nonce:_,...input}=values;
      if(!flow.challengeId){if(Object.keys(input).length!==1||!state.factors.some(f=>f.id===input.factorId&&f.status==='verified'))throw new AppError(400,'Choose your verified method.');const result=await auth.securityAction(request,{action:'challenge',factorId:input.factorId});const next={...flow,nonce:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),factorId:input.factorId,challengeId:result.challengeId!};return redirect(authPath('mfa',portal,ownerOnly),[await auth.saveFlow(next)]);}
      if(Object.keys(input).length!==1||!input.code)throw new AppError(400,'Enter your verification code.');await auth.securityAction(request,{action:'verify',factorId:flow.factorId,challengeId:flow.challengeId,code:input.code});const checked=await securityContext();if(!checked.portal&&portal&&!ownerOnly){const next=await auth.newFlow('complete',flow.returnTo,undefined,portal,undefined,flow.plan);return redirect(authPath('complete',portal),[next.cookie]);}return redirect(flow.returnTo,[clearAuthCookie(FLOW_COOKIE)]);
    }
    if(kind==='complete'){const {nonce:_,...input}=values;await auth.completeSocial(request,flow,input);return redirect(flow.returnTo,[clearAuthCookie(FLOW_COOKIE)]);}
    if(!['login','signup','recover','reset','logout','verify','resend'].includes(kind)||((kind==='verify'||kind==='resend')?!flow.purpose.startsWith('verify-'):flow.purpose!==kind))throw new AppError(403,'Start this form again.');
    const {nonce:_,...input}=values;
    if(kind==='login'){const result=await auth.login(input,ip,previous,flow.portal,flow.ownerOnly);return finish(result,flow);}
    if(kind==='signup'){const result=await auth.signup(input,ip,flow.portal),next=await auth.newFlow('verify-signup',flow.returnTo,result.email,flow.portal,result.onboarding?{...result.onboarding,...(flow.plan?{plan:flow.plan}:{})}:undefined,flow.plan);return redirect(authPath('verify',flow.portal,flow.ownerOnly),[next.cookie]);}
    if(kind==='recover'){const result=await auth.recover(input,ip),next=await auth.newFlow('verify-recovery',flow.returnTo,result.email,flow.portal,undefined,flow.plan,flow.ownerOnly);return redirect(authPath('verify',flow.portal,flow.ownerOnly),[next.cookie]);}
    if(kind==='verify'){
      const result=await auth.verify(flow,input,ip,previous);
      if(flow.purpose==='verify-recovery'){
        const next=await auth.newFlow('reset',flow.returnTo,undefined,flow.portal,undefined,flow.plan,flow.ownerOnly);
        return redirect(authPath('reset',flow.portal,flow.ownerOnly),[result.cookie,next.cookie]);
      }
      return finish(result,flow);
    }
    if(kind==='resend'){if(Object.keys(input).length)throw new AppError(400,'Submit the verification form again.');await auth.resend(flow,ip);return redirect(authPath('verify',flow.portal,flow.ownerOnly));}
    if(kind==='reset'){const cookie=await auth.reset(request,input,flow.ownerOnly),query=new URLSearchParams({password_changed:'1',return_to:flow.returnTo,...(flow.plan&&flow.portal&&businessPortal(flow.portal)?{plan:flow.plan}:{})});return redirect(authPath('login',flow.portal,flow.ownerOnly)+'?'+query,[cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(Object.keys(input).length)throw new AppError(400,'Submit the sign-out form again.');
    return redirect(flow.returnTo,[await auth.logout(request),clearAuthCookie(FLOW_COOKIE)]);
  }catch(error){
    const known=error instanceof AppError,message=known?error.message:'We could not complete sign-in. Please try again.';
    return page('Your account',flow?form(flow,message):'<h2>Let’s try that again.</h2><p class="error" role="alert">'+escape(message)+'</p><a href="'+authPath('login',portal,ownerOnly)+'">Open sign in</a>',known?error.status:503,[],flow?.portal||portal,ownerOnly);
  }
}
