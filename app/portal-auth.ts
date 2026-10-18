import {redirect} from 'next/navigation';
import {requireChatGPTUser} from './chatgpt-auth';
import {getRawDb} from '../db';
import {accountPortal,portalHome,type Portal} from '../lib/portal-policy';

export async function requirePortalUser(expected:Portal,path:string,allowUnset=false){
  const user=await requireChatGPTUser(path),actual=await accountPortal(getRawDb(),user.userId);
  if(actual!==expected&&!(allowUnset&&actual===null))redirect(actual?portalHome(actual):'/get-started');
  return user;
}
