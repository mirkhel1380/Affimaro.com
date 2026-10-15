import {env} from 'cloudflare:workers';
import {trustedPublicOrigin} from './public-origin';
export function publicOrigin(){const value=(env as unknown as Record<string,unknown>).APP_ORIGIN;return trustedPublicOrigin(typeof value==='string'?value:undefined);}
