import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {getChatGPTUser} from '../../chatgpt-auth';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {shopify} from '../../../lib/shopify';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return action(request,async(_s,body)=>{
  const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');
  if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(k=>!['action','data'].includes(k)))throw new AppError(400,'Invalid Shopify request.');const adapter=shopify(getRawDb(),user,paymentDataKey());
  if(body.action==='connect')return adapter.connect(body.data);if(body.action==='setActive')return adapter.setActive(body.data);if(body.action==='sync'){if(!body.data||typeof body.data!=='object'||Object.keys(body.data).length)throw new AppError(400,'Sync options are managed by the server.');return adapter.sync();}throw new AppError(400,'Unknown Shopify action.');
});}
