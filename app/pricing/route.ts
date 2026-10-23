import landing from '../../public/demo/index.html?raw';
import {pricingSection} from '../../lib/pricing-catalog.mjs';
import {marketingPage,pricingPage} from '../../lib/landing';
import {emailSignIn} from '../../lib/auth-mode';
import independentProject from '../../self-hosted/cloudflare-project.json';

export const GET=(request:Request)=>new Response(marketingPage(pricingPage(landing,pricingSection(new URL(request.url).searchParams.get('for')==='agency'?'agency':'brand')),emailSignIn,independentProject.origin),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
