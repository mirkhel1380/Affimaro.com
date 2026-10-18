import {publicMarketingResponse} from '../../../lib/marketing';
export async function GET(_request:Request,{params}:{params:Promise<{integration:string}>}){return publicMarketingResponse('/integrations/'+(await params).integration);}
