import selectedProject from './cloudflare-project.json' with {type:'json'};
import {independentRouting} from './routing.mjs';
import {ownerRouting} from './owner-routing.mjs';

// Public deployment identifiers only. Tokens and encryption keys have no defaults.
export function cloudflareSettings(values={}){
  const get=name=>{const value=values[name];if(value===undefined)return undefined;if(typeof value!=='string'||!value.trim())throw new Error('Use nonempty Cloudflare deployment settings.');return value.trim();};
  const account=get('CLOUDFLARE_ACCOUNT_ID'),database=get('CLOUDFLARE_D1_DATABASE_ID'),origin=get('APP_ORIGIN');
  const accountId=(account??selectedProject.accountId).toLowerCase(),databaseId=(database??selectedProject.databaseId).toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(accountId)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(databaseId)||/^00000000-/.test(databaseId))throw new Error('Use the real Cloudflare account and D1 database IDs.');
  if(accountId!==selectedProject.accountId&&(!database||!origin))throw new Error('Override the Cloudflare account, D1 database and origin together for another account.');
  const routing=independentRouting(origin??selectedProject.origin);
  const owner=ownerRouting(routing.origin,get('OWNER_ORIGIN'));
  if(owner.route)routing.config.routes.push(owner.route);
  return {accountId,databaseId,origin:routing.origin,ownerOrigin:owner.origin,routing:routing.config,workersSubdomain:routing.workersSubdomain};
}
