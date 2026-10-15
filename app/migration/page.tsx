import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {getChatGPTUser} from '../chatgpt-auth';
import {requireMigrationOwner} from '../../self-hosted/migration';
import {ExportButton} from './export-button';
export const dynamic='force-dynamic';
export default async function MigrationPage(){
  const user=await getChatGPTUser(),values=env as unknown as Record<string,unknown>;
  try{requireMigrationOwner(user?.userId,values);}catch{notFound();}
  return <main className="a-main" style={{maxWidth:760,margin:'40px auto'}}><h1>Move your Affimaro data</h1><p>This operator export includes all business records and the original payment encryption key. It is encrypted for the public key configured on this site. Active sign-in sessions are excluded.</p><p>Source status: <strong>{values.AFFIMARO_MIGRATION_MAINTENANCE==='true'?'Paused for migration':'Running — pause before exporting'}</strong></p><p>Resolve pending financial operations, pause the source and wait at least two minutes before exporting. Follow the independent-hosting guide for import and verified account mapping.</p><ExportButton/><p><a href="/">Return to Affimaro</a></p></main>;
}
