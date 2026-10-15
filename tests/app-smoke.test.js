// Exercise routing and demo actions without a browser or preview server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {summary,validState} from '../dist/model.js';

test('all workspace views render and sale → approval → refund → payment flows persist correctly',async()=>{
  const elements=new Map(),listeners={},windowListeners={},storage=new Map();
  function element(selector){
    if(!elements.has(selector)){
      const classes=new Set();
      elements.set(selector,{innerHTML:'',textContent:'',hidden:false,open:false,dataset:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,force){const add=force===undefined?!classes.has(c):force;if(add)classes.add(c);else classes.delete(c);return add;}},setAttribute(){},focus(){},scrollIntoView(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}});
    }
    return elements.get(selector);
  }
  globalThis.document={querySelector:element,querySelectorAll:()=>[],body:element('body'),addEventListener(name,fn){listeners[name]=fn;},getElementById:()=>null,title:''};
  globalThis.window={addEventListener(name,fn){windowListeners[name]=fn;},scrollTo(){}};
  globalThis.location={hash:'#/demo/merchant/overview'};
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  globalThis.requestAnimationFrame=fn=>fn();
  globalThis.FormData=class {constructor(form){this.values=form.values;}get(key){return this.values[key]??null;}};
  await import('../dist/app.js');
  function route(role,view){location.hash=`#/demo/${role}/${view}`;windowListeners.hashchange();return element('#app').innerHTML;}
  function submit(id,values){listeners.submit({target:{id,values},preventDefault(){}});}
  function click(dataset){listeners.click({target:{closest:()=>({dataset})},preventDefault(){}});}
  const stored=()=>JSON.parse(storage.get('affimaro.demo.v1'));
  for(const [role,views] of Object.entries({merchant:['overview','affiliates','programs','transactions','payments','integration'],affiliate:['overview','link','earnings','payouts']})){
    for(const view of views){
      const html=route(role,view);
      assert.match(html,/<h1>/,`${role}/${view} has a page heading`);
      assert.ok(!html.includes('undefined'),`${role}/${view} has complete values`);
      const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
      assert.equal(ids.length,new Set(ids).size,`${role}/${view} has unique element IDs`);
    }
  }
  route('merchant','transactions');
  submit('form-sale',{id:'SMOKE-001',affiliateId:'sofia',amount:'100.00',referralAgeDays:'0'});
  assert.equal(stored().orders.at(-1).status,'pending');
  assert.equal(stored().orders.at(-1).amountCents,10000);
  assert.match(element('#app').innerHTML,/SMOKE-001/);
  const before=storage.get('affimaro.demo.v1');
  submit('form-sale',{id:'SMOKE-001',affiliateId:'sofia',amount:'100.00',referralAgeDays:'0'});
  assert.match(element('#modal-error').textContent,/duplicate/);
  assert.equal(storage.get('affimaro.demo.v1'),before);
  click({action:'approve-order',id:'SMOKE-001'});
  assert.equal(stored().orders.at(-1).status,'approved');
  submit('form-refund',{orderId:'SMOKE-001',amount:'50.00'});
  assert.equal(stored().orders.at(-1).refundedCents,5000);
  assert.equal(summary(stored(),'sofia').approved,4500);
  submit('form-payment',{affiliateId:'sofia',method:'Bank transfer',reference:'SMOKE-PAY'});
  assert.equal(summary(stored(),'sofia').approved,0);
  assert.equal(summary(stored(),'sofia').paid,6900);
  assert.ok(validState(stored()));
  const own=route('affiliate','earnings');
  assert.match(own,/SMOKE-001/);
  assert.ok(!own.includes('ORD-1042'),'Another affiliate’s order is excluded');
  click({action:'confirm-reset'});
  assert.equal(stored().orders.length,9);
  assert.ok(!element('#app').innerHTML.includes('SMOKE-001'));
});
