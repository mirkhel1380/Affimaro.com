import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {renderMarketingDocument} from '../lib/marketing-content.mjs';
import {legalVersion,policyLinks} from '../lib/legal-catalog.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'legal-billing-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const bundle=await build({stdin:{contents:"export {SubscriptionCheckout} from './app/billing-controls';export {PolicyLinks} from './app/policy-links';export {OwnerInvoiceEmailSetup} from './app/owner/invoice-email-setup';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'}),entry=join(temp,'views.mjs');writeFileSync(entry,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(entry).href);

test('public policies include all four roles, practical financial rules, fraud review, inactivity and actual privacy flows',()=>{
 for(const [title,path] of policyLinks){const html=renderMarketingDocument(path,'');assert.ok(html);assert.match(html,new RegExp(title.replace('&','(?:&amp;|&)')));assert.ok(html.includes(legalVersion));assert.match(html,/href="\/terms-and-conditions"/);assert.match(html,/href="\/privacy-policy"/);assert.match(html,/href="\/contact"/);}
 const terms=renderMarketingDocument('/terms-and-conditions','');for(const role of ['Brands','Affiliates','Creators','Agencies'])assert.ok(terms.includes(role));
 const payment=renderMarketingDocument('/payment-policy','');assert.match(payment,/renew/);assert.match(payment,/Canceling a subscription/);assert.match(payment,/Refunds/);assert.match(payment,/separate/);
 const account=renderMarketingDocument('/account-policy','');assert.match(account,/does not charge an inactivity fee/);assert.match(account,/continues until properly canceled/);
 const privacy=renderMarketingDocument('/privacy-policy','');for(const label of ['Application security information','Identity review','90 days','Supabase','Cloudflare','Stripe','Resend','Your choices and requests'])assert.ok(privacy.includes(label));assert.match(renderMarketingDocument('/data-and-privacy',''),/PRIVACY POLICY/);
});
test('a fresh payment review has linked policies, an unchecked required acceptance and a disabled payment button',()=>{
 const html=renderToStaticMarkup(createElement(views.SubscriptionCheckout,{enabled:true,pending:false,embedded:true,planName:'Agency Starter',initialQuote:{amount:3900,currency:'USD',interval:'month',mode:'live',reviewToken:'FIXTURE_REVIEW_TOKEN',expiresAt:'2026-12-01T12:00:00.000Z',policyVersion:legalVersion}}));
 for(const href of ['/terms-and-conditions','/payment-policy','/privacy-policy'])assert.ok(html.includes('href="'+href+'"'));assert.match(html,/name="confirmed"/);assert.match(html,/required=""/);assert.ok(!html.includes('checked=""'));assert.match(html,/disabled="">Continue to secure payment/);assert.match(html,/renewing monthly until canceled/);assert.match(html,/Apple Pay/);assert.ok(!html.includes('>PayPal<'));
});
test('policy navigation is available in portals and owner links resolve on the public host',()=>{
 const standard=renderToStaticMarkup(createElement(views.PolicyLinks));assert.match(standard,/href="\/terms-and-conditions"/);assert.match(standard,/Privacy Policy/);
 const owner=renderToStaticMarkup(createElement(views.PolicyLinks,{publicSite:true}));assert.match(owner,/href="https:\/\/affimaro.com\/privacy-policy"/);assert.ok(!owner.includes('admin.affimaro.com'));
});
test('owner invoice email setup reports missing credentials honestly and saving is separate from sending',()=>{
 const html=renderToStaticMarkup(createElement(views.OwnerInvoiceEmailSetup,{state:{configured:false,enabled:false,revision:0,sender:'Affimaro <noreply@affimaro.com>',pending:0,failed:0,review:0}}));assert.match(html,/Sending key needed/);assert.match(html,/Saving sends no email/);assert.match(html,/type="password"/);assert.ok(!html.includes('delivery successful'));
});
