import {redirect} from 'next/navigation';
import {emailSignIn} from '../../lib/auth-mode';
import selectedProject from '../../self-hosted/cloudflare-project.json';
import {Logo} from '../ui';

export const metadata={title:'Install Affimaro · Your partner workspace'};

export default function InstallPage(){
  if(!emailSignIn)redirect(selectedProject.origin+'/install');
  return <>
    <link rel="stylesheet" href="/install-app.css"/>
    <main className="m-install">
      <nav className="m-nav" aria-label="Installation navigation"><Logo/><a href="/account">Open your account ↗</a></nav>
      <section className="m-hero" aria-labelledby="install-heading">
        <div className="m-copy">
          <span className="m-eyebrow">YOUR WORKSPACE. WITHIN REACH.</span>
          <h1 id="install-heading">Good partners.<br/><em>Closer at hand.</em></h1>
          <p>Add Affimaro to your home screen. Open your workspace in its own window and use the same account on your phone, tablet or computer.</p>
          <div className="m-actions"><button type="button" data-install-button hidden>Install Affimaro</button><a href="/account">Open workspace ↗</a></div>
          <span className="m-status" data-install-status role="status" aria-live="polite">If an install button is not shown, follow the steps for your browser below.</span>
        </div>
        <div className="m-app-card"><img src="/app-icons/icon-512.png" alt="" width="112" height="112"/><h2>affimaro.</h2><p>One account.<br/>A home for your partnerships.</p><ul><li>Business workspace</li><li>Affiliate portal</li><li>Commissions and payment records</li></ul></div>
      </section>
      <section className="m-guide" aria-labelledby="install-guide">
        <div className="m-guide-head"><h2 id="install-guide">A few taps. You’re in.</h2><p>Install from your browser, then sign in with your Affimaro email and password.</p></div>
        <div className="m-steps">
          <article><small>01 / ANDROID</small><h3>Chrome</h3><ol><li>Open this page in Chrome.</li><li>Tap <strong>Install Affimaro</strong> when it appears, or open the browser’s three-dot menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to home screen</strong> and confirm.</li></ol></article>
          <article><small>02 / IPHONE &amp; IPAD</small><h3>Safari</h3><ol><li>Open this page in Safari.</li><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol></article>
          <article><small>03 / COMPUTER</small><h3>Chrome or Edge</h3><ol><li>Open this page in Chrome or Edge.</li><li>Use <strong>Install Affimaro</strong> when available, or the browser’s install icon or app menu.</li><li>Confirm, then open Affimaro from your apps list.</li></ol></article>
        </div>
        <div className="m-note"><strong>Stay connected.</strong><p>An internet connection is needed to see your current partners, orders and commissions and to make changes. If you’re offline, Affimaro will help you reconnect.</p></div>
      </section>
      <footer className="m-footer"><span>Affimaro</span><a href="/">Back to Affimaro</a></footer>
    </main>
  </>;
}
