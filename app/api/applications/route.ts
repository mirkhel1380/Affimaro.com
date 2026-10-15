import { action } from "../../../lib/http";
import {requireBusinessSubscription} from '../../../lib/billing-runtime';
export const dynamic="force-dynamic";
export const POST=(request:Request)=>action(request,(s,body)=>s.apply(body));
export const PATCH=(request:Request)=>action(request,async(s,body,user)=>{if(body&&typeof body==='object'&&'status' in body&&body.status==='approved')await requireBusinessSubscription(user);return s.review(body);});
