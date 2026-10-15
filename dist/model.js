// Browser-local sample data. This module does not track real store activity.
export const VERSION = 1;
export const clone = value => structuredClone(value);
export const commission = order => Math.round((order.amountCents - order.refundedCents) * order.rate / 100);
const fail = message => { throw new Error(message); };
const today = () => new Date().toISOString().slice(0, 10);

export function initialState() {
  const affiliates = [
    {id:'sofia', name:'Sofia Bennett', email:'sofia@example.com', channel:'Content creator', status:'approved', clicks:94, color:'lilac'},
    {id:'alex', name:'Alex Rivera', email:'alex@example.com', channel:'Newsletter', status:'approved', clicks:82, color:'peach'},
    {id:'maya', name:'Maya Chen', email:'maya@example.com', channel:'Content creator', status:'approved', clicks:68, color:'mint'},
    {id:'jordan', name:'Jordan Ellis', email:'jordan@example.com', channel:'Community', status:'approved', clicks:41, color:'blue'},
    {id:'leo', name:'Leo Brooks', email:'leo@example.com', channel:'Blog', status:'pending', clicks:0, color:'yellow'},
  ];
  const rows = [
    ['ORD-1041','2026-10-06','sofia',24000,0,'paid'],
    ['ORD-1042','2026-10-07','alex',32000,0,'paid'],
    ['ORD-1043','2026-10-08','maya',18000,0,'approved'],
    ['ORD-1044','2026-10-09','sofia',46000,6000,'approved'],
    ['ORD-1045','2026-10-10','jordan',12900,0,'approved'],
    ['ORD-1046','2026-10-11','alex',68000,0,'pending'],
    ['ORD-1047','2026-10-12','sofia',21000,0,'pending'],
    ['ORD-1048','2026-10-13','maya',35000,0,'approved'],
    ['ORD-1049','2026-10-14','jordan',15000,15000,'cancelled'],
  ];
  return {
    version:VERSION,
    program:{name:'Store partners',rate:10,cookieDays:30,active:true},
    affiliates,
    orders:rows.map(([id,date,affiliateId,amountCents,refundedCents,status])=>({id,date,affiliateId,amountCents,refundedCents,status,rate:10})),
    payouts:[
      {id:'PAY-0101',affiliateId:'sofia',amountCents:2400,date:'2026-10-08',method:'Bank transfer',reference:'Sample transfer 01',orderIds:['ORD-1041']},
      {id:'PAY-0102',affiliateId:'alex',amountCents:3200,date:'2026-10-09',method:'Bank transfer',reference:'Sample transfer 02',orderIds:['ORD-1042']},
    ],
  };
}

export function validState(state) {
  if (!state || state.version !== VERSION || !Array.isArray(state.affiliates) || !Array.isArray(state.orders) || !Array.isArray(state.payouts)) return false;
  const p = state.program;
  if (!p || typeof p.name !== 'string' || !Number.isFinite(p.rate) || p.rate < 1 || p.rate > 50 || !Number.isInteger(p.cookieDays) || p.cookieDays < 1 || p.cookieDays > 90 || typeof p.active !== 'boolean') return false;
  const ids = new Set();
  for (const a of state.affiliates) {
    if (!a || typeof a.id !== 'string' || ids.has(a.id) || typeof a.name !== 'string' || typeof a.email !== 'string' || typeof a.channel !== 'string' || !['approved','pending','suspended'].includes(a.status) || !Number.isSafeInteger(a.clicks) || a.clicks < 0) return false;
    ids.add(a.id);
  }
  const orderIds = new Set();
  for (const o of state.orders) {
    if (!o || typeof o.id !== 'string' || orderIds.has(o.id) || !ids.has(o.affiliateId) || !Number.isSafeInteger(o.amountCents) || o.amountCents <= 0 || !Number.isSafeInteger(o.refundedCents) || o.refundedCents < 0 || o.refundedCents > o.amountCents || !Number.isFinite(o.rate) || o.rate < 1 || o.rate > 50 || !['pending','approved','paid','cancelled'].includes(o.status) || typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
    orderIds.add(o.id);
  }
  return state.payouts.every(p=>p && typeof p.id==='string' && ids.has(p.affiliateId) && Number.isSafeInteger(p.amountCents) && p.amountCents>0 && typeof p.reference==='string' && typeof p.method==='string' && typeof p.date==='string' && Array.isArray(p.orderIds) && p.orderIds.every(id=>orderIds.has(id)));
}

export function summary(state, affiliateId = null) {
  const orders = affiliateId ? state.orders.filter(o=>o.affiliateId === affiliateId) : state.orders;
  const affiliates = affiliateId ? state.affiliates.filter(a=>a.id === affiliateId) : state.affiliates;
  const revenue = orders.reduce((sum,o)=>sum+o.amountCents-o.refundedCents,0);
  const totalCommission = orders.reduce((sum,o)=>sum+commission(o),0);
  const byStatus = status => orders.filter(o=>o.status===status).reduce((sum,o)=>sum+commission(o),0);
  const clicks = affiliates.reduce((sum,a)=>sum+a.clicks,0);
  const sales = orders.filter(o=>o.status!=='cancelled').length;
  return {revenue,totalCommission,pending:byStatus('pending'),approved:byStatus('approved'),paid:byStatus('paid'),clicks,sales,active:affiliates.filter(a=>a.status==='approved').length,conversion:clicks ? sales/clicks*100 : 0};
}

export function createOrder(state, input) {
  const id = String(input.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(id)) fail('Use 2–32 letters, numbers, hyphens or underscores for the order ID.');
  if (state.orders.some(o=>o.id.toLowerCase()===id.toLowerCase())) fail('That order ID already exists. The duplicate was not added.');
  if (!state.program.active) fail('Activate the program before adding a sample sale.');
  const affiliate = state.affiliates.find(a=>a.id===input.affiliateId);
  if (!affiliate || affiliate.status!=='approved') fail('Choose an approved affiliate.');
  if (!Number.isInteger(input.referralAgeDays) || input.referralAgeDays < 0 || input.referralAgeDays > state.program.cookieDays) fail('The referral is outside this program’s attribution window.');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents<=0 || input.amountCents>100000000) fail('Enter a valid sale amount between $0.01 and $1,000,000.');
  state.orders.push({id,affiliateId:affiliate.id,amountCents:input.amountCents,refundedCents:0,status:'pending',rate:state.program.rate,date:today()});
  affiliate.clicks += 1;
  return state.orders.at(-1);
}

