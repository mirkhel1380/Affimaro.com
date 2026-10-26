import {applicationProfile} from '../../../lib/application-profile';
import type {Portal} from '../../../lib/portal-policy';
export function ProfileFindings({portal,profile}:{portal:Portal;profile:Record<string,unknown>}){
 const parsed=applicationProfile(portal,profile);if(parsed.success)return null;
 return <div className="a-note"><strong>Profile details needing attention</strong><p>These findings do not block your decision. You can approve, request more information or decline. Incomplete profiles start with basic account details; approval does not verify a website, create a store connection or start payment.</p><ul>{parsed.error.issues.slice(0,12).map((issue,index)=><li key={index}>{issue.path.join('.')||'Profile'}: {issue.message}</li>)}</ul>{parsed.error.issues.length>12&&<p>{parsed.error.issues.length-12} more fields need attention in the submitted profile.</p>}</div>;
}
