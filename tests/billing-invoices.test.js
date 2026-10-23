import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionInvoices,invoicePdfUrl} from '../lib/billing-invoices.ts';
import {AppError} from '../lib/service.ts';

const scope={customerId:'cus_INVOICEOWNER123',subscriptionId:'sub_INVOICEOWNER123',mode:'live'};
const raw=(changes={})=>({id:'in_INVOICEOWNER123',object:'invoice',livemode:true,customer:scope.customerId,currency:'usd',parent:{type:'subscription_details',subscription_details:{subscription:scope.subscriptionId}},number:'AFF-0001',created:1780000000,status:'paid',total:1900,amount_paid:1900,amount_remaining:0,status_transitions:{paid_at:1780000001},invoice_pdf:'https://pay.stripe.com/invoice/acct_PLATFORM123/PRIVATE_LINK/pdf?s=ap',customer_email:'private@example.com',customer_address:{line1:'Private address'},metadata:{private_note:'SECRET_NOTE'},hosted_invoice_url:'https://invoice.stripe.com/i/PRIVATE_PAYMENT_LINK',...changes});
const list=(rows,has_more=false)=>({object:'list',data:rows,has_more});
const fails=status=>error=>error instanceof AppError&&error.status===status;

test('invoice history projects only display fields, exact minor units and validated PDF links',()=>{
 const result=subscriptionInvoices(list([raw(),raw({id:'in_SECONDINVOICE123',number:null,created:1780000100,status:'open',total:7900,amount_paid:2000,amount_remaining:5900,status_transitions:{paid_at:null},invoice_pdf:null})],true),scope);
 assert.equal(result.mode,'live');assert.equal(result.hasMore,true);assert.deepEqual(result.invoices.map(row=>row.id),['in_SECONDINVOICE123','in_INVOICEOWNER123']);
 assert.deepEqual(result.invoices[1],{id:'in_INVOICEOWNER123',number:'AFF-0001',created:1780000000,status:'paid',total:1900,amountPaid:1900,balance:0,paidAt:1780000001,pdfUrl:raw().invoice_pdf});
 for(const secret of ['private@example.com','Private address','SECRET_NOTE','PRIVATE_PAYMENT_LINK',scope.customerId,scope.subscriptionId])assert.ok(!JSON.stringify(result).includes(secret));
});
test('invoice history rejects another customer, subscription, mode or non-subscription invoice',()=>{
 for(const change of [{customer:'cus_SOMEONEELSE123'},{livemode:false},{parent:{type:'subscription_details',subscription_details:{subscription:'sub_SOMEONEELSE123'}}},{parent:null},{parent:{type:'quote_details',quote_details:{quote:'qt_OTHER123'}}}])assert.throws(()=>subscriptionInvoices(list([raw(change)]),scope),e=>e instanceof AppError&&[409,502].includes(e.status));
 assert.throws(()=>subscriptionInvoices(list([raw(),raw()]),scope),fails(409));
 assert.equal(subscriptionInvoices(list([raw({livemode:false})]),{...scope,mode:'test'}).mode,'test');
});
test('malformed or oversized invoice lists fail closed while valid zero totals, credits and empty history remain visible',()=>{
 for(const change of [{currency:'eur'},{status:'unknown'},{total:1.2},{amount_paid:-1},{created:0},{total:Number.MAX_SAFE_INTEGER+1},{invoice_pdf:undefined}])assert.throws(()=>subscriptionInvoices(list([raw(change)]),scope),fails(502));
 assert.throws(()=>subscriptionInvoices(list(Array.from({length:11},(_,i)=>raw({id:'in_INVOICE'+i+'123456'}))),scope),fails(502));
 assert.deepEqual(subscriptionInvoices(list([]),scope),{mode:'live',invoices:[],hasMore:false});
 for(const [total,balance] of [[0,0],[-1900,-1900]])assert.equal(subscriptionInvoices(list([raw({total,amount_paid:0,amount_remaining:balance})]),scope).invoices[0].total,total);
});
test('invoice PDF links cannot open payment pages, other hosts, credentials or non-HTTPS locations',()=>{
 assert.equal(invoicePdfUrl(raw().invoice_pdf),raw().invoice_pdf);
 for(const url of ['javascript:alert(1)','http://pay.stripe.com/invoice/a/pdf','https://pay.stripe.com.evil.example/invoice/a/pdf','https://pay.stripe.com@evil.example/invoice/a/pdf','https://user:password@pay.stripe.com/invoice/a/pdf','https://pay.stripe.com:444/invoice/a/pdf','https://invoice.stripe.com/i/a','https://pay.stripe.com/invoice/a/pay','https://pay.stripe.com/invoice/a/pdf#secret','https://pay.stripe.com/invoice/a/%2e%2e/pdf','/invoice/a/pdf']){
  assert.equal(invoicePdfUrl(url),null,url);assert.equal(subscriptionInvoices(list([raw({invoice_pdf:url})]),scope).invoices[0].pdfUrl,null);
 }
 assert.equal(subscriptionInvoices(list([raw({status:'draft'})]),scope).invoices[0].pdfUrl,null);
});
