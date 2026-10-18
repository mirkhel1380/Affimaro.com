import landing from "../public/demo/index.html?raw";
import {emailSignIn} from '../lib/auth-mode';
const installHead='<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/app-icons/apple-touch-icon.png"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Affimaro"><script src="/install-app.js" defer></script>';
export const GET=()=>new Response(emailSignIn?landing.replace('</head>',installHead+'</head>'):landing,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
