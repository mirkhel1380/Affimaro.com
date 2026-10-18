import landing from '../../public/demo/index.html?raw';
import packages from '../../content/pricing-section.html?raw';
import {marketingPage,pricingPage} from '../../lib/landing';
import {emailSignIn} from '../../lib/auth-mode';
import independentProject from '../../self-hosted/cloudflare-project.json';

export const GET=()=>new Response(marketingPage(pricingPage(landing,packages),emailSignIn,independentProject.origin),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
