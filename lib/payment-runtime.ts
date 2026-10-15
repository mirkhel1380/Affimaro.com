import {env} from 'cloudflare:workers';
export function paymentDataKey(){const value=(env as unknown as Record<string,unknown>).PAYMENT_DATA_KEY_V1;return typeof value==='string'?value:undefined;}
