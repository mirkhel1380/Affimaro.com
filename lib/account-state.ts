import {AppError} from './service.ts';
export async function isAccountClosed(db:D1Database,userId:string){return !!await db.prepare('SELECT user_id FROM account_closures WHERE user_id=?').bind(userId).first();}
export async function assertAccountOpen(db:D1Database,userId:string){if(await isAccountClosed(db,userId))throw new AppError(403,'This Affimaro account is closed. Contact support if you need help with retained records.');}
