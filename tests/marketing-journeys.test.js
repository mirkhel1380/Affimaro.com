import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {marketingPages,renderMarketingDocument} from '../lib/marketing-content.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sprite=read('content/icon-sprite.html');
const privatePaths=new Set(['/account','/workspace','/partner','/billing','/install','/pricing','/demo/brands','/demo/affiliates','/auth/owner/login']);
test('public journeys have real destinations, valid fragment targets and no missing downloads',()=>{
  for(const path of Object.keys(marketingPages)){
    const html=renderMarketingDocument(path,sprite),ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(ids.length,new Set(ids).size,path+' has unique IDs');
    assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,path+' has one primary heading');
    assert.match(html,/<html lang="en" data-affimaro-appearance-scope="public">/);assert.match(html,/<footer /);
    assert.ok(!/Highlink/i.test(html),'Removed attribution stays absent on '+path);
    for(const [,href] of html.matchAll(/\bhref="([^"]+)"/g)){
      if(href.startsWith('#')){assert.ok(ids.includes(href.slice(1)),path+' has target '+href);continue;}
      const url=new URL(href,'https://affimaro.example');
      if(url.origin!=='https://affimaro.example')continue;
      const destination=url.pathname;
      assert.ok(Object.hasOwn(marketingPages,destination)||privatePaths.has(destination)||/^\/auth\/(brand|affiliate|creator|agency)\/(login|signup)$/.test(destination)||existsSync(new URL('../app'+destination+'/page.tsx',import.meta.url))||existsSync(new URL('../public'+destination,import.meta.url)),path+' links to '+destination);
    }
  }
  assert.equal(renderMarketingDocument('/unknown',sprite),null);
  assert.equal(renderMarketingDocument('/features/unknown',sprite),null);
});
test('home publishes the current authored pages, with separate portal entry and installation in the corner',()=>{
  const html=renderMarketingDocument('/',sprite),header=html.match(/<header class="site-header"[\s\S]*?<\/header>/)[0];
  assert.equal(read('public/demo/index.html'),html);
  for(const path of ['/platform','/brands','/affiliates','/resources','/pricing'])assert.ok(header.includes('href="'+path+'"'));
  assert.ok(!html.includes('/auth/owner/login'));assert.ok(!html.includes('Owner sign in'));
  assert.ok(!header.includes('/install'));assert.match(html,/<a class="corner-install" href="\/install"/);
  assert.ok(!/<section[^>]*(?:id="pricing"|class="plans-section)/.test(html));
  assert.match(html,/href="\/auth\/brand\/signup"/);assert.match(html,/href="\/auth\/affiliate\/signup"/);
  assert.match(renderMarketingDocument('/login',sprite),/href="\/auth\/brand\/login"/);
  assert.match(renderMarketingDocument('/login',sprite),/href="\/auth\/affiliate\/login"/);
});

function node(parent=null){
  const listeners={},attributes={},classes=new Set();
  return {parent,listeners,attributes,querySelector(){return null;},querySelectorAll(){return [];},
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,force){const yes=force??!classes.has(x);if(yes)classes.add(x);else classes.delete(x);return yes;}},
    setAttribute(key,value){attributes[key]=value;},addEventListener(key,fn){listeners[key]=fn;},
    contains(target){while(target){if(target===this)return true;target=target.parent;}return false;},
    closest(selector){return selector==='.site-header'?this.inHeader?this:null:selector==='a'&&this.anchor?this:null;},
    fire(key,details={}){const event={target:this,preventDefault(){this.prevented=true;},...details};listeners[key]?.(event);return event;}};
}
test('decorative hero motion starts only with working controls and can be paused and resumed',()=>{
  const hero=node(),control=node(hero);control.hidden=true;
  const document={querySelector:selector=>selector==='.m-partnership-visual'?hero:selector==='.m-hero-motion-toggle'?control:null};
  runInNewContext(read('public/marketing-nav.js'),{document,location:{hash:''}});
  assert.ok(hero.classList.contains('is-animated'));assert.equal(control.hidden,false);
  control.fire('click');assert.ok(hero.classList.contains('is-paused'));assert.equal(control.textContent,'Resume motion');assert.equal(control.attributes['aria-label'],'Resume decorative motion');
  control.fire('click');assert.ok(!hero.classList.contains('is-paused'));assert.equal(control.textContent,'Pause motion');assert.equal(control.attributes['aria-label'],'Pause decorative motion');
  const staticHero=node();runInNewContext(read('public/marketing-nav.js'),{document:{querySelector:selector=>selector==='.m-partnership-visual'?staticHero:null},location:{hash:''}});assert.ok(!staticHero.classList.contains('is-animated'));
});
test('service menus work with desktop hover, keyboard, touch expansion and normal page navigation',()=>{
  const navigation=node(),toggle=node(),document=node();let hover=true;
  const items=Array.from({length:4},()=>{
    const item=node(navigation),expand=node(item),link=node(item);link.anchor=true;
    expand.focus=()=>{document.activeElement=expand;};link.focus=()=>{document.activeElement=link;};
    item.querySelector=selector=>selector==='.m-nav-expand'?expand:selector==='.m-menu-links a'?link:null;
    item.expand=expand;item.link=link;return item;
  });
  toggle.focus=()=>{document.activeElement=toggle;};
  navigation.querySelectorAll=()=>items;
  document.querySelector=selector=>selector==='#main-nav'?navigation:selector==='.mobile-nav-toggle'?toggle:null;
  runInNewContext(read('public/marketing-nav.js'),{document,location:{hash:''},matchMedia:()=>({matches:hover}),queueMicrotask:fn=>fn()});
  items[0].fire('mouseenter');assert.equal(items[0].expand.attributes['aria-expanded'],'true');
  items[1].fire('mouseenter');assert.equal(items[0].expand.attributes['aria-expanded'],'false');
  items[1].fire('focusin',{target:items[1].link});
  const down=items[1].fire('keydown',{key:'ArrowDown'});assert.equal(down.prevented,true);assert.equal(document.activeElement,items[1].link);
  items[1].fire('keydown',{key:'Escape'});assert.equal(items[1].expand.attributes['aria-expanded'],'false');assert.equal(document.activeElement,items[1].expand);
  hover=false;items[2].fire('mouseenter');assert.ok(!items[2].classList.contains('is-open'));
  toggle.fire('click');assert.equal(toggle.attributes['aria-expanded'],'true');
  items[2].expand.fire('click');assert.equal(items[2].expand.attributes['aria-expanded'],'true');
  const clicked=navigation.fire('click',{target:items[2].link});assert.ok(!clicked.prevented,'a service link keeps normal full-page navigation');
  assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(items[2].expand.attributes['aria-expanded'],'false');
  toggle.fire('click');document.fire('keydown',{key:'Escape'});assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(document.activeElement,toggle);
  items[0].expand.fire('click');document.fire('click',{target:node()});assert.equal(items[0].expand.attributes['aria-expanded'],'false');
});

