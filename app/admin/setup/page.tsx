import {billingEmailSetup} from '../../../lib/billing-email';
import {OwnerInvoiceEmailSetup} from '../../owner/invoice-email-setup';
import {env} from 'cloudflare:workers';
import {ownerContext} from '../../owner/context';
import {OwnerBillingSetup} from '../../owner/billing-setup';
import {platformBillingSummary} from '../../../lib/platform-billing';
import {billingOrigin,publicOrigin} from '../../../lib/public-origin-runtime';
import {getRawDb} from '../../../db';
import {billingConfig} from '../../../lib/billing-runtime';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {launchReadiness} from '../../../lib/launch-readiness';
import {plansForRole} from '../../../lib/pricing-catalog.mjs';
import {portalName,type Portal} from '../../../lib/portal-policy';
import selectedProject from '../../../self-hosted/supabase-project.json';
import {OwnerShell} from '../../owner/shell';
import {PageHeading,Card,Badge,Note,Icon} from '../../ui';

export const dynamic='force-dynamic';
export const metadata={title:'Launch setup | Affimaro',robots:{index:false,follow:false}};
const statusName={ready:'Policy verified',attention:'Needs attention',unavailable:'Check unavailable',not_configured:'Setup required',test_ready:'Test mode verified',live_ready:'Live price verified'};
export default async function LaunchSetupPage(){
 const {user,db}=await ownerContext('/owner/settings'),values=env as unknown as Record<string,unknown>,get=(name:string)=>typeof values[name]==='string'?values[name] as string:'',url=get('SUPABASE_URL'),key=get('SUPABASE_PUBLISHABLE_KEY');
 const state=await launchReadiness(db,user,{auth:url&&key?{supabaseUrl:url,publishableKey:key}:undefined,billing:await Promise.all((['brand','agency'] as const).flatMap(portal=>(['starter','growth','business'] as const).map(plan=>billingConfig(plan,{portal})))),paymentKeyReady:/^[a-f0-9]{64}$/i.test(paymentDataKey()||''),maintenance:get('AFFIMARO_MIGRATION_MAINTENANCE')==='true'});
 const stripe=await platformBillingSummary(db,user,billingOrigin()),invoiceEmail=await billingEmailSetup(db,user);
 // Provider links always use a validated project reference, never arbitrary env URLs.
 const ref=/^https:\/\/([a-z0-9-]{6,80})\.supabase\.co$/.exec(url)?.[1]||selectedProject.projectRef,authDashboard='https://supabase.com/dashboard/project/'+ref+'/auth/';
 return <OwnerShell name={user.fullName||'Owner'} email={user.email} active="setup"><PageHeading eyebrow="OWNER · LAUNCH SETUP" title="A clear view of what is ready." description="Check account access, email policy and all six brand and agency monthly prices from your owner account."><a href="/owner/settings" className="a-btn a-btn-outline a-btn-small">Refresh checks<Icon name="arrow"/></a></PageHeading>
 <p className="a-fine-print">Checked {new Date(state.checkedAt).toUTCString()}. Refresh checks read provider settings. The Stripe connection form saves setup only after your confirmation.</p>
 {state.maintenance&&<Note>This deployment is paused for migration. Finish the verified migration before opening customer access.</Note>}
 <div className="a-two-col"><Card title="Account email"><div className="a-card-body"><Badge status={statusName[state.auth.status]}/><h3>Verified email, then owner review.</h3><p>{state.auth.message}</p><dl className="a-detail-list"><div><dt>Email sign-in</dt><dd>{state.auth.status==='unavailable'||state.auth.status==='not_configured'?'Unverified':state.auth.emailEnabled?'Enabled':'Disabled'}</dd></div><div><dt>Email confirmation</dt><dd>{state.auth.status==='unavailable'||state.auth.status==='not_configured'?'Unverified':state.auth.confirmationRequired?'Required':'Needs attention'}</dd></div><div><dt>New registrations</dt><dd>{state.auth.status==='unavailable'||state.auth.status==='not_configured'?'Unverified':state.auth.signupOpen?'Open':'Closed'}</dd></div></dl><a className="a-btn a-btn-outline a-btn-small" href={authDashboard+'providers?provider=email'} target="_blank" rel="noopener noreferrer">Open email settings<Icon name="arrow"/></a></div></Card>
 <Card title="Customer email delivery"><div className="a-card-body"><Badge status="Delivery check needed"/><h3>A working owner email is the first step.</h3><p>Sign-in policy does not verify the sender, delivery limits or delivery to a customer. Complete sender verification and check both confirmation and password-recovery emails before inviting customers.</p><p className="a-muted">The Resend test sender only delivers to your Resend account email. General customer delivery needs a verified sender domain.</p><a className="a-btn a-btn-outline a-btn-small" href={authDashboard+'smtp'} target="_blank" rel="noopener noreferrer">Open sender settings<Icon name="arrow"/></a><p className="a-fine-print">Your current website address can stay in use while the custom website domain is deferred.</p></div></Card></div>
 <OwnerBillingSetup state={stripe}/><OwnerInvoiceEmailSetup state={invoiceEmail}/>
 <Card title="Monthly subscription payments"><div className="a-card-body"><div className="a-package-grid">{state.packages.map(p=><article key={p.portal+p.plan}><span className="a-eyebrow">{p.portal==='agency'?'Agency':'Brand'} {plansForRole(p.portal)[p.plan].name}</span><h3>${plansForRole(p.portal)[p.plan].amount} USD / month</h3><Badge status={statusName[p.status]}/><p>{p.message}</p></article>)}</div><dl className="a-detail-list"><div><dt>Payment encryption</dt><dd>{state.paymentKeyReady?'Configured':'Setup required'}</dd></div><div><dt>Subscription enforcement</dt><dd>{state.packages.every(p=>p.required)?'Required for paid business actions':'Pilot access is enabled'}</dd></div></dl><p className="a-muted">A verified price confirms its account, currency, monthly cycle and exact package amount. It does not prove a successful customer payment. Test purchases do not activate live paid access.</p><div className="a-inline-actions"><a className="a-btn a-btn-outline a-btn-small" href="https://dashboard.stripe.com/products" target="_blank" rel="noopener noreferrer">Open Stripe products<Icon name="arrow"/></a><a className="a-btn a-btn-small" href="/owner/data?table=billing">View subscriptions<Icon name="arrow"/></a></div></div></Card>
 <Card title="Four separate account types"><div className="a-card-body"><div className="a-package-grid a-launch-portals">{state.portals.map(p=><article key={p.portal}><h3>{portalName(p.portal as Portal)}</h3><p>{p.approved} approved · {p.pending} awaiting review</p><a href={publicOrigin()+'/auth/'+p.portal+'/signup'}>Open {portalName(p.portal).toLowerCase()} registration<Icon name="arrow"/></a></article>)}</div><p>Every new account verifies its email and submits a profile. Your approval opens the account’s own portal.</p><a className="a-btn a-btn-outline a-btn-small" href="/owner/applications">Review applications<Icon name="arrow"/></a></div></Card>
 <Note>Profile approval happens once. Approved brands and agencies purchase packages directly, and verified payment activates access. Readiness checks do not send emails or start a payment. The explicit Stripe connection form registers subscription updates.</Note></OwnerShell>;
}
