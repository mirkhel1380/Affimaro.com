import {requireChatGPTUser} from '../chatgpt-auth';
import {getRawDb} from '../../db';
import {requirePlatformAdmin} from '../../lib/admissions';
export async function ownerContext(path='/owner'){
 const user=await requireChatGPTUser(path,{allowApplication:true}),db=getRawDb();
 await requirePlatformAdmin(db,user);
 return {user,db};
}