test('old sample links redirect to their dedicated role document with the requested view intact',()=>{
  for(const [old,portal] of [['merchant','brands'],['affiliate','affiliates']]){
    let destination;
    runInNewContext(read('public/marketing-nav.js'),{location:{hash:'#/demo/'+old+'/overview',replace:value=>{destination=value;}}});
    assert.equal(destination,'/demo/'+portal+'#/demo/'+old+'/overview');
  }
});


test('store setup links open readable branded HTML guides instead of raw Markdown files',()=>{const sprite=read('content/icon-sprite.html');for(const [integration,guide] of [['woocommerce','woocommerce'],['shopify','shopify'],['custom','custom-website']]){const detail=renderMarketingDocument('/integrations/'+integration,sprite),html=renderMarketingDocument('/guides/'+guide+'-setup',sprite);assert.ok(detail.includes('href="/guides/'+guide+'-setup"'));assert.ok(!detail.includes('/downloads/'+guide+'-setup.md'));assert.match(detail,/Read setup guide/);assert.ok(html.startsWith('<!doctype html>'));assert.match(html,/charset="utf-8"/);assert.match(html,/class="container m-guide"/);assert.match(html,/Store settings|store settings/);assert.ok(!html.includes('Optional: owner-private ChatGPT Sites access'));assert.ok(!html.includes('â€™')&&!html.includes('â†’'));}const workspace=read('app/workspace/page.tsx');for(const platform of ['shopify','woocommerce']){assert.ok(workspace.includes('/guides/'+platform+'-setup'));assert.ok(!workspace.includes('/downloads/'+platform+'-setup.md'));}});
