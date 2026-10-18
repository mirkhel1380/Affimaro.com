import {publicMarketingResponse} from '../../lib/marketing';
import {safeReturnTo} from '../../self-hosted/auth-core';
export const GET=(request:Request)=>publicMarketingResponse('/login',{returnTo:new URL(request.url).searchParams.has('return_to')?safeReturnTo(new URL(request.url).searchParams.get('return_to')):undefined});
