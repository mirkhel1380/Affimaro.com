import {initialState,validState,summary,commission,createOrder,approveOrder,refundOrder,recordPayout,updateProgram,addAffiliate,setAffiliateStatus} from './model.js';

const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const brand = () => `<a class="brand" href="#" aria-label="Affimaro home"><span class="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 22V13a8 8 0 0 1 16 0v9M8 17h16M16 17v8"/></svg></span><span>affimaro<span class="brand-period">.</span></span></a>`;
const usd = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money = cents => usd.format(cents/100);
const number = value => new Intl.NumberFormat('en-US').format(value);
const dateLabel = value => new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'2-digit',timeZone:'UTC'});
const initials = name => name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
const avatar = a => `<span class="avatar ${['lilac','peach','mint','blue','yellow'].includes(a.color)?a.color:'lilac'}">${esc(initials(a.name))}</span>`;
const badge = (status, label=status[0].toUpperCase()+status.slice(1)) => `<span class="status-badge status-${esc(status)}">${esc(label)}</span>`;
const storageKey = 'affimaro.demo.v1';
let state = initialState();
try {const stored=JSON.parse(localStorage.getItem(storageKey));if(validState(stored)) state=stored;} catch { /* Use the sample when storage is unavailable or invalid. */ }
let role='merchant',view='overview',selectedAffiliate='sofia',chartRange='all';
let affiliateSearch='',affiliateFilter='all',orderSearch='',orderFilter='all';
let toastTimer;
const merchantViews={overview:['Overview','grid'],affiliates:['Affiliates','users'],programs:['Programs','link'],transactions:['Transactions','chart'],payments:['Payments','wallet'],integration:['Integration','plug']};
const affiliateViews={overview:['Overview','grid'],link:['My referral link','link'],earnings:['Earnings','chart'],payouts:['Payment history','wallet']};
const findAffiliate=id=>state.affiliates.find(a=>a.id===id);
const currentAffiliate=()=>findAffiliate(selectedAffiliate)||state.affiliates[0];
const affiliateLink=a=>`https://store.example/?ref=${encodeURIComponent(a.id)}`;
const ownOrders=()=>state.orders.filter(o=>o.affiliateId===currentAffiliate().id);
const newest=orders=>[...orders].reverse();