export function approveOrder(state, id) {
  const o = state.orders.find(o=>o.id===id);
  if (!o || o.status!=='pending') fail('Only pending commissions can be approved.');
  o.status='approved';
}

export function refundOrder(state, id, amountCents) {
  const o = state.orders.find(o=>o.id===id);
  if (!o || !['pending','approved'].includes(o.status)) fail('This demo can refund unpaid orders only.');
  if (!Number.isSafeInteger(amountCents) || amountCents<=0 || amountCents>o.amountCents-o.refundedCents) fail('The refund must be positive and no greater than the remaining sale amount.');
  o.refundedCents += amountCents;
  if(o.refundedCents===o.amountCents) o.status='cancelled';
}

export function recordPayout(state, affiliateId, method, reference) {
  const orders = state.orders.filter(o=>o.affiliateId===affiliateId && o.status==='approved');
  const amountCents = orders.reduce((sum,o)=>sum+commission(o),0);
  if(amountCents<=0) fail('There are no approved commissions to record for this affiliate.');
  if(!['Bank transfer','External wallet','Cash','Other'].includes(method)) fail('Choose a payment method.');
  if(!String(reference).trim() || String(reference).trim().length>100) fail('Add a payment reference of up to 100 characters.');
  const payout = {id:`PAY-${String(state.payouts.length+101).padStart(4,'0')}`,affiliateId,amountCents,date:today(),method,reference:String(reference).trim(),orderIds:orders.map(o=>o.id)};
  orders.forEach(o=>o.status='paid');
  state.payouts.push(payout);
  return payout;
}

export function updateProgram(state, input) {
  const name = String(input.name||'').trim();
  if(name.length<2 || name.length>60) fail('Use a program name between 2 and 60 characters.');
  if(!Number.isFinite(input.rate) || input.rate<1 || input.rate>50 || Math.abs(input.rate*100-Math.round(input.rate*100))>0.000001) fail('Set a commission between 1% and 50%, with up to two decimal places.');
  if(!Number.isInteger(input.cookieDays) || input.cookieDays<1 || input.cookieDays>90) fail('Set an attribution window between 1 and 90 days.');
  state.program={name,rate:input.rate,cookieDays:input.cookieDays,active:!!input.active};
}

export function addAffiliate(state, input) {
  const name=String(input.name||'').trim();
  const email=String(input.email||'').trim().toLowerCase();
  const channel=String(input.channel||'').trim();
  if(name.length<2 || name.length>60) fail('Use a name between 2 and 60 characters.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>120) fail('Enter a valid sample email address.');
  if(state.affiliates.some(a=>a.email.toLowerCase()===email)) fail('An affiliate with that email already exists.');
  if(!['Content creator','Newsletter','Community','Blog','Other'].includes(channel)) fail('Choose a channel.');
  let id='partner-'+(state.affiliates.length+1);
  while(state.affiliates.some(a=>a.id===id)) id+='x';
  const affiliate={id,name,email,channel,status:'pending',clicks:0,color:['lilac','peach','mint','blue','yellow'][state.affiliates.length%5]};
  state.affiliates.push(affiliate);
  return affiliate;
}

export function setAffiliateStatus(state, id, status) {
  const a=state.affiliates.find(a=>a.id===id);
  if(!a || !['approved','suspended'].includes(status)) fail('Choose a valid affiliate and status.');
  a.status=status;
}
