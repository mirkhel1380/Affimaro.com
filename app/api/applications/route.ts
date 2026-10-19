import {getRawDb} from '../../../db';
import {requireApprovedAccount} from '../../../lib/admissions';
import {assertVerifiedProfile} from '../../../lib/media-properties';
import { action } from "../../../lib/http";
import {requireBusinessSubscription} from '../../../lib/billing-runtime';
export const dynamic="force-dynamic";
export const POST=(request:Request)=>action(request,async(s,body,user)=>{const app=await requireApprovedAccount(getRawDb(),user);await assertVerifiedProfile(getRawDb(),user.userId,JSON.parse(app.profile_json));return s.apply(body);});
export const PATCH=(request:Request)=>action(request,async(s,body,user)=>{if(body&&typeof body==='object'&&'status' in body&&body.status==='approved')await requireBusinessSubscription(user);return s.review(body);});
