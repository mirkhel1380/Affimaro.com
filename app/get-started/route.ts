import {publicMarketingResponse} from '../../lib/marketing';
export const GET=(request:Request)=>publicMarketingResponse('/get-started',{plan:new URL(request.url).searchParams.get('plan')||undefined});
