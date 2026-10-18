import landing from "../public/demo/index.html?raw";
import {emailSignIn} from '../lib/auth-mode';
import {marketingPage} from '../lib/landing';
import independentProject from '../self-hosted/cloudflare-project.json';
export const GET=()=>new Response(marketingPage(landing,emailSignIn,independentProject.origin),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
