import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrationMaintenance} from '../self-hosted/migration.ts';
import {handoffLandingLinks,marketingPage,pricingPage} from '../lib/landing.ts';

const source='https://affimaro-preview.kindsky66.chatgpt.site',target='https://independent.example',paused={AFFIMARO_MIGRATION_MAINTENANCE:'true'};
test('paused native browser pages go to the completed host while keeping the exact application path',()=>{
  for(const path of ['/billing','/start?view=affiliate','/workspace?tab=program','/payments?view=business','/reports?range=7d','/join/program-id','/account','/install'])for(const method of ['GET','HEAD']){
    const response=migrationMaintenance(new Request(source+path,{method}),paused,target);
    assert.equal(response.status,307);assert.equal(response.headers.get('location'),target+path);assert.equal(response.body,null);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('set-cookie'),null);
  }
});
test('completed-host handoff never redirects browser writes, machine events, APIs or authentication requests',()=>{
  for(const [path,method] of [['/billing','POST'],['/start','PUT'],['/api/woocommerce/event','POST'],['/api/payments','POST'],['/api/reports/export','GET'],['/auth/login','GET'],['/auth/verify?code=PRIVATE_FIXTURE','GET'],['/auth/logout','POST']]){
    const response=migrationMaintenance(new Request(source+path,{method}),paused,target);assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('set-cookie'),null);
  }
  for(const [path,method] of [['/migration','GET'],['/api/migration/export','POST'],['/demo/app.js','GET'],['/downloads/affimaro-woocommerce.zip','GET'],['/','GET']])assert.equal(migrationMaintenance(new Request(source+path,{method}),paused,target),null);
});
test('an accidental pause on the independent host stays blocked and invalid or same-host destinations cannot loop',()=>{
  const request=new Request(source+'/billing');
  assert.equal(migrationMaintenance(request,{},target),null);
  for(const destination of [undefined,source,'http://unsafe.example','https://unsafe.example/path','https://user:secret@unsafe.example']){
    const response=migrationMaintenance(request,paused,destination);assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);
  }
});
test('every package action on the separate pricing page opens the active host from the native preview',async()=>{
  const landing=await readFile(new URL('../public/demo/index.html',import.meta.url),'utf8'),section=await readFile(new URL('../content/pricing-section.html',import.meta.url),'utf8');
  const page=pricingPage(landing,section),html=marketingPage(page,false,target);
  const packages=[...html.matchAll(/<a\b[^>]*href="([^"]+\/billing)"[^>]*>/g)];assert.equal(packages.length,3);
  for(const [tag,href] of packages){assert.equal(href,target+'/billing');assert.match(tag,/target="_top"/);}
  assert.ok(html.includes('href="/pricing" aria-current="page"'));assert.ok(html.includes('href="/#/demo/affiliate/overview"'));
  for(const [,href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g))assert.ok(!/^\/(account|billing|start|install)([/?#]|$)/.test(href));
  const independent=marketingPage(page,true,target);assert.ok(independent.includes('href="/billing"'));assert.ok(independent.includes('rel="manifest"'));assert.ok(!independent.includes(target));
  assert.ok(!landing.includes('id="plans"'));assert.ok(!landing.includes('href="#plans"'));
});
test('native landing handoff preserves public/demo links, replaces an existing target once and supports a future selected domain',()=>{
  const html='<a href="/billing" target="_self">Plans</a><a href="/start?view=affiliate">Guide</a><a href="/downloads/guide.md">Download</a><a href="/#/demo/merchant/overview">Demo</a><a href="https://external.example/billing">External</a>';
  const result=handoffLandingLinks(html,target);assert.equal((result.match(/target="_top"/g)||[]).length,2);assert.ok(!result.includes('_self'));assert.ok(result.includes(`href="${target}/start?view=affiliate"`));assert.ok(result.includes('href="/downloads/guide.md"'));assert.ok(result.includes('href="/#/demo/merchant/overview"'));assert.ok(result.includes('href="https://external.example/billing"'));
  assert.ok(handoffLandingLinks('<a href="/billing">Plans</a>','https://future-domain.example').includes('https://future-domain.example/billing'));
});
