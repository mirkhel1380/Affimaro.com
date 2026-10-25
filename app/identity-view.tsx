import {requirePortalUser} from './portal-auth';
import {getRawDb} from '../db';
import {service} from '../lib/service';
import {identitySnapshot} from '../lib/identity-verification';
import {identityPath} from '../lib/identity-catalog';
import {emailSignIn} from '../lib/auth-mode';
import {IdentityPanel} from './identity-panel';
import {Shell,PageHeading} from './ui';
export async function IdentityView({portal}:{portal:'affiliate'|'creator'}){const user=await requirePortalUser(portal,identityPath(portal)),db=getRawDb(),account=await service(db,user).account(),snapshot=await identitySnapshot(db,user.userId);return <Shell portal={portal} active="identity" name={account?.display_name||'Account'} email={user.email}><PageHeading eyebrow="ACCOUNT PROTECTION" title="Identity verification" description="One private review before your first commission payment. Your earnings remain recorded while the review is pending."/><IdentityPanel initial={snapshot} enabled={emailSignIn}/></Shell>;}
