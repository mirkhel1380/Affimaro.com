import {AppError} from '../lib/service.ts';
import {cookieValue,clearAuthCookie,FLOW_COOKIE,SESSION_COOKIE,safeReturnTo,type AuthFlow,emailAuth} from './auth-core.ts';

type Auth=ReturnType<typeof emailAuth>;
const escape=(value:string)=>value.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
const commonHeaders={
  // HTML POST navigation needs its real Origin for CSRF validation. Keep
  // referrers on this domain; no-referrer would turn that Origin into null.
  'Cache-Control':'private, no-store','Vary':'Cookie','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security':'max-age=31536000',
};
const style=`*{box-sizing:border-box}body{margin:0;background:#f7f8f2;color:#183e31;font:16px/1.6 system-ui,sans-serif}a{color:inherit;text-underline-offset:4px}.wrap{min-height:100svh;display:grid;grid-template-columns:1fr 1fr;max-width:1280px;margin:auto;padding:56px;gap:80px;align-items:center}.brand{font-weight:800;font-size:29px;text-decoration:none;letter-spacing:-1px}.mark{display:inline-grid;place-items:center;background:#d5f77b;color:#173b2d;border-radius:12px;width:40px;height:40px;margin-right:8px}.tag{font-size:11px;letter-spacing:2px;font-weight:700;margin:50px 0 12px}h1{font-size:clamp(36px,5vw,64px);line-height:1.08;letter-spacing:-2px;margin:0 0 24px}h1 em{font-family:Georgia,serif;font-weight:400}.intro{max-width:400px;color:#516259}.card{background:white;border:1px solid #dde4d8;border-radius:24px;padding:36px;box-shadow:0 18px 70px #173b2d09}h2{font-size:28px;letter-spacing:-1px;margin:0 0 8px}p{margin:0 0 22px}.muted{color:#637067;font-size:14px}label{display:block;font-weight:650;font-size:13px;margin:20px 0 7px}input{display:block;width:100%;padding:13px 14px;border:1px solid #cdd6c9;border-radius:9px;font:inherit;background:#fff;color:#183e31}input:focus{outline:3px solid #d5f77b;border-color:#466940}button{cursor:pointer;width:100%;margin:24px 0 14px;padding:14px;border:0;border-radius:9px;background:#193e30;color:white;font:650 15px system-ui}button:hover{background:#2b5540}.secondary{background:#eef2e9;color:#183e31;margin-top:4px}.links{display:flex;justify-content:space-between;gap:16px;font-size:13px}.error{padding:13px 16px;border-radius:10px;background:#fff0e8;color:#813f24;font-size:14px}.foot{margin:30px 0 0;font-size:12px;color:#637067}.email{overflow-wrap:anywhere;font-weight:650}.code{font-size:24px;letter-spacing:3px;text-align:center}@media(max-width:760px){.wrap{grid-template-columns:1fr;padding:25px 18px;gap:25px}.tag{margin-top:28px}h1{font-size:42px}.intro{display:none}.card{padding:26px}.foot{margin:20px 0}}`;