function toast(message) {
  const el=$('#toast');el.textContent=message;el.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4200);
}
function save() {
  try {localStorage.setItem(storageKey,JSON.stringify(state));return true;} catch {toast('Changes work for this session. Browser storage is unavailable.');return false;}
}
function stat(label,value,foot,name,highlight=false) {
  return `<article class="stat-card ${highlight?'highlight':''}"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(name)}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
function heading(title,description,actions='') {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`;
}
function exportButton(){return `<button class="btn btn-white" data-action="export">${icon('download')} Export CSV</button>`;}
function saleButton(){return `<button class="btn btn-dark" data-action="open-sale">${icon('plus')} Sample sale</button>`;}
function affiliateSelect() {
  return `<label><span class="small-label" hidden>Sample affiliate</span><select class="context-select" id="affiliate-person" aria-label="Select a sample affiliate">${state.affiliates.map(a=>`<option value="${esc(a.id)}" ${a.id===currentAffiliate().id?'selected':''}>${esc(a.name)}${a.status!=='approved'?' · '+esc(a.status):''}</option>`).join('')}</select></label>`;
}
function renderApp() {
  const views=role==='merchant'?merchantViews:affiliateViews;
  const person=currentAffiliate();
  const pending=state.affiliates.filter(a=>a.status==='pending').length;
  $('#app').innerHTML=`<div class="app-shell"><button class="sidebar-overlay" data-action="toggle-sidebar" aria-label="Close navigation"></button><aside class="sidebar" aria-label="Workspace navigation"><div class="sidebar-brand">${brand()}</div><div class="workspace-switch"><span class="store-avatar">${role==='merchant'?'N':esc(initials(person.name))}</span><span>${role==='merchant'?'Northline Store':esc(person.name)}<small>${role==='merchant'?'Sample business':'Sample affiliate'}</small></span></div><div class="nav-label">${role==='merchant'?'BUSINESS WORKSPACE':'PARTNER WORKSPACE'}</div><nav class="app-nav" id="workspace-nav">${Object.entries(views).map(([key,[label,name]])=>`<a href="#/demo/${role}/${key}" class="${key===view?'active':''}" ${key===view?'aria-current="page"':''}>${icon(name)}<span>${label}</span>${key==='affiliates'&&pending?`<span class="nav-count">${pending}</span>`:''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-note"><div class="small-label">A WORKSPACE TO EXPLORE</div><p>Try the flow with sample data. Open your account from the website to use saved profiles and programs.</p></div><a href="#" class="sidebar-home">${icon('arrow')} Back to website</a><div class="sidebar-credit">A product of <strong>Highlink</strong></div></div></aside><div class="app-content"><header class="app-topbar"><button class="icon-button mobile-sidebar-toggle" data-action="toggle-sidebar" aria-label="Open workspace navigation" aria-expanded="false" aria-controls="workspace-nav">${icon('menu')}</button><div class="breadcrumb"><span class="breadcrumb-workspace">${role==='merchant'?'Workspace':'Affiliate portal'}</span><span class="crumb-line">/</span><span>${views[view][0]}</span></div><div class="topbar-actions"><label class="role-select"><span>Demo role</span><select id="demo-role" aria-label="Switch demo role"><option value="merchant" ${role==='merchant'?'selected':''}>Business demo</option><option value="affiliate" ${role==='affiliate'?'selected':''}>Affiliate demo</option></select></label><span class="topbar-avatar">${role==='merchant'?'NS':esc(initials(person.name))}</span></div></header><div class="app-page" id="app-main" tabindex="-1"><div class="demo-banner"><span>${icon('info')} Interactive demo · Sample data stays in this browser.</span><button data-action="reset">${icon('refresh')} Reset demo</button></div><div id="workspace-content">${role==='merchant'?merchantPage():affiliatePage()}</div><div class="page-footnote">Affimaro · A product of Highlink · USD sample currency</div></div></div></div>`;
}
function route() {
  const match=location.hash.match(/^#\/demo\/(merchant|affiliate)(?:\/([a-z-]+))?$/);
  const isApp=!!match;
  $('#website').hidden=isApp;$('#site-header').hidden=isApp;$('#app').hidden=!isApp;
  document.body.classList.toggle('app-mode',isApp);
  if(isApp){role=match[1];const allowed=role==='merchant'?merchantViews:affiliateViews;view=allowed[match[2]]?match[2]:'overview';renderApp();document.title=`${allowed[view][0]} · Affimaro demo`;window.scrollTo(0,0);}
  else{document.title='Affimaro — Make every referral count';$('#main-nav').classList.remove('open');$('.mobile-nav-toggle').setAttribute('aria-expanded','false');}
  if($('#modal').open) $('#modal').close();
}

function chartCard(affiliateId=null) {
  const orders=affiliateId?state.orders.filter(o=>o.affiliateId===affiliateId):state.orders;
  let dates=[...new Set(orders.map(o=>o.date))].sort();
  if(chartRange==='last7') dates=dates.slice(-7);
  const values=dates.map(date=>orders.filter(o=>o.date===date).reduce((sum,o)=>sum+o.amountCents-o.refundedCents,0));
  const max=Math.max(10000,Math.ceil(Math.max(...values,0)/10000)*10000);
  const points=values.map((v,i)=>[dates.length>1?i/(dates.length-1)*500:250,8+(1-v/max)*150]);
  const line=points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area=points.length?`${line} L${points.at(-1)[0].toFixed(1)} 165 L${points[0][0].toFixed(1)} 165 Z`:'';
  return `<section class="panel"><div class="panel-head"><div><h2>Referral performance</h2><p>Daily net sales · sample dates</p></div><select class="context-select" id="chart-range" aria-label="Chart date range"><option value="all" ${chartRange==='all'?'selected':''}>All sample dates</option><option value="last7" ${chartRange==='last7'?'selected':''}>Latest 7 dates</option></select></div>${dates.length?`<div class="chart-wrap"><div class="chart-body"><div class="chart-axis"><span>${money(max).replace('.00','')}</span><span>${money(max/2).replace('.00','')}</span><span>$0</span></div><svg class="chart-svg" viewBox="0 0 500 170" preserveAspectRatio="none" role="img" aria-label="Net referred sales by sample date"><defs><linearGradient id="demo-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b8d594" stop-opacity=".55"/><stop offset="100%" stop-color="#d6e8b9" stop-opacity=".07"/></linearGradient></defs><path d="M0 8H500M0 83H500M0 158H500" class="chart-grid"/><path d="${area}" fill="url(#demo-chart-fill)"/><path d="${line}" fill="none" stroke="#85a361" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${points.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="3" fill="#85a361" stroke="#fff" stroke-width="1.5"><title>${esc(dateLabel(dates[i]))}: ${money(values[i])} net sales</title></circle>`).join('')}</svg></div><div class="chart-labels">${dates.filter((_,i)=>dates.length<=7||i===0||i===dates.length-1||i%Math.ceil(dates.length/5)===0).map(d=>`<span>${dateLabel(d)}</span>`).join('')}</div></div>`:`<div class="empty-state">No sample sales yet.</div>`}<div class="chart-legend"><span><span class="status-dot"></span> Net referred sales</span><strong>${money(values.reduce((a,b)=>a+b,0))} in chart</strong></div></section>`;
}

function topPartnersCard() {
  const ranked=state.affiliates.map(a=>({a,s:summary(state,a.id)})).filter(p=>p.s.sales>0).sort((a,b)=>b.s.revenue-a.s.revenue).slice(0,4);
  return `<section class="panel"><div class="panel-head"><div><h2>Top partners</h2><p>By net referred sales</p></div>${icon('users')}</div><div class="partner-list">${ranked.map(({a,s})=>`<div class="partner-line">${avatar(a)}<div class="partner-name">${esc(a.name)}<small>${esc(a.channel)}</small></div><div class="partner-revenue">${money(s.revenue)}<small>${s.sales} sales</small></div></div>`).join('')}</div><a class="panel-bottom-link" href="#/demo/merchant/affiliates">See all affiliates ${icon('arrow')}</a></section>`;
}
function orderRows(orders,mode='merchant') {
  if(!orders.length) return `<tr><td class="empty-state" colspan="${mode==='merchant'?7:5}">No sample orders match this view.</td></tr>`;
  return orders.map(o=>{const a=findAffiliate(o.affiliateId);return `<tr><td class="primary-cell">${esc(o.id)}${mode==='merchant'?`<span class="cell-secondary">${dateLabel(o.date)}</span>`:''}</td>${mode==='merchant'?`<td><div class="person-cell">${avatar(a)}<span>${esc(a.name)}</span></div></td>`:`<td>${dateLabel(o.date)}</td>`}<td>${money(o.amountCents-o.refundedCents)}${o.refundedCents?`<span class="cell-secondary">${money(o.refundedCents)} refunded</span>`:''}</td><td class="primary-cell">${money(commission(o))}<span class="cell-secondary">${o.rate}% rate</span></td><td>${badge(o.status)}</td>${mode==='merchant'?`<td>${o.status==='pending'?`<button class="table-action" data-action="approve-order" data-id="${esc(o.id)}" aria-label="Approve commission for ${esc(o.id)}">Approve</button>`:o.status==='approved'?'<span class="cell-secondary">Ready for payment</span>':o.status==='paid'?'<span class="cell-secondary">Payment recorded</span>':'<span class="cell-secondary">Fully refunded</span>'}</td><td>${['pending','approved'].includes(o.status)?`<button class="table-action refund" data-action="refund" data-id="${esc(o.id)}" aria-label="Refund ${esc(o.id)}">Refund</button>`:'—'}</td>`:''}</tr>`;}).join('');
}
function orderTable(orders,mode='merchant',tbodyId='') {
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>ORDER</th><th>${mode==='merchant'?'AFFILIATE':'DATE'}</th><th>NET SALE</th><th>COMMISSION</th><th>STATUS</th>${mode==='merchant'?'<th>REVIEW</th><th>REFUND</th>':''}</tr></thead><tbody ${tbodyId?`id="${tbodyId}"`:''}>${orderRows(orders,mode)}</tbody></table></div>`;
}

function merchantPage() {
  const s=summary(state);
  if(view==='overview') return `${heading('Growth, at a glance.','A clear picture of your sample affiliate program.',saleButton())}<div class="stat-grid">${stat('Referred revenue',money(s.revenue),`${number(s.sales)} attributed sales · net of refunds`,'chart')}${stat('Commission to pay',money(s.approved),`${money(s.pending)} awaiting approval`,'wallet',true)}${stat('Active affiliates',number(s.active),`${state.affiliates.filter(a=>a.status==='pending').length} applications to review`,'users')}${stat('Referral clicks',number(s.clicks),`${s.conversion.toFixed(1)}% sample conversion rate`,'pointer')}</div><div class="overview-grid">${chartCard()}${topPartnersCard()}<section class="panel span-full"><div class="panel-head"><div><h2>Recent transactions</h2><p>Review a sale, then approve its commission.</p></div><a class="text-link" href="#/demo/merchant/transactions">View all ${icon('arrow')}</a></div>${orderTable(newest(state.orders).slice(0,4))}</section></div>`;
  if(view==='affiliates') return `${heading('Your growth partners.','Review applications and see how each affiliate is doing.',`<button class="btn btn-white" data-action="export">${icon('download')} Export CSV</button><button class="btn btn-dark" data-action="open-affiliate">${icon('plus')} Add sample affiliate</button>`)}<section class="panel"><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="affiliate-search" type="search" placeholder="Search affiliates" aria-label="Search affiliates" value="${esc(affiliateSearch)}"></label><select id="affiliate-filter" aria-label="Filter affiliates by status">${['all','approved','pending','suspended'].map(v=>`<option value="${v}" ${affiliateFilter===v?'selected':''}>${v==='all'?'All affiliates':v[0].toUpperCase()+v.slice(1)}</option>`).join('')}</select></div><div class="table-scroll"><table class="data-table"><thead><tr><th>AFFILIATE</th><th>CHANNEL</th><th>CLICKS</th><th>NET SALES</th><th>TO PAY</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody id="affiliate-rows">${affiliateRows()}</tbody></table></div><div class="table-caption" id="affiliate-caption">${affiliateCaption()}</div></section>`;
  if(view==='transactions') return `${heading('Every sale, connected.','Sample orders with rate snapshots, refunds and commission states.',exportButton()+saleButton())}<section class="panel"><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="order-search" type="search" placeholder="Search orders or partners" aria-label="Search transactions" value="${esc(orderSearch)}"></label><select id="order-filter" aria-label="Filter transactions by status">${['all','pending','approved','paid','cancelled'].map(v=>`<option value="${v}" ${orderFilter===v?'selected':''}>${v==='all'?'All statuses':v[0].toUpperCase()+v.slice(1)}</option>`).join('')}</select></div>${orderTable(filteredOrders(),'merchant','order-rows')}<div class="table-caption" id="order-caption">${orderCaption()}</div></section><div class="info-note" style="margin-top:20px">${icon('info')}<span>Commission is based on the sale amount after refunds. Each order keeps the rate that applied when it was created. This demo supports refunds on unpaid orders.</span></div>`;
  if(view==='programs') return `${heading('A program on your terms.','Edit the sample rules. Existing orders keep their original commission rate.') }<div class="two-columns"><section class="panel"><div class="panel-head"><h2>${esc(state.program.name)}</h2>${badge(state.program.active?'approved':'suspended',state.program.active?'Active':'Paused')}</div><form id="form-program" class="settings-body"><div class="form-error" id="program-error" tabindex="-1" role="alert"></div><div class="form-field"><label for="program-name">Program name</label><input id="program-name" name="name" minlength="2" maxlength="60" required value="${esc(state.program.name)}"></div><div class="form-grid"><div class="form-field"><label for="program-rate">Commission rate (%)</label><input id="program-rate" name="rate" type="number" min="1" max="50" step="0.01" required value="${state.program.rate}"><small>Applied to net merchandise sales.</small></div><div class="form-field"><label for="program-window">Attribution window (days)</label><input id="program-window" name="cookieDays" type="number" min="1" max="90" step="1" required value="${state.program.cookieDays}"><small>Maximum referral age for sample sales.</small></div></div><label class="toggle-field"><span>Program active<small>Allow approved affiliates to create sample sales.</small></span><input name="active" type="checkbox" ${state.program.active?'checked':''} aria-label="Program active"></label><button type="submit" class="btn btn-dark">Save sample rules ${icon('check')}</button></form></section><section class="panel"><div class="panel-head"><h2>How these rules work</h2></div><ul class="rule-list"><li>${icon('clock')}<span><strong>Referral window</strong>A referral must fall within ${state.program.cookieDays} days in the sample sale form.</span></li><li>${icon('chart')}<span><strong>Rate snapshot</strong>New sample orders use ${state.program.rate}%. Existing orders stay at their original rate.</span></li><li>${icon('refresh')}<span><strong>Refunds affect commission</strong>Partial refunds reduce it; a full refund cancels it.</span></li><li>${icon('shield')}<span><strong>Manual review</strong>Commissions begin as pending. Approve them before recording payment.</span></li></ul></section></div>`;
  if(view==='payments') return paymentsPage();
  return integrationPage();
}
function filteredAffiliates() {
  const term=affiliateSearch.trim().toLowerCase();
  return state.affiliates.filter(a=>(affiliateFilter==='all'||a.status===affiliateFilter)&&(!term||`${a.name} ${a.email} ${a.channel}`.toLowerCase().includes(term)));
}
function affiliateRows() {
  const rows=filteredAffiliates();
  return rows.length?rows.map(a=>{const s=summary(state,a.id);return `<tr><td class="primary-cell"><div class="person-cell">${avatar(a)}<span>${esc(a.name)}<small>${esc(a.email)}</small></span></div></td><td>${esc(a.channel)}</td><td>${number(a.clicks)}</td><td>${money(s.revenue)}<span class="cell-secondary">${s.sales} sales</span></td><td>${money(s.approved)}</td><td>${badge(a.status)}</td><td><button class="table-action" data-action="affiliate-status" data-id="${esc(a.id)}" data-status="${a.status==='approved'?'suspended':'approved'}" aria-label="${a.status==='approved'?'Suspend':'Approve'} ${esc(a.name)}">${a.status==='approved'?'Suspend':a.status==='pending'?'Approve':'Reactivate'}</button></td></tr>`;}).join(''):'<tr><td class="empty-state" colspan="7">No affiliates match your search.</td></tr>';
}
function affiliateCaption(){return `${filteredAffiliates().length} of ${state.affiliates.length} sample affiliates · Adding a partner does not send an invitation.`;}
function filteredOrders() {
  const term=orderSearch.trim().toLowerCase();
  return newest(state.orders).filter(o=>(orderFilter==='all'||o.status===orderFilter)&&(!term||`${o.id} ${findAffiliate(o.affiliateId).name}`.toLowerCase().includes(term)));
}
function orderCaption(){return `${filteredOrders().length} of ${state.orders.length} sample orders · No live store is connected.`;}

function paymentsPage() {
  const s=summary(state);
  const due=state.affiliates.map(a=>({a,s:summary(state,a.id)})).filter(p=>p.s.approved>0);
  return `${heading('Pay directly. Keep it clear.','Track commission balances and payments your business has made.',exportButton()+`<button class="btn btn-dark" data-action="open-payment">${icon('plus')} Record payment</button>`)}<div class="payment-note">${icon('info')}<span>Payment records only. Affimaro does not hold money or transfer funds. In this preview, every record is sample data.</span></div><div class="stat-grid">${stat('Approved to pay',money(s.approved),`${due.length} affiliates with approved balances`,'wallet',true)}${stat('Awaiting approval',money(s.pending),'Review these commissions first','clock')}${stat('Payments recorded',money(s.paid),`${state.payouts.length} sample payment records`,'check')}${stat('Total commission',money(s.totalCommission),'Across all sample orders, net of refunds','chart')}</div><div class="stack"><section class="panel"><div class="panel-head"><h2>Approved balances</h2></div><div class="table-scroll"><table class="data-table"><thead><tr><th>AFFILIATE</th><th>APPROVED</th><th>PENDING</th><th>ALREADY RECORDED</th><th>ACTION</th></tr></thead><tbody>${due.length?due.map(({a,s})=>`<tr><td class="primary-cell"><div class="person-cell">${avatar(a)}<span>${esc(a.name)}<small>${esc(a.email)}</small></span></div></td><td class="primary-cell">${money(s.approved)}</td><td>${money(s.pending)}</td><td>${money(s.paid)}</td><td><button class="table-action" data-action="open-payment" data-id="${esc(a.id)}">Record payment</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No approved balances. Approve a sample commission to continue.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Payment history</h2></div>${payoutTable(state.payouts,'merchant')}</section></div>`;
}
function payoutTable(payouts,mode) {
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>RECORD</th>${mode==='merchant'?'<th>AFFILIATE</th>':''}<th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>REFERENCE</th></tr></thead><tbody>${payouts.length?newest(payouts).map(p=>`<tr><td class="primary-cell">${esc(p.id)}</td>${mode==='merchant'?`<td>${esc(findAffiliate(p.affiliateId).name)}</td>`:''}<td>${dateLabel(p.date)}</td><td class="primary-cell">${money(p.amountCents)}</td><td>${esc(p.method)}</td><td>${esc(p.reference)}</td></tr>`).join(''):`<tr><td colspan="${mode==='merchant'?6:5}" class="empty-state">No payment records yet.</td></tr>`}</tbody></table></div>`;
}
function integrationPage() {
  return `${heading('Your store, connected next.','WooCommerce is the first planned integration. No store is connected in this preview.')}<div class="two-columns"><section class="panel"><div class="integration-body"><div class="connect-logo">W</div><h2>WooCommerce</h2><span class="integration-status">${icon('clock')} Planned · not connected</span><p>The next development phase will connect real referral tracking and verified store events to the same workflow you can explore here.</p><ol class="integration-steps"><li><span><strong>Authorize the store connection</strong>Saved accounts are available in the private pilot. Secure store authorization is the next integration step.</span></li><li><span><strong>Track eligible referrals</strong>Store links, consent behavior and attribution rules need to be implemented and tested.</span></li><li><span><strong>Verify order and refund events</strong>Signed store events will update sales and commissions without duplicating orders.</span></li><li><span><strong>Test before launch</strong>Confirm attribution, refunds and account isolation with a pilot store.</span></li></ol><a class="btn btn-dark btn-small" href="#/demo/merchant/transactions">Explore the sample workflow ${icon('arrow')}</a></div></section><section class="panel"><div class="check-roadmap"><h3>What this preview includes</h3><div class="roadmap-item"><span>Business & affiliate interfaces</span><small>Available in demo</small></div><div class="roadmap-item"><span>Sample commission rules</span><small>Available in demo</small></div><div class="roadmap-item"><span>CSV exports</span><small>Available in demo</small></div><div class="roadmap-item"><span>Saved accounts & database</span><small>Private pilot</small></div><div class="roadmap-item"><span>Live WooCommerce tracking</span><small>To be built</small></div><div class="roadmap-item"><span>Software subscriptions</span><small>To be built</small></div><div class="roadmap-item"><span>Native mobile app</span><small>Planned</small></div></div></section></div>`;
}

function affiliateLinkCard(a) {
  const enabled=a.status==='approved'&&state.program.active;
  return `<section class="affiliate-link-card"><span class="small-label">YOUR LINK. YOUR NEXT REFERRAL.</span><h2>Share something good.</h2><p>${enabled?'A sample link for your affiliate program. In the finished product, each eligible sale can earn you a commission.':'This sample affiliate or program is not active. Approval is needed before sharing.'}</p><div class="copy-link-row"><code>${esc(affiliateLink(a))}</code><button class="btn btn-lime" data-action="copy-link" ${enabled?'':'disabled'}>${icon('copy')} Copy sample link</button></div><span class="link-note">Illustration only · store.example is a placeholder. This link does not track real sales.</span></section>`;
}
function affiliateRules() {
  return `<section class="panel affiliate-program-summary"><h2>${esc(state.program.name)}</h2><div class="program-percent">${state.program.rate}<span>%</span></div><div class="program-rate-caption">on net merchandise sales in this sample program</div><div class="example-detail"><span>Attribution window</span><strong>${state.program.cookieDays} days</strong></div><div class="example-detail"><span>Approval</span><strong>Business review</strong></div><div class="example-detail"><span>Payment</span><strong>Direct from business</strong></div></section>`;
}
function affiliatePage() {
  const a=currentAffiliate(),s=summary(state,a.id),orders=ownOrders();
  const picker=affiliateSelect();
  const stats=`<div class="stat-grid">${stat('Total commission',money(s.totalCommission),'Net of sample order refunds','chart')}${stat('Approved to receive',money(s.approved),'Awaiting a direct business payment','wallet',true)}${stat('Payment recorded',money(s.paid),'Recorded by the sample business','check')}${stat('Referral clicks',number(s.clicks),`${s.sales} sample sales · ${s.conversion.toFixed(1)}% conversion`,'pointer')}</div>`;
  if(view==='overview') return `${heading(`Good to see you, ${a.name.split(' ')[0]}.`,'Here is how your sample referrals are doing.',picker)}${a.status!=='approved'?`<div class="info-note">${icon('info')} This sample affiliate is ${esc(a.status)}. Ask the business to approve or reactivate the partner in the business demo.</div>`:''}${stats}<div class="overview-grid">${affiliateLinkCard(a)}${affiliateRules()}<div class="span-full">${chartCard(a.id)}</div><section class="panel span-full"><div class="panel-head"><h2>Your recent earnings</h2><a class="text-link" href="#/demo/affiliate/earnings">View all ${icon('arrow')}</a></div>${orderTable(newest(orders).slice(0,5),'affiliate')}</section></div>`;
  if(view==='link') return `${heading('One link. Your referrals.','Explore the sample sharing experience for an affiliate.',picker)}<div class="two-columns"><div class="stack">${affiliateLinkCard(a)}<section class="panel"><div class="panel-head"><h2>How a referral earns commission</h2></div><ul class="rule-list"><li>${icon('link')}<span><strong>Share your unique link</strong>In the finished system, eligible clicks will be attributed to your affiliate ID.</span></li><li>${icon('store')}<span><strong>A customer places an eligible order</strong>The order must fall within the program’s attribution window.</span></li><li>${icon('wallet')}<span><strong>The business approves and pays</strong>Refunds can adjust your commission. Payment comes directly from the business.</span></li></ul></section></div>${affiliateRules()}</div>`;
  if(view==='earnings') return `${heading('Your work, made visible.','Only this sample affiliate’s orders and commissions appear here.',picker+exportButton())}${stats}<section class="panel"><div class="affiliate-profile-bar">${avatar(a)}<div><strong>${esc(a.name)}</strong><small>Sample affiliate · ${esc(state.program.name)}</small></div></div>${orderTable(newest(orders),'affiliate')}<div class="table-caption">Pending → approved → payment recorded. A full unpaid refund cancels the commission.</div></section>`;
  const payments=state.payouts.filter(p=>p.affiliateId===a.id);
  return `${heading('Your payment records.','Sample payments recorded by the business. No money moves through this preview.',picker+exportButton())}<div class="payment-note">${icon('info')}<span>The business pays you directly. These records show what has been entered in the sample workspace.</span></div><div class="stat-grid">${stat('Payment recorded',money(s.paid),`${payments.length} sample records`,'check',true)}${stat('Approved balance',money(s.approved),'Ready for direct payment from business','wallet')}${stat('Pending commission',money(s.pending),'Waiting for the business to review','clock')}${stat('Attributed sales',number(s.sales),'Orders belonging to this sample affiliate','store')}</div><section class="panel"><div class="panel-head"><h2>Payment history</h2></div>${payoutTable(payments,'affiliate')}</section>`;
}

function modal(title,description,body) {
  $('#modal-content').innerHTML=`<div class="modal-head"><div><div class="modal-kicker">AFFIMARO · SAMPLE WORKSPACE</div><h2 id="modal-title">${esc(title)}</h2><p>${esc(description)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
  if(!$('#modal').open) $('#modal').showModal();
}
const formError = '<div class="form-error" id="modal-error" tabindex="-1" role="alert"></div>';
const modalActions = label => `<div class="modal-actions"><button type="button" class="btn btn-white" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-dark">${label} ${icon('check')}</button></div>`;
function openSale() {
  const approved=state.affiliates.filter(a=>a.status==='approved');
  if(!approved.length){toast('Approve an affiliate before adding a sample sale.');return;}
  if(!state.program.active){toast('Activate the sample program in Programs first.');return;}
  let n=1050;while(state.orders.some(o=>o.id.toUpperCase()===`ORD-${n}`)) n++;
  modal('Try a sample sale.','Create one example referral click and order. No live store is involved.',`<form id="form-sale">${formError}<div class="form-field"><label for="sale-partner">Affiliate</label><select id="sale-partner" name="affiliateId" required>${approved.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></div><div class="form-field"><label for="sale-id">Order ID</label><input id="sale-id" name="id" value="ORD-${n}" maxlength="32" pattern="[a-zA-Z0-9_-]{2,32}" required><small>Order IDs are unique. A duplicate cannot add another commission.</small></div><div class="form-grid"><div class="form-field"><label for="sale-amount">Net sale amount (USD)</label><input id="sale-amount" name="amount" inputmode="decimal" value="100.00" required autocomplete="off"></div><div class="form-field"><label for="sale-age">Referral age (days)</label><input id="sale-age" name="referralAgeDays" type="number" min="0" max="365" step="1" value="0" required></div></div><div class="info-note">${icon('info')}<span>${state.program.rate}% commission · ${state.program.cookieDays}-day attribution window. Commission starts as pending.</span></div>${modalActions('Add sample sale')}</form>`);
}
function openAffiliate() {
  modal('Add a sample partner.','This adds a demo application. It does not send an email or create a real account.',`<form id="form-affiliate">${formError}<div class="form-field"><label for="partner-name">Name</label><input id="partner-name" name="name" placeholder="Sam Taylor" minlength="2" maxlength="60" required autocomplete="off"></div><div class="form-field"><label for="partner-email">Sample email</label><input id="partner-email" name="email" type="email" placeholder="sam@example.com" maxlength="120" required autocomplete="off"><small>Use an example address. Demo details stay in your browser.</small></div><div class="form-field"><label for="partner-channel">Channel</label><select id="partner-channel" name="channel">${['Content creator','Newsletter','Community','Blog','Other'].map(c=>`<option>${c}</option>`).join('')}</select></div>${modalActions('Add sample affiliate')}</form>`);
}
function openRefund(id) {
  const order=state.orders.find(o=>o.id===id);
  if(!order||!['pending','approved'].includes(order.status)){toast('Only unpaid sample orders can be refunded.');return;}
  const remaining=order.amountCents-order.refundedCents;
  modal('Apply a sample refund.',`Order ${id} · ${money(remaining)} remaining net sale.`,`<form id="form-refund">${formError}<input type="hidden" name="orderId" value="${esc(id)}"><div class="form-field"><label for="refund-amount">Refund amount (USD)</label><input id="refund-amount" name="amount" inputmode="decimal" value="${(remaining/100).toFixed(2)}" required autocomplete="off"><small>Enter a smaller amount for a partial refund, or the full balance to cancel the commission.</small></div><div class="payment-preview"><span>Current commission</span><strong>${money(commission(order))}</strong></div><div class="info-note">${icon('refresh')}<span>The commission will be recalculated using this order’s original ${order.rate}% rate. No real refund is issued.</span></div>${modalActions('Apply sample refund')}</form>`);
}
function openPayment(affiliateId=null) {
  const eligible=state.affiliates.filter(a=>summary(state,a.id).approved>0);
  if(!eligible.length){toast('There are no approved commissions. Approve a sample sale first.');return;}
  const selected=eligible.find(a=>a.id===affiliateId)||eligible[0];
  modal('Record a sample payment.','A record of a payment the business made directly. This action does not transfer money.',`<form id="form-payment">${formError}<div class="form-field"><label for="payment-partner">Affiliate</label><select id="payment-partner" name="affiliateId">${eligible.map(a=>`<option value="${esc(a.id)}" ${a.id===selected.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div><div class="payment-preview"><span>All approved commissions</span><strong id="payment-total">${money(summary(state,selected.id).approved)}</strong></div><div class="form-field"><label for="payment-method">Payment method</label><select id="payment-method" name="method">${['Bank transfer','External wallet','Cash','Other'].map(m=>`<option>${m}</option>`).join('')}</select></div><div class="form-field"><label for="payment-reference">Sample payment reference</label><input id="payment-reference" name="reference" value="DEMO-${String(state.payouts.length+1).padStart(3,'0')}" maxlength="100" required autocomplete="off"><small>Only approved commissions are included. Pending commissions stay pending.</small></div>${modalActions('Record sample payment')}</form>`);
}
function parseMoney(value) {
  const str=String(value).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(str)) throw new Error('Use a positive amount with up to two decimal places, such as 100.00.');
  const [whole,fraction='']=str.split('.');
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)) throw new Error('Enter a valid amount.');
  return amount;
}
function complete(message) {
  const saved=save();$('#modal').close();renderApp();
  toast(saved?message:`${message} Changes last for this session only.`);
}

function setPerspective(nextRole) {
  const isAffiliate=nextRole==='affiliate';
  document.querySelectorAll('[data-action="perspective"]').forEach(b=>{const active=b.dataset.role===nextRole;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('#perspective-copy').innerHTML=isAffiliate?`<h3>Your effort.<br>Your earnings.</h3><p>One place to find your link and follow every sample sale, commission and recorded payment.</p><ul class="check-list"><li>${icon('check')} A personal referral link</li><li>${icon('check')} Clear commission statuses</li><li>${icon('check')} Your own earnings and payment history</li></ul><a class="text-link" href="#/demo/affiliate/overview">Try the affiliate workspace ${icon('arrow')}</a>`:`<h3>Your program.<br>Your rules.</h3><p>Set the commission, review your partners and keep every sale connected to the person behind it.</p><ul class="check-list"><li>${icon('check')} Manage affiliate applications</li><li>${icon('check')} Review commissions and refunds</li><li>${icon('check')} Record payments you make directly</li></ul><a class="text-link" href="#/demo/merchant/affiliates">Try the business workspace ${icon('arrow')}</a>`;
  $('#perspective-visual').innerHTML=isAffiliate?`<div class="example-topline"><span class="small-label">PARTNER WORKSPACE · SAMPLE</span>${icon('users')}</div><h4>A link of your own.</h4><div class="example-link">store.example/?ref=sofia</div><div class="example-affiliate-stats"><div><span>Sample commissions</span><strong>$85.00</strong></div><div><span>Sample sales</span><strong>3</strong></div></div><div class="example-detail"><span>Pending approval</span><strong>$21.00</strong></div><div class="example-detail"><span>Payment recorded</span><strong>$24.00</strong></div><div class="example-footer"><span class="status-dot"></span> A clearer view of your progress.</div>`:`<div class="example-topline"><span class="small-label">PROGRAM SETTINGS · SAMPLE</span>${icon('link')}</div><h4>Store partners</h4><div class="example-rate"><strong>10<span>%</span></strong><span>commission on<br>net merchandise sales</span></div><div class="example-detail"><span>Attribution window</span><strong>30 days</strong></div><div class="example-detail"><span>Commission approval</span><strong>Manual review</strong></div><div class="example-detail"><span>Full refund</span><strong>Commission cancelled</strong></div><div class="example-footer"><span class="status-dot"></span> A rule everyone can understand.</div>`;
}

function csvCell(value) {
  let str=String(value??'');
  if(/^[=+@-]/.test(str.trimStart())) str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
}
function exportCSV() {
  let headers,rows,filename;
  if(role==='merchant'&&view==='affiliates'){
    filename='affiliates';headers=['Name','Email','Channel','Status','Clicks','Net sales USD','Approved commission USD'];
    rows=filteredAffiliates().map(a=>{const s=summary(state,a.id);return[a.name,a.email,a.channel,a.status,a.clicks,(s.revenue/100).toFixed(2),(s.approved/100).toFixed(2)];});
  }else if(view==='payments'||view==='payouts'){
    filename='payment-records';headers=['Record ID','Affiliate','Date','Amount USD','Method','Reference'];
    const payouts=role==='affiliate'?state.payouts.filter(p=>p.affiliateId===currentAffiliate().id):state.payouts;
    rows=newest(payouts).map(p=>[p.id,findAffiliate(p.affiliateId).name,p.date,(p.amountCents/100).toFixed(2),p.method,p.reference]);
  }else{
    filename='orders';headers=['Order ID','Affiliate','Date','Sale USD','Refunded USD','Commission USD','Rate percent','Status'];
    const orders=role==='affiliate'?newest(ownOrders()):filteredOrders();
    rows=orders.map(o=>[o.id,findAffiliate(o.affiliateId).name,o.date,(o.amountCents/100).toFixed(2),(o.refundedCents/100).toFixed(2),(commission(o)/100).toFixed(2),o.rate,o.status]);
  }
  const csv='\uFEFF'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`affimaro-demo-${filename}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Sample CSV exported.');
}
async function copyLink() {
  const a=currentAffiliate();
  if(a.status!=='approved'||!state.program.active){toast('The sample partner and program must be active.');return;}
  try {
    if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(affiliateLink(a));
    else {const area=document.createElement('textarea');area.value=affiliateLink(a);area.style.position='fixed';area.style.left='-9999px';document.body.append(area);area.select();const copied=document.execCommand('copy');area.remove();if(!copied) throw new Error('Clipboard unavailable');}
    toast('Sample referral link copied.');
  } catch {toast('Clipboard is unavailable. Select the displayed sample link to copy it.');}
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  event.preventDefault();
  const {action,id,status}=button.dataset;
  try {
    if(action==='open-sale')openSale();
    else if(action==='open-affiliate')openAffiliate();
    else if(action==='open-payment')openPayment(id);
    else if(action==='refund')openRefund(id);
    else if(action==='approve-order'){approveOrder(state,id);complete('Sample commission approved.');}
    else if(action==='affiliate-status'){setAffiliateStatus(state,id,status);complete(status==='approved'?'Sample affiliate approved.':'Sample affiliate suspended. Existing commissions remain.');}
    else if(action==='close-modal')$('#modal').close();
    else if(action==='perspective')setPerspective(button.dataset.role);
    else if(action==='toggle-nav'){const open=$('#main-nav').classList.toggle('open');button.setAttribute('aria-expanded',String(open));}
    else if(action==='toggle-sidebar'){const open=$('.app-shell').classList.toggle('sidebar-open');$('.mobile-sidebar-toggle').setAttribute('aria-expanded',String(open));}
    else if(action==='copy-link')void copyLink();
    else if(action==='export')exportCSV();
    else if(action==='reset')modal('Reset the demo?','Restore the original sample workspace.',`<p class="modal-text">This removes only your changes to Affimaro’s sample data in this browser. It restores the example partners, orders and payment records.</p><div class="modal-actions"><button class="btn btn-white" data-action="close-modal">Keep changes</button><button class="btn btn-dark" data-action="confirm-reset">Reset sample data ${icon('refresh')}</button></div>`);
    else if(action==='confirm-reset'){state=initialState();selectedAffiliate='sofia';affiliateFilter='all';affiliateSearch='';orderFilter='all';orderSearch='';chartRange='all';complete('Original sample workspace restored.');}
    else if(action==='skip-content'){const target=document.body.classList.contains('app-mode')?$('#app-main'):$('#main');target.focus();target.scrollIntoView({block:'start'});}
  } catch(error){toast(error.message);}
});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!['form-sale','form-affiliate','form-refund','form-payment','form-program'].includes(form.id))return;
  event.preventDefault();const data=new FormData(form);
  const errorElement=form.id==='form-program'?$('#program-error'):$('#modal-error');errorElement.textContent='';
  try {
    if(form.id==='form-sale'){const order=createOrder(state,{id:data.get('id'),affiliateId:data.get('affiliateId'),amountCents:parseMoney(data.get('amount')),referralAgeDays:Number(data.get('referralAgeDays'))});complete(`Sample sale added. ${money(commission(order))} commission is pending.`);}
    else if(form.id==='form-affiliate'){addAffiliate(state,{name:data.get('name'),email:data.get('email'),channel:data.get('channel')});complete('Sample application added. Approve it in the affiliate list.');}
    else if(form.id==='form-refund'){refundOrder(state,data.get('orderId'),parseMoney(data.get('amount')));complete('Sample refund applied. Commission recalculated.');}
    else if(form.id==='form-payment'){const p=recordPayout(state,data.get('affiliateId'),data.get('method'),data.get('reference'));complete(`${money(p.amountCents)} sample payment recorded. No money was transferred.`);}
    else if(form.id==='form-program'){updateProgram(state,{name:data.get('name'),rate:Number(data.get('rate')),cookieDays:Number(data.get('cookieDays')),active:data.get('active')==='on'});complete('Sample rules saved. Existing orders keep their original rate.');}
  }catch(error){errorElement.textContent=error.message;errorElement.focus();}
});
document.addEventListener('input',event=>{
  if(event.target.id==='affiliate-search'){affiliateSearch=event.target.value;$('#affiliate-rows').innerHTML=affiliateRows();$('#affiliate-caption').textContent=affiliateCaption();}
  if(event.target.id==='order-search'){orderSearch=event.target.value;$('#order-rows').innerHTML=orderRows(filteredOrders());$('#order-caption').textContent=orderCaption();}
});
document.addEventListener('change',event=>{
  if(event.target.id==='demo-role')location.hash=`/demo/${event.target.value}/overview`;
  else if(event.target.id==='affiliate-person'){selectedAffiliate=event.target.value;renderApp();$('#affiliate-person').focus();}
  else if(event.target.id==='affiliate-filter'){affiliateFilter=event.target.value;$('#affiliate-rows').innerHTML=affiliateRows();$('#affiliate-caption').textContent=affiliateCaption();}
  else if(event.target.id==='order-filter'){orderFilter=event.target.value;$('#order-rows').innerHTML=orderRows(filteredOrders());$('#order-caption').textContent=orderCaption();}
  else if(event.target.id==='chart-range'){chartRange=event.target.value;renderApp();$('#chart-range').focus();}
  else if(event.target.id==='payment-partner')$('#payment-total').textContent=money(summary(state,event.target.value).approved);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){const shell=$('.app-shell');if(shell?.classList.contains('sidebar-open')){shell.classList.remove('sidebar-open');$('.mobile-sidebar-toggle').setAttribute('aria-expanded','false');$('.mobile-sidebar-toggle').focus();}$('#main-nav').classList.remove('open');$('.mobile-nav-toggle').setAttribute('aria-expanded','false');}
});
$('#modal').addEventListener('click',event=>{if(event.target===$('#modal')){const rect=$('#modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('#modal').close();}});
window.addEventListener('hashchange',()=>{route();if(!document.body.classList.contains('app-mode')){const anchor=location.hash.slice(1);requestAnimationFrame(()=>{if(anchor&&document.getElementById(anchor))document.getElementById(anchor).scrollIntoView({block:'start'});else if(!anchor)window.scrollTo(0,0);});}});
route();
