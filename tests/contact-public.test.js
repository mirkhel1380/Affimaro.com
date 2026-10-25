import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve,dirname} from 'node:path';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {queueFixture} from './support/admission-queue.js';
import {contactInbox} from '../lib/contact-inbox.ts';
import {saveContactEmailSetup,contactReceiptSummary} from '../lib/contact-email.ts';
import {renderMarketingDocument} from '../lib/marketing-content.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});
const temp=mkdtempSync(join(cache,'contact-public-'));after(()=>{rmSync(temp,{recursive:true,force:true});delete globalThis.__publicContactDb;});
const bundle=await build({stdin:{contents:"export {POST} from './app/api/contact/route';export {GET as ContactPage} from './app/contact/route';export {GET as WordPressAdmin} from './app/integrations/wordpress-admin/route';",resolveDir:root,loader:'ts'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'public-contact-fixture',setup(b){
 b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const env=new Proxy({},{get(_,key){return key==='DB'?globalThis.__publicContactDb:key==='PAYMENT_DATA_KEY_V1'?'cd'.repeat(32):undefined;}});",loader:'js'}));
 b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},a=>({contents:readFileSync(a.path,'utf8'),loader:'text',resolveDir:dirname(a.path)}));
}}]});const file=join(temp,'public.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const api=await import(pathToFileURL(file).href);
const origin='https://affimaro.example',body={id:'f8aca117-d789-48a8-8e97-21ef377166b1',name:'A visitor',email:'visitor@example.com',topic:'other',message:'Please help me connect the WordPress installation for my store.',fax:''};
const request=(data=body,extra={},native=false)=>new Request(origin+'/api/contact',{method:'POST',headers:{Origin:origin,'Content-Type':native?'application/x-www-form-urlencoded':'application/json',...extra},body:native?new URLSearchParams(data).toString():JSON.stringify(data)});
const total=db=>db.sqlite.prepare('SELECT count(*) n FROM contact_messages').get().n;

test('anonymous real contact API delivers one private message and returns an idempotent receipt visible only to the owner',async t=>{
 const f=await queueFixture(t);globalThis.__publicContactDb=f.db;let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;assert.fail('Contact submission called an email or payment provider');});
 const sent=await api.POST(request(body,{'CF-Connecting-IP':'203.0.113.21'}));assert.equal(sent.status,200);assert.equal(sent.headers.get('cache-control'),'no-store');assert.deepEqual(await sent.json(),{ok:true,data:{reference:body.id}});
 const retry=await api.POST(request());assert.equal(retry.status,200);assert.equal(total(f.db),1);
 const owner=await contactInbox(f.db,f.owner).list({status:'new',message:body.id});assert.equal(owner.total,1);assert.equal(owner.selected.email,body.email);assert.equal(owner.selected.message,body.message);assert.equal(owner.selected.topic,'other');assert.equal(owner.selected.status,'new');assert.ok(!Object.hasOwn(owner.selected,'network_hash'));assert.equal(calls,0);
 assert.equal((await api.POST(request({...body,message:'A changed payload must never overwrite the original message.'}))).status,409);assert.equal(total(f.db),1);
});

test('the real public form emails its numbered receipt only after owner setup and keeps reference details off the page',async t=>{
 const f=await queueFixture(t);globalThis.__publicContactDb=f.db;const calls=[];
 await saveContactEmailSetup(f.db,f.owner,'cd'.repeat(32),{action:'configure',revision:0,enabled:true,apiKey:'re_fixture_contact_sending_key'});
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({id:'b4acdf9e-c523-4b07-9bea-d72cb6476e9b'});});
 const sent=await api.POST(request(body,{},true));assert.equal(sent.status,200);const html=await sent.text(),receipt=await contactReceiptSummary(f.db,f.owner,body.id);assert.equal(receipt.status,'accepted');assert.match(receipt.reference,/^[0-9]{8}$/);assert.equal(calls.length,1);assert.deepEqual(calls[0].body.to,[body.email]);assert.ok(calls[0].body.text.includes(receipt.reference));assert.ok(!html.includes(receipt.reference));assert.ok(!html.includes(body.id));assert.ok(!html.includes('Keep this reference'));assert.ok(html.includes('Thank you for getting in touch.'));
 await api.POST(request());assert.equal(calls.length,1);
 const spam=await api.POST(request({...body,id:crypto.randomUUID(),fax:'spam'}));assert.equal(spam.status,200);assert.equal(calls.length,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM contact_receipts').get().n,1);
});