function page(title:string,content:string,status=200,cookies:string[]=[]){
  const headers=new Headers({...commonHeaders,'Content-Type':'text/html; charset=utf-8'});for(const cookie of cookies)headers.append('Set-Cookie',cookie);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Affimaro</title><style>${style}</style></head><body><main class="wrap"><section><a class="brand" href="/"><span class="mark">a</span>affimaro</a><p class="tag">YOUR NEXT CHAPTER STARTS HERE</p><h1>Good partners.<br><em>Shared growth.</em></h1><p class="intro">A clear home for your affiliate program, commissions and partnerships.</p><p class="foot">A product of Highlink</p></section><section class="card" aria-label="${escape(title)}">${content}</section></main></body></html>`,{status,headers});
}
function redirect(path:string,cookies:string[]=[]){const headers=new Headers({...commonHeaders,Location:path});for(const cookie of cookies)headers.append('Set-Cookie',cookie);return new Response(null,{status:303,headers});}
const hidden=(flow:AuthFlow)=>`<input type="hidden" name="nonce" value="${flow.nonce}">`;
const input=(name:string,label:string,type:string,autocomplete:string,extra='')=>`<label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}>`;
function form(flow:AuthFlow,error?:string){
  const link=(path:string)=>path+'?return_to='+encodeURIComponent(flow.returnTo),alert=error?`<p class="error" role="alert">${escape(error)}</p>`:'';
  const purpose=flow.purpose;
  if(purpose.startsWith('verify-'))return `<h2>Check your email</h2><p class="muted">If this address can receive a code, we have sent one to <span class="email">${escape(flow.email||'your email')}</span>. Enter the verification code below.</p>${alert}<form method="post" action="/auth/verify">${hidden(flow)}${input('code','Verification code','text','one-time-code','class="code" inputmode="numeric" pattern="[0-9]{6,10}" minlength="6" maxlength="10"')}<button type="submit">Verify email</button></form><form method="post" action="/auth/resend">${hidden(flow)}<button class="secondary" type="submit">Send another code</button></form><a href="${link('/auth/login')}">Back to sign in</a>`;
  const titles:Record<string,[string,string,string]>={login:['Welcome back.','Sign in to your partner workspace.','Sign in'],signup:['Make it yours.','Create your account with a verified email address.','Create account'],recover:['Forgot your password?','We will email you a code to set a new password.','Send recovery code'],reset:['Choose a new password.','Use at least 12 characters. You will sign in again after saving.','Save new password'],logout:['Sign out?','Your saved work will be here when you return.','Sign out']};
  const title=titles[purpose]||titles.login;
  let fields='';if(purpose==='signup')fields+=input('name','Your name','text','name','minlength="2" maxlength="60"');
  if(['login','signup','recover'].includes(purpose))fields+=input('email','Email address','email','username','maxlength="254"');
  if(['login','signup','reset'].includes(purpose))fields+=input('password',purpose==='reset'?'New password':'Password','password',purpose==='login'?'current-password':'new-password',`minlength="${purpose==='login'?1:12}" maxlength="128"`);
  return `<h2>${title[0]}</h2><p class="muted">${title[1]}</p>${alert}<form method="post" action="/auth/${purpose}">${hidden(flow)}${fields}<button type="submit">${title[2]}</button></form><div class="links">${purpose==='login'?`<a href="${link('/auth/signup')}">Create an account</a><a href="${link('/auth/recover')}">Forgot password?</a>`:purpose==='logout'?`<a href="${escape(flow.returnTo)}">Keep working</a>`:`<a href="${link('/auth/login')}">Back to sign in</a>`}</div>`;
}
async function readForm(request:Request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded')throw new AppError(415,'Submit the form from this page.');
  if(Number(request.headers.get('content-length'))>8192)throw new AppError(413,'The form is too large.');
  const reader=request.body?.getReader();if(!reader)throw new AppError(400,'The form is empty.');let size=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();throw new AppError(413,'The form is too large.');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let params:URLSearchParams;try{params=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AppError(400,'The form could not be read.');}
  const values:Record<string,string>={};for(const [key,value] of params){if(Object.hasOwn(values,key)||!['nonce','email','password','name','code'].includes(key))throw new AppError(400,'The form contains an unexpected field.');values[key]=value;}return values;
}
export function isAuthPath(path:string){return path.startsWith('/auth/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(path);}
export async function authPage(request:Request,auth:Auth,origin:string):Promise<Response>{
  const url=new URL(request.url),path=url.pathname,kind=path.slice('/auth/'.length);let flow:AuthFlow|null=null;
  try{
    if(url.origin!==origin)throw new AppError(403,'Open this form on the application domain.');
    if(request.method==='GET'){
      if(path==='/signin-with-chatgpt'||path==='/callback')return redirect('/auth/login?return_to='+encodeURIComponent(safeReturnTo(url.searchParams.get('return_to'))));
      if(path==='/signout-with-chatgpt')return redirect('/auth/logout?return_to='+encodeURIComponent(safeReturnTo(url.searchParams.get('return_to'))));
      if(kind==='verify'){
        flow=await auth.flow(request);if(!flow?.purpose.startsWith('verify-'))throw new AppError(400,'Start email verification again.');
        return page('Verify your email',form(flow));
      }
      if(!['login','signup','recover','reset','logout'].includes(kind))throw new AppError(404,'This sign-in page could not be found.');
      if(kind==='reset'&&!await auth.canReset(request))throw new AppError(403,'Verify a password-recovery code first.');
      const next=await auth.newFlow(kind,safeReturnTo(url.searchParams.get('return_to')));flow=next.flow;
      return page(kind==='login'?'Sign in':'Your account',form(flow,kind==='login'&&url.searchParams.get('password_changed')==='1'?'Password saved. Sign in with your new password.':undefined),200,[next.cookie]);
    }
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...commonHeaders,Allow:'GET, POST'}});
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Open the form on this site and try again.');
    const values=await readForm(request);flow=await auth.flow(request);
    if(!flow||values.nonce!==flow.nonce)throw new AppError(403,'This form expired. Open it again to continue.');
    if(!['login','signup','recover','reset','logout','verify','resend'].includes(kind)||((kind==='verify'||kind==='resend')?!flow.purpose.startsWith('verify-'):flow.purpose!==kind))throw new AppError(403,'Start this form again.');
    const {nonce:_,...input}=values,ip=request.headers.get('CF-Connecting-IP')||'unknown',previous=cookieValue(request,SESSION_COOKIE);
    if(kind==='login'){const result=await auth.login(input,ip,previous);return redirect(flow.returnTo,[result.cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(kind==='signup'||kind==='recover'){const result=await auth[kind](input,ip),next=await auth.newFlow(kind==='signup'?'verify-signup':'verify-recovery',flow.returnTo,result.email);return redirect('/auth/verify',[next.cookie]);}
    if(kind==='verify'){const result=await auth.verify(flow,input,ip,previous);return redirect(flow.purpose==='verify-recovery'?'/auth/reset':flow.returnTo,[result.cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(kind==='resend'){if(Object.keys(input).length)throw new AppError(400,'Submit the verification form again.');await auth.resend(flow,ip);return redirect('/auth/verify');}
    if(kind==='reset'){const cookie=await auth.reset(request,input);return redirect('/auth/login?password_changed=1',[cookie,clearAuthCookie(FLOW_COOKIE)]);}
    if(Object.keys(input).length)throw new AppError(400,'Submit the sign-out form again.');
    return redirect(flow.returnTo,[await auth.logout(request),clearAuthCookie(FLOW_COOKIE)]);
  }catch(error){
    const known=error instanceof AppError,message=known?error.message:'We could not complete sign-in. Please try again.';
    return page('Your account',flow?form(flow,message):`<h2>Let’s try that again.</h2><p class="error" role="alert">${escape(message)}</p><a href="/auth/login">Open sign in</a>`,known?error.status:503);
  }
}
