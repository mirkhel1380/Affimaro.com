import {ownerContext} from '../context';
import {OwnerShell} from '../shell';
import {PageHeading} from '../../ui';
import {SecurityPanel} from '../../settings/security-panel';
export const dynamic='force-dynamic';
export const metadata={title:'Owner security | Affimaro',robots:{index:false,follow:false}};
export default async function SecurityPage(){const {user}=await ownerContext('/owner/security');return <OwnerShell name={user.fullName||'Owner'} email={user.email} active="security"><PageHeading title="Protect your owner account." description="Manage verification methods and signed-in sessions in your private portal."/><SecurityPanel owner/><p className="a-spaced-link"><a className="a-text-link" href="/auth/owner/recover?return_to=%2Fowner%2Fsecurity">Change password with verified email recovery</a></p></OwnerShell>;}
