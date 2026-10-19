import selectedProject from './cloudflare-project.json' with {type:'json'};
import {independentRouting} from './routing.mjs';
import {legacyRouting} from './legacy-routing.mjs';
import {ownerRouting} from './owner-routing.mjs';

// Public deployment identifiers only. Tokens and encryption keys have no defaults.
export function cloudflareSettings(values={}){
  const get=name=>{const value=values[name];if(value===undefined)return undefined;if(typeof value!=='string'||!value.trim())throw new Error('Use nonempty Cloudflare deployment settings.');return value.trim();};
  const account=get('CLOUDFLARE_ACCOUNT_ID'),database=get('CLOUDFLARE_D1_DATABASE_ID'),origin=get('APP_ORIGIN');
  const accountId=(account??selectedProject.accountId).toLowerCase(),databaseId=(database??selectedProject.databaseId).toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(accountId)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(databaseId)||/^00000000-/.test(databaseId))throw new Error('Use the real Cloudflare account and D1 database IDs.');
  if(accountId!==selectedProject.accountId&&(!database||!origin))throw new Error('Override the Cloudflare account, D1 database and origin together for another account.');
  // The selected project’s former APP_ORIGIN can remain in build settings.
  // The authorized cutover promotes that exact owned legacy host to its canonical domain.
  const canonical=accountId===selectedProject.accountId&&origin===selectedProject.legacyOrigin?selectedProject.origin:origin;
  const routing=independentRouting(canonical??selectedProject.origin);
  const defaults=!canonical||routing.origin===selectedProject.origin;
  const owner=ownerRouting(routing.origin,get('OWNER_ORIGIN')??(defaults?selectedProject.ownerOrigin:undefined));
  const legacy=legacyRouting(routing.origin,get('LEGACY_ORIGIN')??(defaults?selectedProject.legacyOrigin:undefined));
  if(legacy.origin)routing.config.workers_dev=true;
  if(owner.route)routing.config.routes.push(owner.route);
  return {accountId,databaseId,origin:routing.origin,ownerOrigin:owner.origin,legacyOrigin:legacy.origin,routing:routing.config,workersSubdomain:legacy.workersSubdomain||routing.workersSubdomain};
}
