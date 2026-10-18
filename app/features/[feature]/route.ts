import {publicMarketingResponse} from '../../../lib/marketing';
export async function GET(_request:Request,{params}:{params:Promise<{feature:string}>}){return publicMarketingResponse('/features/'+(await params).feature);}
