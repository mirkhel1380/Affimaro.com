import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {getChatGPTUser} from '../../chatgpt-auth';
import {commerce} from '../../../lib/woocommerce';
import {requireBusinessSubscription} from '../../../lib/billing-runtime';
export async function POST(request:Request){
  return action(request,async(_s,body)=>{const identity=await getChatGPTUser();if(!identity)throw new Error('Authentication unavailable.');if(body&&typeof body==='object'&&'action' in body&&body.action==='connect')await requireBusinessSubscription(identity);return commerce(getRawDb(),identity).configure(body);});
}
