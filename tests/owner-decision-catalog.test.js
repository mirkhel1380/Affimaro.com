import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {applicationProfile as validateProfile,industries,commissionModels} from '../lib/application-profile.ts';
import {applicationProfile} from './support/application-profiles.js';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'owner-decision-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const bundle=await build({stdin:{contents:"export {ApplicationForm} from './app/application/application-form';export {ReviewForm} from './app/admin/applications/review-form';export {ProfileFindings} from './app/admin/applications/profile-findings';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'}),file=join(temp,'views.mjs');writeFileSync(file,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(file).href);

test('owner approval is selectable with outstanding ownership and decision messages are optional',()=>{
 const html=renderToStaticMarkup(createElement(views.ReviewForm,{userId:'applicant',revision:2,approvalReady:false}));const option=html.match(/<option[^>]*value="approved"[^>]*>/)[0];assert.ok(!option.includes('disabled'));assert.match(html,/You can approve this account/);assert.match(html,/existing verification status/);const note=html.match(/<textarea[^>]*name="note"[^>]*>/)[0];assert.ok(!note.includes('required'));assert.ok(!note.includes('minLength'));
 const findings=renderToStaticMarkup(createElement(views.ProfileFindings,{portal:'brand',profile:{}}));assert.match(findings,/do not block your decision/);assert.match(findings,/basic account details/);
});
test('both business forms and server validation share the expanded sector and intended commission catalogs',()=>{
 assert.ok(industries.length>=40);assert.equal(new Set(industries).size,industries.length);assert.ok(commissionModels.length>=15);assert.equal(new Set(commissionModels).size,commissionModels.length);
 for(const portal of ['brand','agency']){
  for(const commissionModel of commissionModels)assert.equal(validateProfile(portal,{...applicationProfile(portal),industry:'Web hosting & domains',commissionModel}).success,true,commissionModel);
  assert.equal(validateProfile(portal,{...applicationProfile(portal),commissionModel:'Forged payment method'}).success,false);
  const html=renderToStaticMarkup(createElement(views.ApplicationForm,{portal,revision:1,profile:applicationProfile(portal)}));const sectors=html.match(/<select[^>]*name="industry"[\s\S]*?<\/select>/)[0],models=html.match(/<select[^>]*name="commissionModel"[\s\S]*?<\/select>/)[0];assert.equal((sectors.match(/<option\b/g)||[]).length,industries.length+1);assert.equal((models.match(/<option\b/g)||[]).length,commissionModels.length+1);for(const acronym of ['CPA','CPS','CPL','CPC','CPI','CPV','CPM','CPE'])assert.ok(models.includes(acronym));assert.match(html,/intended model for application review/);assert.match(html,/percentage-of-sale program rules/);
 }
 for(const commissionModel of ['Percentage of sale','Fixed amount','To be defined'])assert.equal(validateProfile('brand',{...applicationProfile('brand'),commissionModel}).success,true);
});
