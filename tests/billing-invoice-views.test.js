import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'invoice-views-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const bundle=await build({stdin:{contents:"export {InvoiceHistory,InvoiceEntries} from './app/billing-invoices';",resolveDir:root,loader:'tsx'},write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'}),entry=join(temp,'views.mjs');writeFileSync(entry,bundle.outputFiles[0].contents);const views=await import(pathToFileURL(entry).href);
const invoice={id:'in_VIEWINVOICE123',number:'AFF-0001',created:1780000000,status:'paid',total:3900,amountPaid:3900,balance:0,paidAt:1780000001,pdfUrl:'https://pay.stripe.com/invoice/acct_FIXTURE123/PRIVATE_LINK/pdf?s=ap'};
const render=history=>renderToStaticMarkup(createElement(views.InvoiceEntries,{history:{mode:'live',hasMore:false,invoices:[invoice],...history}}));

test('invoice entries render exact totals, status, UTC dates and safe PDF navigation',()=>{
 const html=render({});for(const label of ['AFF-0001','Invoice total','Amount paid','Balance','$39.00 USD','$0.00 USD','Paid','UTC','Open invoice PDF'])assert.ok(html.includes(label));
 for(const attribute of ['target="_blank"','rel="noopener noreferrer"','referrerPolicy="no-referrer"'])assert.ok(html.includes(attribute));assert.match(html,/opens in a new tab/);assert.ok(!html.includes('Pay now'));
});
test('invoice display distinguishes drafts, open balances, void invoices and test mode without implying paid access',()=>{
 for(const status of ['draft','open','uncollectible','void']){const html=render({mode:'test',invoices:[{...invoice,status,amountPaid:0,balance:status==='void'?0:3900,paidAt:null,pdfUrl:null}]});assert.match(html,/Test invoices/);assert.ok(!html.includes('Open invoice PDF'));assert.ok(!html.includes('Paid May'));assert.match(html,/Amount paid/);assert.match(html,status==='draft'?/after this invoice is finalized/:/No PDF is available/);}
 const empty=render({invoices:[]});assert.match(empty,/No invoices were returned/);const more=render({hasMore:true});assert.match(more,/Showing 1 recent invoice for/);assert.match(more,/previous subscriptions/);
});
test('the billing invoice card explains unavailable history and requests recent invoices only when a subscription exists',()=>{
 const unavailable=renderToStaticMarkup(createElement(views.InvoiceHistory,{available:false}));assert.match(unavailable,/after your subscription is recorded/);assert.ok(!unavailable.includes('<button'));
 const available=renderToStaticMarkup(createElement(views.InvoiceHistory,{available:true}));assert.match(available,/View recent invoices/);assert.match(available,/separate from partner commissions/);assert.ok(!available.includes('PRIVATE_LINK'));
});
