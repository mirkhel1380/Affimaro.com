import {safeReturnTo} from '../self-hosted/auth-core.ts';
import {accountReturnTo} from './account-journey.mjs';
import type {Portal} from './portal-policy.ts';

// Keep the original account destination through ownership checks. Navigation
// does not grant approval or change the applicant's saved role or profile.
export function applicationJourney(portal:Portal|undefined,value?:string|null){
  const destination=accountReturnTo(portal,safeReturnTo(value));
  const query=new URLSearchParams({return_to:destination});
  return {
    destination,
    application:'/application?'+query,
    channels:'/application/media?'+query,
    resume:'/application?'+new URLSearchParams({return_to:destination,step:'channels'}),
  };
}
