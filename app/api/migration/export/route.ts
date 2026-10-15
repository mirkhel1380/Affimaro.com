import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRawDb} from '../../../../db';
import {AppError} from '../../../../lib/service';
import {assertSameOrigin,readJson} from '../../../../lib/request';
import {publicOrigin} from '../../../../lib/public-origin-runtime';
import {requireMigrationOwner,encryptedMigration} from '../../../../self-hosted/migration';
export async function POST(request:Request){
  try{
    const user=await getChatGPTUser(),values=env as unknown as Record<string,unknown>;
    requireMigrationOwner(user?.userId,values);assertSameOrigin(request);const body=await readJson(request);
    if(!body||typeof body!=='object'||Object.keys(body).length!==1||!('confirmed' in body)||body.confirmed!==true)throw new AppError(400,'Confirm the encrypted migration export first.');
    const bundle=await encryptedMigration(getRawDb(),values,publicOrigin());
    return Response.json(bundle,{headers:{'Cache-Control':'private, no-store','Vary':'Cookie','Content-Disposition':'attachment; filename="affimaro-encrypted-migration.json"','X-Content-Type-Options':'nosniff'}});
  }catch(error){return Response.json({ok:false,error:error instanceof AppError?error.message:'The encrypted export could not be completed.'},{status:error instanceof AppError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
