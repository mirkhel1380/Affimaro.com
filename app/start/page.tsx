import {requireChatGPTUser} from '../chatgpt-auth';
import {getRawDb} from '../../db';
import {gettingStarted} from '../../lib/getting-started';
import {emailSignIn} from '../../lib/auth-mode';
import {CopyButton} from '../forms';
import {Shell,PageHeading,Card,Icon,Note} from '../ui';

export const dynamic='force-dynamic';
export const metadata={title:'Getting started | Affimaro',robots:{index:false,follow:false}};

export default async function StartPage({searchParams}:{searchParams:Promise<{view?:string}>}){
  const query=await searchParams,affiliate=query.view==='affiliate';
  const user=await requireChatGPTUser(affiliate?'/start?view=affiliate':'/start');
  const setup=await gettingStarted(getRawDb(),user),view=affiliate?'affiliate':'business',progress=setup[view];
  const name=setup.account?.display_name||user.fullName||user.email.split('@')[0];
  return <Shell name={name} email={user.email} active="start">
    <PageHeading eyebrow="GETTING STARTED" title={affiliate?'Your first partnership.':'Your first partner program.'} description="A clear next step, using your current account. Your progress updates as you complete the setup."/>
    <nav className="a-tabs" aria-label="Setup guides"><a href="/start" className={!affiliate?'is-active':''} aria-current={!affiliate?'page':undefined}>For businesses</a><a href="/start?view=affiliate" className={affiliate?'is-active':''} aria-current={affiliate?'page':undefined}>For affiliates</a></nav>
    <div className="g-layout">
      <div>
        <section className="g-progress" aria-labelledby="setup-progress"><div><span className="a-eyebrow">{affiliate?'YOUR PARTNER JOURNEY':setup.businessName||'YOUR BUSINESS JOURNEY'}</span><h2 id="setup-progress">{progress.completed} of {progress.total} steps complete</h2><p>{progress.next?progress.next.status==='waiting'?'Your next step is awaiting the business. You can check its status in your portal.':'Pick up from your next step, or open any step below.':'Your setup steps are complete. Keep reviewing your orders, commissions and store connection as your program grows.'}</p></div><progress value={progress.completed} max={progress.total} aria-label={`${progress.completed} of ${progress.total} setup steps complete`}/>{progress.next&&<a className="a-btn a-btn-lime" href={progress.next.href}>{progress.next.action}<Icon name="arrow"/></a>}</section>
        <ol className="g-steps" aria-label={affiliate?'Affiliate setup steps':'Business setup steps'}>{progress.steps.map((step,index)=><li key={step.id} className={`g-step g-${step.status}`}><span className="g-step-number" aria-hidden="true">{step.status==='complete'?<Icon name="check"/>:String(index+1).padStart(2,'0')}</span><div><div className="g-step-heading"><h2>{step.title}</h2><span className="g-step-status">{step.status==='complete'?'Complete':step.status==='waiting'?'Awaiting business':'To do'}</span></div><p>{step.detail}</p><a className="a-text-link" href={step.href}>{step.action}<Icon name="arrow"/></a></div></li>)}</ol>
      </div>
      <aside className="g-aside" aria-label="Helpful next steps">
        {!affiliate&&setup.programId&&<Card title="Invite your first partner"><div className="a-card-body"><p className="g-copy">{emailSignIn?'Share this application page with a partner. They create their own account and apply.':'Share this application page with someone who can access this private pilot.'} Invitation emails are not sent automatically.</p><CopyButton path={`/join/${setup.programId}`}/><a className="a-text-link a-spaced-link" href={`/join/${setup.programId}`}>Preview application page<Icon name="arrow"/></a></div></Card>}
        <Card title={affiliate?'Affiliate access is separate.':'Start with one store.'}><div className="a-card-body"><p className="g-copy">{affiliate?'You do not need to buy a business subscription or create a store to join another business’s program. Each business decides whether to approve an application.':'The current release supports one website, one program and one business owner, with WooCommerce or Shopify tracking, commission workflows and reports.'}</p><a className="a-text-link" href={affiliate?'/partner':'/billing'}>{affiliate?'Open affiliate portal':'View packages and billing'}<Icon name="arrow"/></a></div></Card>
        <Card title={affiliate?'How commissions reach you':'Pay partners directly.'}><div className="a-card-body"><p className="g-copy">Businesses pay affiliates directly. Bank and Wise transfers happen outside Affimaro; the business records a completed transfer here. Eligible USD Stripe account transfers require the business’s review and confirmation.</p><a className="a-text-link" href={`/payments?view=${affiliate?'affiliate':'business'}`}>{affiliate?'Bank details and payment requests':'Commission and payment workflow'}<Icon name="arrow"/></a></div></Card>
        {emailSignIn&&<Card title="Keep Affimaro close."><div className="a-card-body"><p className="g-copy">Add the web app to your home screen and use the same account on your phone.</p><a className="a-text-link" href="/install">Install Affimaro<Icon name="arrow"/></a></div></Card>}
      </aside>
    </div>
    <Note>{affiliate?'An order appearing in your portal does not mean its commission has been approved or paid. Check Payments for the current available balance and requests.':'Your first order confirms that data has arrived. Use your staging store to check commission and refund updates before inviting partners widely. Completing setup never sends a payment.'}</Note>
  </Shell>;
}