test('real public action rejects foreign origins, wrong bodies, forged owner fields and oversized streams before storing',async t=>{
 const f=await queueFixture(t);globalThis.__publicContactDb=f.db;
 for(const [headers,status] of [[{Origin:'https://foreign.example'},403],[{'Sec-Fetch-Site':'cross-site'},403],[{'Content-Type':'text/plain'},415]])assert.equal((await api.POST(request(body,headers))).status,status);
 assert.equal((await api.POST(request({...body,status:'closed'}))).status,400);
 const malformed=new Request(origin+'/api/contact',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{broken'});assert.equal((await api.POST(malformed)).status,400);
 for(const native of [false,true]){const req=new Request(origin+'/api/contact',{method:'POST',headers:{Origin:origin,'Content-Type':native?'application/x-www-form-urlencoded':'application/json'},body:'x'.repeat(native?65537:24577)});assert.equal((await api.POST(req)).status,413);}
 const declared=request(body,{'Content-Length':'24577'});assert.equal((await api.POST(declared)).status,413);assert.equal(total(f.db),0);
});

test('native HTML submission saves a receipt, retains and escapes failed drafts, and never trusts a GET success parameter',async t=>{
 const f=await queueFixture(t);globalThis.__publicContactDb=f.db;
 const sent=await api.POST(request({...body,id:''},{},true));assert.equal(sent.status,200);assert.match(sent.headers.get('content-type'),/^text\/html/);const html=await sent.text();assert.match(html,/MESSAGE RECEIVED/);assert.ok(!html.includes('m-contact-reference'));assert.ok(!html.includes('Keep this reference'));assert.ok(!html.includes('Your reference is'));assert.equal(total(f.db),1);
 const invalid=await api.POST(request({...body,name:'<svg onload="alert(1)">',message:'too short',id:''},{},true));assert.equal(invalid.status,400);const draft=await invalid.text();assert.ok(draft.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'));assert.ok(!draft.includes('<svg onload='));assert.ok(draft.includes('too short'));assert.ok(!draft.includes('MESSAGE RECEIVED'));
 const duplicate=new Request(origin+'/api/contact',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,id:''}).toString()+'&email=other%40example.com'});assert.equal((await api.POST(duplicate)).status,400);
 const get=await api.ContactPage(new Request(origin+'/contact?sent='+body.id+'&contactReference='+body.id));assert.equal(get.status,200);const page=await get.text();assert.ok(!page.includes('MESSAGE RECEIVED'));assert.ok(page.includes('data-contact-form'));assert.equal(total(f.db),1);
});

test('public action rate limits real submissions while honeypots stay indistinguishable without a stored message',async t=>{
 const f=await queueFixture(t);globalThis.__publicContactDb=f.db;
 for(let i=0;i<5;i++)assert.equal((await api.POST(request({...body,id:crypto.randomUUID(),email:'person'+i+'@example.com'},{'CF-Connecting-IP':'203.0.113.22'}))).status,200);
 assert.equal((await api.POST(request({...body,id:crypto.randomUUID(),email:'next@example.com'},{'CF-Connecting-IP':'203.0.113.22'}))).status,429);assert.equal(total(f.db),5);
 const spam=await api.POST(request({...body,id:crypto.randomUUID(),fax:'spam'}));assert.equal(spam.status,200);assert.deepEqual(Object.keys((await spam.json()).data),['reference']);assert.equal(total(f.db),5);
});

test('real WordPress entry navigates only to a validated public installation and never fetches its site',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;assert.fail('WordPress admin navigation fetched the site');});
 const open=website=>api.WordPressAdmin(new Request(origin+'/integrations/wordpress-admin?website='+encodeURIComponent(website)));
 const good=open('https://shop.example.com/wordpress/');assert.equal(good.status,303);assert.equal(good.headers.get('location'),'https://shop.example.com/wordpress/wp-admin/');assert.equal(good.headers.get('cache-control'),'no-store');
 for(const website of ['javascript:alert(1)','https://user:secret@shop.example.com','https://127.0.0.1','https://shop.local','https://shop.example.com/?token=PRIVATE_TOKEN','https://shop.example.com/wp-admin']){const result=open(website);assert.equal(result.status,400);assert.equal(result.headers.get('location'),null);const html=await result.text();assert.ok(!html.includes('PRIVATE_TOKEN'));assert.ok(!html.includes('user:secret'));}
 assert.equal(api.WordPressAdmin(new Request(origin+'/integrations/wordpress-admin')).status,200);assert.equal(calls,0);
});

