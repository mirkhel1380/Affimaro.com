import {trustedPublicOrigin} from './public-origin.ts';

const installHead='<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/app-icons/apple-touch-icon.png"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Affimaro"><script src="/install-app.js" defer></script>';
export function marketingPage(html:string,independent:boolean,independentOrigin:string){
  return independent?html.replace('</head>',installHead+'</head>'):handoffLandingLinks(html,independentOrigin);
}

export function pricingPage(landing:string,section:string){
  const part=(pattern:RegExp)=>{const match=landing.match(pattern);if(!match)throw new Error('The public page template is incomplete.');return match[0];};
  const homeLinks=(html:string)=>html.replace(/<a\b[^>]*>/g,tag=>tag.replace(/\shref="#([^"]*)"/,(_,hash)=>` href="/${hash?'#'+hash:''}"`));
  const head=part(/<head>[\s\S]*?<\/head>/)
    .replace(/<title>[\s\S]*?<\/title>/,'<title>Pricing & packages | Affimaro</title>')
    .replace(/<meta name="description"[^>]*>/,'<meta name="description" content="Explore Affimaro Starter features and planned packages for your affiliate program.">')
    .replace('<script type="module" src="/demo/app.js"></script>','<script src="/marketing-nav.js" defer></script>');
  const header=homeLinks(part(/<header class="site-header"[\s\S]*?<\/header>/)).replace('<a href="/pricing">','<a href="/pricing" aria-current="page">');
  const footer=homeLinks(part(/<footer class="site-footer [^"]*"[\s\S]*?<\/footer>/));
  const sprite=part(/<svg class="icon-sprite"[\s\S]*?<\/svg>/),install=part(/<a class="corner-install"[\s\S]*?<\/a>/);
  return `<!doctype html><html lang="en">${head}<body class="pricing-page">${sprite}<a class="skip-link" href="#main">Skip to content</a>${header}<main id="main" tabindex="-1">${section}<div class="pricing-note container"><p>Business subscriptions and affiliate commissions are separate. Businesses pay their partners directly. You do not need a business subscription to join a program as an affiliate.</p><a class="text-link" href="/start">Follow your setup guide <svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></a></div></main>${footer}${install}</body></html>`;
}

// Native preview navigation must leave its frame for independent email sign-in.
// Keep section links, the local demo, downloads and independent-host URLs intact.
export function handoffLandingLinks(html:string,independentOrigin:string){
  const origin=trustedPublicOrigin(independentOrigin);
  return html.replace(/<a\b[^>]*>/g,tag=>{
    const href=tag.match(/\shref="([^"]+)"/)?.[1];
    if(!href||!/^\/(account|start|workspace|partner|payments|reports|billing|join|install)([/?#]|$)/.test(href))return tag;
    return tag.replace(/\s+target="[^"]*"/g,'').replace(/\shref="[^"]+"/,` href="${origin}${href}" target="_top"`);
  });
}
