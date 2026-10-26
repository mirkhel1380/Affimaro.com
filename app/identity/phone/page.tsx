import {emailSignIn} from '../../../lib/auth-mode';
import {IdentityPhoneResume} from './phone-resume';
export const dynamic='force-dynamic';
export const metadata={title:'Continue on your phone | Affimaro',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function Page(){return <IdentityPhoneResume enabled={emailSignIn}/>;}
