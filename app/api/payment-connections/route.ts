import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {getChatGPTUser} from '../../chatgpt-auth';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {paymentConnections} from '../../../lib/payment-connections';
import {AppError} from '../../../lib/service';
export async function POST(request:Request){return action(request,async(_s,body)=>{
  const user=await getChatGPTUser();if(!user)throw new AppError(401,'Sign in to continue.');
  if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(k=>!['action','data'].includes(k)))throw new AppError(400,'Invalid connection request.');
  const connections=paymentConnections(getRawDb(),user,paymentDataKey());
  if(body.action==='connect')return connections.connect(body.data);
  if(body.action==='check')return connections.check(body.data);
  if(body.action==='remove')return connections.remove(body.data);
  throw new AppError(400,'Unknown connection action.');
});}
