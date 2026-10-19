import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {partnerResources} from '../../../lib/partner-resources';
import {AppError} from '../../../lib/service';
import {requireBusinessSubscription} from '../../../lib/billing-runtime';
export async function POST(request:Request){return action(request,async(_s,body,user)=>{if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(k=>!['action','data'].includes(k)))throw new AppError(400,'Check the resource request.');const api=partnerResources(getRawDb(),user);if(body.action==='archive')return api.archive(body.data);await requireBusinessSubscription(user);if(body.action==='addAsset')return api.addAsset(body.data);if(body.action==='addCoupon')return api.addCoupon(body.data);throw new AppError(400,'Unknown resource action.');});}
