import {wordpressAdminUrl} from '../../../lib/store-platform-catalog.mjs';
import {publicMarketingResponse} from '../../../lib/marketing';

// Navigation only: never fetch the destination or collect a WordPress password.
export function GET(request:Request){
 const values=new URL(request.url).searchParams,website=values.get('website');
 if(website===null)return publicMarketingResponse('/integrations/wordpress-admin');
 try{
  if(values.getAll('website').length!==1)throw new Error('Enter one WordPress installation URL.');
  const destination=wordpressAdminUrl(website);
  return new Response(null,{status:303,headers:{Location:destination,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){return publicMarketingResponse('/integrations/wordpress-admin',{wordpressError:error instanceof Error?error.message:'Check your WordPress installation URL.'},400);}
}
