import { action } from "../../../lib/http";
import {requireBusinessSubscription} from '../../../lib/billing-runtime';
export const dynamic="force-dynamic";
export const PATCH=(request:Request)=>action(request,async(s,body,user)=>{if(body&&typeof body==='object'&&'active' in body&&body.active===true)await requireBusinessSubscription(user);return s.saveProgram(body);});
