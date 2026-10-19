import {env} from 'cloudflare:workers';
import {legacyRouting} from '../self-hosted/legacy-routing.mjs';
import {trustedPublicOrigin} from './public-origin';
export function publicOrigin(){const value=(env as unknown as Record<string,unknown>).APP_ORIGIN;return trustedPublicOrigin(typeof value==='string'?value:undefined);}

export function billingOrigin(){const value=(env as unknown as Record<string,unknown>).LEGACY_ORIGIN;return legacyRouting(publicOrigin(),typeof value==='string'?value:undefined).origin||publicOrigin();}
