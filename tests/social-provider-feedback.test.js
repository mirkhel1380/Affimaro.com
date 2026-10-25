import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../public/auth-form.js',import.meta.url),'utf8');
test('clicking an unavailable provider explains setup locally and leaves entered form values untouched',()=>{
 for(const provider of ['google','apple','sso']){let handler,focused=false,prevented=false;const attributes={},feedback={textContent:'',setAttribute(k,v){attributes[k]=v;},focus(){focused=true;}},button={getAttribute(){return provider;}},form={querySelector(){return button;},addEventListener(kind,fn){assert.equal(kind,'submit');handler=fn;}};
  runInNewContext(script,{document:{querySelector(){return null;},querySelectorAll(selector){return selector==='form'?[form]:[];},getElementById(){return feedback;}},location:{assign(){assert.fail('Unavailable provider must not navigate.');}},fetch(){assert.fail('Unavailable provider must not send account data.');}});handler({preventDefault(){prevented=true;}});assert.ok(prevented);assert.ok(focused);assert.equal(attributes.tabindex,'-1');assert.match(feedback.textContent,/not connected yet/);assert.ok(feedback.textContent.includes(provider==='google'?'Google':provider==='apple'?'Apple':'Organization SSO'));
 }
});
test('configured provider forms retain their normal authenticated server submission',()=>{let intercepted=false;runInNewContext(script,{document:{querySelector(){return null;},querySelectorAll(selector){return selector==='form'?[{querySelector(){return null;},addEventListener(){intercepted=true;}}]:[];}}});assert.equal(intercepted,false);});
