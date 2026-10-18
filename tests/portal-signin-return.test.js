import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';

// Run the real server pages as an anonymous visitor. Only framework dispatch
// and Cloudflare bindings are replaced; no database/provider is contacted.
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');
mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'affimaro-signin-return-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const output=await build({stdin:{contents:"export {default as PaymentsPage} from './app/payments/page';export {default as ReportsPage} from './app/reports/page';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external',define:{'import.meta.env.AFFIMARO_SELF_HOSTED':'true'},plugins:[{name:'anonymous-framework',setup(b){
  b.onResolve({filter:/^(next\/(headers|navigation)|cloudflare:workers)$/},args=>({path:args.path,namespace:'anonymous-fixture'}));
  b.onLoad({filter:/.*/,namespace:'anonymous-fixture'},args=>({contents:args.path==='next/headers'?'export async function headers(){return new Headers();}':args.path==='next/navigation'?'export function redirect(path){throw Object.assign(new Error("Redirect"),{redirectTo:path});}':'export const env={};',loader:'js'}));
}}]});
const filename=join(temp,'pages.mjs');writeFileSync(filename,output.outputFiles[0].contents);
const {PaymentsPage,ReportsPage}=await import(pathToFileURL(filename).href);

test('expired payment/report sessions preserve the selected portal through its own sign-in page',async()=>{
  for(const [Page,path] of [[PaymentsPage,'/payments'],[ReportsPage,'/reports']]){
    for(const [view,portal,canonical] of [['affiliate','affiliate','affiliate'],['partner','affiliate','affiliate'],['business','brand','business'],['merchant','brand','business']]){
      const target=path+'?view='+canonical;
      await assert.rejects(Page({searchParams:Promise.resolve({view})}),error=>error.redirectTo==='/auth/'+portal+'/login?return_to='+encodeURIComponent(target));
    }
    await assert.rejects(Page({searchParams:Promise.resolve({})}),error=>error.redirectTo==='/auth/login?return_to='+encodeURIComponent(path));
  }
});