function formHarness(fetcher){
 const values=Object.fromEntries(['id','name','email','topic','message','fax'].map(name=>[name,{value:body[name]||''}]));let send;
 const feedback={textContent:'',dataset:{}},submit={innerHTML:'Send message',textContent:'',disabled:false},attributes={};
 const form={action:origin+'/api/contact',elements:{namedItem:name=>values[name]},querySelector:selector=>selector==='[data-contact-feedback]'?feedback:submit,addEventListener:(name,fn)=>{if(name==='submit')send=fn;},reportValidity:()=>true,setAttribute:(key,val)=>{attributes[key]=val;},removeAttribute:key=>{delete attributes[key];},reset(){for(const name of ['id','name','email','message','fax'])values[name].value='';values.topic.value='general';}};
 let uuid=0;const ids=['9a5e7b20-695e-4900-a672-2b6143e62efb','0824b013-0c20-4ebe-b34d-c81220506ac1','b55d5633-2c90-4834-b0f7-e21ce9193afb'];values.id.value='';
 runInNewContext(readFileSync(join(root,'public/contact-form.js'),'utf8'),{document:{querySelector:()=>form},fetch:fetcher,crypto:{randomUUID:()=>ids[uuid++]},Error});
 return {values,feedback,submit,attributes,send:()=>send({preventDefault(){}})};
}

test('actual browser contact script retains uncertain retries, changes IDs for edited content, and requires a valid JSON receipt',async()=>{
 const payloads=[];let count=0;const ui=formHarness(async(_url,options)=>{payloads.push(JSON.parse(options.body));count++;if(count===1)throw new Error('Network interrupted');if(count===2)return new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}});return Response.json({ok:true,data:{reference:'aa92979a-cc7c-48f6-aad4-bd6301a42f9c'}});});
 await ui.send();assert.equal(ui.feedback.dataset.state,'error');assert.equal(ui.values.message.value,body.message);assert.equal(ui.submit.disabled,false);
 await ui.send();assert.equal(payloads[1].id,payloads[0].id);assert.equal(ui.feedback.dataset.state,'error');assert.equal(ui.values.email.value,body.email);
 ui.values.message.value='An edited support message receives its own retry identity.';await ui.send();assert.notEqual(payloads[2].id,payloads[1].id);assert.equal(ui.feedback.dataset.state,'success');assert.equal(ui.feedback.textContent,'Thank you. Your message has been received.');assert.ok(!ui.feedback.textContent.includes('aa92979a'));assert.equal(ui.values.message.value,'');assert.equal(ui.attributes['aria-busy'],undefined);
});

test('browser busy guard submits once, keeps a draft edited in flight and leaves invalid acknowledgements as failures',async()=>{
 let finish,calls=0;const ui=formHarness(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 const pending=ui.send();assert.equal(ui.submit.disabled,true);await ui.send();assert.equal(calls,1);ui.values.message.value='A new draft typed while the submitted message is being saved.';finish(Response.json({ok:true,data:{reference:'a4957a7d-5518-4f18-ab10-becb7ca5de78'}}));await pending;assert.equal(ui.feedback.dataset.state,'success');assert.match(ui.values.message.value,/A new draft/);
 const broken=formHarness(async()=>Response.json({ok:true,data:{reference:'not-a-receipt'}}));await broken.send();assert.equal(broken.feedback.dataset.state,'error');assert.equal(broken.values.message.value,body.message);
});

test('home and public contact have actual accessible form destinations and the same provider catalog without publishing private entry points',()=>{
 const sprite=readFileSync(join(root,'content/icon-sprite.html'),'utf8');for(const path of ['/','/contact']){const html=renderMarketingDocument(path,sprite);assert.match(html,/action="\/api\/contact" method="post"/);assert.match(html,/src="\/contact-form.js"/);for(const field of ['name','email','topic','message'])assert.match(html,new RegExp('name="'+field+'"'));assert.ok(!html.includes('/owner/contact'));assert.ok(!html.includes('support@affimaro.com'));}
 for(const path of ['/','/integrations']){const html=renderMarketingDocument(path,sprite);for(const provider of ['WooCommerce','Shopify','WordPress.com','BigCommerce','Wix','Squarespace','Your own website'])assert.ok(html.includes(provider),provider);assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.ok(html.includes('Developer integration'));assert.ok(html.includes('method="get" target="_blank"'));}
});
