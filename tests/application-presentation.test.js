import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {database} from './support/db.js';
import {applicationProfile} from './support/application-profiles.js';
import {emailAuth} from '../self-hosted/auth-core.ts';
import {authPage} from '../self-hosted/auth-pages.ts';
import {renderMarketingDocument} from '../lib/marketing-content.mjs';
import {pricingSection,launchPrices} from '../lib/pricing-catalog.mjs';
import {applicationJourney} from '../lib/application-journey.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'affimaro-applicant-views-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const output=await build({stdin:{contents:"export {ApplicationForm} from './app/application/application-form';export {ProfileDetails} from './app/application/profile-details';export {ReviewForm} from './app/admin/applications/review-form';export {Shell} from './app/ui';export {OwnerShell} from './app/owner/shell';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'unused-server-dispatch',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare:workers',namespace:'runtime-fixture'}));b.onLoad({filter:/.*/,namespace:'runtime-fixture'},()=>({contents:"export const env={APP_ORIGIN:'https://affimaro.example'};",loader:'js'}));b.onResolve({filter:/^next\/(headers|navigation)$/},args=>({path:args.path,external:true,sideEffects:false}));}}]});
const filename=join(temp,'views.mjs');writeFileSync(filename,output.outputFiles[0].contents);const {ApplicationForm,ProfileDetails,ReviewForm,Shell,OwnerShell}=await import(pathToFileURL(filename).href);

test('both real application forms collect the complete profile and expose an explicit review submission without sensitive identity/bank fields',()=>{
  for(const portal of ['brand','affiliate']){
    const html=renderToStaticMarkup(createElement(ApplicationForm,{portal,revision:1,profile:{}}));
    assert.match(html,/<form[^>]*action="\/api\/application"/);assert.match(html,/<form[^>]*method="post"/);
    for(const field of ['contactName','name','phone','country','city','primaryUrl','additionalUrls','industry','monthlyAudience','audienceCountries','promotionMethods','experience','description','promotionPlan','authorityConfirmed','dataConfirmed'])assert.ok(html.includes('name="'+field+'"'),portal+' includes '+field);
    assert.equal(html.includes('name="legalBusinessName"'),portal==='brand');assert.equal(html.includes('name="monthlyOrders"'),portal==='brand');assert.equal(html.includes('name="channel"'),portal==='affiliate');
    assert.match(html,/Save &amp; continue/);assert.match(html,/STEP 1 OF 6/);assert.match(html,/hidden=""/);assert.match(html,/no subscription or payment starts/);
    for(const field of ['status','userId','role','bankAccount','passport','password'])assert.ok(!html.includes('name="'+field+'"'));
  }
});
test('ownership verification returns every role to its application without losing its allowed destination',()=>{
  for(const portal of ['brand','affiliate','creator','agency']){
    const target=portal==='brand'?'/billing?plan=growth&source=pricing#checkout':portal==='agency'?'/agency/billing?plan=business':'/join/program-example?source=invite#rules';
    const journey=applicationJourney(portal,target),channels=new URL(journey.channels,'https://affimaro.example');
    assert.equal(channels.pathname,'/application/media');assert.equal(channels.searchParams.get('return_to'),target);
    const back=new URL(applicationJourney(portal,channels.searchParams.get('return_to')).resume,'https://affimaro.example');
    assert.equal(back.pathname,'/application');assert.equal(back.searchParams.get('step'),'channels');assert.equal(back.searchParams.get('return_to'),target);
    assert.equal(new URL(journey.application,'https://affimaro.example').searchParams.get('return_to'),target);
  }
  for(const portal of ['affiliate','creator'])for(const target of ['/billing?plan=growth','/agency/billing?plan=business'])assert.equal(applicationJourney(portal,target).destination,portal==='affiliate'?'/partner':'/creator');
  for(const target of ['https://outside.example/steal','//outside.example','/\\outside.example','/auth/reset','/callback','/a\r\nb']){
    const journey=applicationJourney('brand',target);assert.equal(journey.destination,'/account');assert.ok(!journey.resume.includes('outside.example'));
  }
});
test('all four application forms resume Channels with saved profile fields and leave a fresh application at Contact',()=>{
  for(const portal of ['brand','affiliate','creator','agency']){
    const profile=applicationProfile(portal),resumed=renderToStaticMarkup(createElement(ApplicationForm,{portal,revision:4,profile,resumeChannels:true}));
    assert.match(resumed,/STEP 4 OF 6/);assert.match(resumed,/<fieldset data-step="3">/);assert.match(resumed,/<fieldset data-step="0" hidden=""/);
    assert.ok(resumed.includes('value="'+profile.contactName+'"'));assert.ok(resumed.includes('value="'+profile.primaryUrl+'"'));
    assert.match(resumed,/Save &amp; continue/);assert.ok(!resumed.includes('type="submit"'));assert.match(resumed,/Owner approval is required/);
    const fresh=renderToStaticMarkup(createElement(ApplicationForm,{portal,revision:4,profile}));assert.match(fresh,/STEP 1 OF 6/);assert.match(fresh,/<fieldset data-step="0">/);
  }
});
test('pending navigation exposes only the application, while approval controls are explicit and profile text is escaped',()=>{
  const pending=renderToStaticMarkup(createElement(Shell,{name:'Applicant',email:'applicant@example.com',portal:'affiliate',active:'application',reviewOnly:true},'Application'));
  assert.match(pending,/href="\/application"/);for(const path of ['/workspace','/partner','/payments','/reports','/billing','/admin/applications'])assert.ok(!pending.includes('href="'+path));
  const owner=renderToStaticMarkup(createElement(OwnerShell,{name:'Owner',email:'owner@example.com',active:'reviews'},'Review'));assert.match(owner,/href="\/owner\/applications"/);assert.match(owner,/href="https:\/\/affimaro.example">View public website/);assert.ok(!owner.includes('href="/workspace"'));assert.ok(!/Highlink/i.test(owner));
  const form=renderToStaticMarkup(createElement(ReviewForm,{userId:'applicant',revision:2}));assert.match(form,/<form[^>]*action="\/api\/admin\/applications"/);assert.match(form,/<form[^>]*method="post"/);assert.match(form,/Select after reviewing the profile/);assert.match(form,/type="submit" disabled/);assert.match(form,/I have reviewed this profile/);
  const html=renderToStaticMarkup(createElement(ProfileDetails,{profile:{...applicationProfile(),description:'<img src=x onerror=alert(1)>',unexpectedSecret:'PRIVATE_NOT_A_PROFILE_FIELD'}}));
  assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.ok(!html.includes('PRIVATE_NOT_A_PROFILE_FIELD'));assert.match(html,/rel="noopener noreferrer"/);
});
test('auth pages use the brand SVG and green palette, with a progressive password control and a self-only script policy',async t=>{
  const config={origin:'https://affimaro.example',supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_FIXTURE_PUBLIC_KEY_1234567890',encryptionKey:'df'.repeat(32)},api=emailAuth(database(t),config,async(url,init)=>{assert.equal(new URL(url).pathname,'/auth/v1/settings');assert.equal(init.method,'GET');return Response.json({external:{email:true},disable_signup:false,mailer_autoconfirm:false});});
  for(const portal of ['brand','affiliate'])for(const kind of ['login','signup']){
    const response=await authPage(new Request(config.origin+'/auth/'+portal+'/'+kind),api,config.origin),html=await response.text();
    assert.equal(response.status,200);assert.match(html,/aria-label="Affimaro home"/);assert.match(html,/<svg viewBox="0 0 32 32"/);assert.ok(!html.includes('<span class="mark">a</span>'));assert.ok(!/Highlink|#2f5178|#dce7fa|#33577d/.test(html));
    assert.match(html,/background:#193e30/);assert.match(html,/input:-webkit-autofill/);assert.match(html,/data-password-toggle aria-controls="password"/);assert.match(html,/aria-label="Show password" aria-pressed="false" hidden/);assert.match(html,/name="password" type="password"/);
    assert.match(html,/<script src="\/auth-form.js" defer><\/script>/);assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);assert.ok(!response.headers.get('content-security-policy').includes("script-src 'unsafe-inline'"));assert.equal(response.headers.get('referrer-policy'),'same-origin');
    if(kind==='signup')assert.match(html,/owner review/);
  }
});
test('password eyes reveal and hide only the associated input, update accessible labels and never read or store password values',()=>{
  const inputs=new Map(),buttons=[];
  for(const id of ['password','new-password']){
    const input={type:'password'};Object.defineProperty(input,'value',{get(){throw new Error('Password value was read.');},set(){throw new Error('Password value was replaced.');}});inputs.set(id,input);
    const status={textContent:''},attrs={'aria-controls':id,'aria-pressed':'false','aria-label':'Show password'},button={hidden:true,parentElement:{querySelector:()=>status},getAttribute:name=>attrs[name],setAttribute:(name,value)=>{attrs[name]=value;},addEventListener(name,callback){this[name]=callback;},attrs,status};buttons.push(button);
  }
  runInNewContext(readFileSync(new URL('../public/auth-form.js',import.meta.url),'utf8'),{document:{querySelector:()=>null,querySelectorAll:selector=>selector==='[data-password-toggle]'?buttons:[],getElementById:id=>inputs.get(id)}});
  for(const button of buttons){const input=inputs.get(button.attrs['aria-controls']);assert.equal(button.hidden,false);button.click();assert.equal(input.type,'text');assert.equal(button.attrs['aria-label'],'Hide password');assert.equal(button.attrs['aria-pressed'],'true');assert.match(button.status.textContent,/visible/);button.click();assert.equal(input.type,'password');assert.equal(button.attrs['aria-label'],'Show password');assert.equal(button.attrs['aria-pressed'],'false');}
});
test('approved prices are consistent and four audience paths link to real pages without borrowed award claims',()=>{
  const html=pricingSection();assert.equal(readFileSync(new URL('../content/pricing-section.html',import.meta.url),'utf8'),html);assert.deepEqual(launchPrices,{starter:19,growth:49,business:99});
  for(const amount of Object.values(launchPrices))assert.ok(html.includes('<strong>$'+amount+'</strong>'));
  assert.equal((html.match(/type="button" disabled/g)||[]).length,0);for(const id of ['starter','growth','business'])assert.ok(html.includes('/auth/brand/signup?plan='+id));assert.match(html,/Affiliate and creator accounts are free/);assert.match(html,/Registration and package selection do not charge/);
  const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8'),home=renderMarketingDocument('/',sprite);assert.match(home,/class="m-audience-paths"/);for(const path of ['/brands','/creators','/affiliates','/agencies'])assert.ok(home.includes('href="'+path+'"'));
  assert.match(renderMarketingDocument('/creators',sprite),/CREATOR STUDIO|creator studio/);assert.match(renderMarketingDocument('/agencies',sprite),/client directory/);
  const integration=renderMarketingDocument('/integrations',sprite);assert.match(integration,/FOR BRANDS/);assert.match(integration,/Affiliates and creators use their approved referral links and do not need to connect a store/);
});
