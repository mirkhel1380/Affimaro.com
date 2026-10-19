import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerRouting,ownerHostRoute} from '../self-hosted/owner-routing.mjs';
import {cloudflareSettings} from '../self-hosted/cloudflare-settings.mjs';
import {verifyCloudflareTarget} from '../self-hosted/preflight.mjs';
const publicOrigin='https://affimaro.example',ownerOrigin='https://admin.affimaro.example';

test('the optional owner hostname must be a distinct HTTPS admin subdomain of the public website',()=>{
 assert.deepEqual(ownerRouting(publicOrigin),{origin:null,route:null});
 assert.deepEqual(ownerRouting(publicOrigin,ownerOrigin),{origin:ownerOrigin,route:{pattern:'admin.affimaro.example',custom_domain:true}});
 for(const value of [publicOrigin,'https://admin.attacker.example','http://admin.affimaro.example',ownerOrigin+'/owner',ownerOrigin+'?x=1','https://user:pass@admin.affimaro.example','https://admin.affimaro.example:4430'])assert.throws(()=>ownerRouting(publicOrigin,value));
 assert.throws(()=>ownerRouting('https://app.person.workers.dev','https://admin.app.person.workers.dev'));
});
test('public owner bookmarks redirect to the owner host while mutations stay on their originating host',()=>{
 for(const path of ['/owner','/owner/users?role=brand','/admin/setup','/auth/owner/login','/%6fwner/users']){
  const response=ownerHostRoute(new Request(publicOrigin+path),publicOrigin,ownerOrigin);assert.equal(response.status,307);assert.equal(response.headers.get('location'),ownerOrigin+path);assert.match(response.headers.get('cache-control'),/no-store/);
 }
 for(const path of ['/auth/owner/login','/api/admin/applications','/api/admin/billing-setup','/api/%61dmin/applications']){const response=ownerHostRoute(new Request(publicOrigin+path,{method:'POST'}),publicOrigin,ownerOrigin);assert.equal(response.status,403);assert.equal(response.headers.get('location'),null);}
 assert.equal(ownerHostRoute(new Request(publicOrigin+'/pricing'),publicOrigin,ownerOrigin),null);
 assert.equal(ownerHostRoute(new Request(publicOrigin+'/owner'),publicOrigin,null),null);
});
test('the owner hostname serves only its portal and required assets, with a private root and no customer signup',()=>{
 for(const path of ['/','/account'])assert.equal(ownerHostRoute(new Request(ownerOrigin+path),publicOrigin,ownerOrigin).headers.get('location'),'/owner');
 for(const path of ['/pricing','/workspace','/partner','/creator','/agency','/auth/brand/signup','/api/billing/webhook','/demo/index.html'])assert.equal(ownerHostRoute(new Request(ownerOrigin+path),publicOrigin,ownerOrigin).status,404);
 for(const path of ['/owner','/owner/settings','/auth/owner/login','/api/admin/applications','/auth-form.js','/_next/static/site.css'])assert.equal(ownerHostRoute(new Request(ownerOrigin+path),publicOrigin,ownerOrigin),null);
 assert.equal(ownerHostRoute(new Request(ownerOrigin+'/auth/login'),publicOrigin,ownerOrigin).headers.get('location'),'/auth/owner/login');
});
test('custom-domain builds bind both hosts and reject deployment with a missing or different owner origin',()=>{
 const settings=cloudflareSettings({APP_ORIGIN:publicOrigin,OWNER_ORIGIN:ownerOrigin});
 assert.equal(settings.ownerOrigin,ownerOrigin);assert.equal(settings.routing.workers_dev,false);assert.deepEqual(settings.routing.routes,[{pattern:'affimaro.example',custom_domain:true},{pattern:'admin.affimaro.example',custom_domain:true}]);
 const config={name:'affimaro-com',account_id:settings.accountId,vars:{APP_ORIGIN:publicOrigin,OWNER_ORIGIN:ownerOrigin},d1_databases:[{binding:'DB',database_id:settings.databaseId}],...settings.routing};
 verifyCloudflareTarget(config,settings);
 for(const value of [undefined,'https://admin.other.example'])assert.throws(()=>verifyCloudflareTarget({...config,vars:{...config.vars,OWNER_ORIGIN:value}},settings));
});
