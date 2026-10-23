import {selectedPlan,type Plan} from '../../../lib/plan-requests';
import {planCatalog} from '../../../lib/pricing-catalog.mjs';
import {action} from '../../../lib/http';
import {getRawDb} from '../../../db';
import {billing} from '../../../lib/billing';
import {billingConfig,currentBillingPlan} from '../../../lib/billing-runtime';
import {paymentDataKey} from '../../../lib/payment-runtime';
import {AppError} from '../../../lib/service';
export const dynamic='force-dynamic';
export async function POST(request:Request){return action(request,async(_s,body,user)=>{
  if(!body||typeof body!=='object'||!('action' in body)||!('data' in body)||Object.keys(body).some(key=>!['action','data','plan'].includes(key)))throw new AppError(400,'Invalid billing request.');
  if('plan' in body&&(!['preview','checkout'].includes(String(body.action))||typeof body.plan!=='string'||!Object.hasOwn(planCatalog,body.plan)))throw new AppError(400,'Choose a valid monthly package.');
  const plan='plan' in body?body.plan as Plan:['refresh','confirm','portal','cancelCheckout'].includes(String(body.action))?await currentBillingPlan(user.userId):await selectedPlan(getRawDb(),user.userId);
  const reconcile=['refresh','confirm','portal','cancelCheckout'].includes(String(body.action));
  const api=billing(getRawDb(),user,await billingConfig(plan,{userId:user.userId,existing:reconcile,reconcile}),paymentDataKey());
  if(body.action==='preview')return api.preview(body.data);if(body.action==='checkout')return api.checkout(body.data);if(body.action==='refresh')return api.refresh(body.data);if(body.action==='confirm')return api.confirm(body.data);if(body.action==='portal')return api.portal(body.data);if(body.action==='cancelCheckout')return api.cancelCheckout(body.data);throw new AppError(400,'Unknown billing action.');
});}
