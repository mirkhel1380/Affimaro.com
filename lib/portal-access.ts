import {AppError,type Identity} from './service.ts';
import {accountPortal,portalName,portalFamily,type Portal} from './portal-policy.ts';
export async function requireAccountPortal(db:D1Database,identity:Identity,expected:Portal,allowUnset=false){
  const actual=await accountPortal(db,identity.userId);
  if(actual!==expected&&!(actual&&['brand','affiliate'].includes(expected)&&portalFamily(actual)===expected)&&!(allowUnset&&actual===null))throw new AppError(403,actual?`This is a ${portalName(actual).toLowerCase()} account. Use its own portal.`:'Complete your account setup first.');
  return actual;
}
