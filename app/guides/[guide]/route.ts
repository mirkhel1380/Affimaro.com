import {publicMarketingResponse} from '../../../lib/marketing';
export async function GET(_request:Request,{params}:{params:Promise<{guide:string}>}){return publicMarketingResponse('/guides/'+(await params).guide);}
