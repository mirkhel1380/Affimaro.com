import {notFound} from 'next/navigation';
import {emailSignIn} from '../../../lib/auth-mode';
import {programInvitation} from '../../../lib/program-invitation';
import {AppError} from '../../../lib/service';
import {requireChatGPTUser} from '../../chatgpt-auth';
import {getRawDb} from '../../../db';
import {Shell} from '../../ui';
import {InvitationView} from '../invitation-view';
export const dynamic='force-dynamic';
export const metadata={title:'Program invitation | Affimaro',robots:{index:false,follow:false}};
export default async function JoinPage({params}:{params:Promise<{programId:string}>}){
  const {programId}=await params;
  return <AuthenticatedProgram programId={programId}/>;
}
async function AuthenticatedProgram({programId}:{programId:string}){
  const user=await requireChatGPTUser('/join/'+encodeURIComponent(programId));
  let invitation;
  try{invitation=await programInvitation(getRawDb(),user,programId);}
  catch(error){if(error instanceof AppError&&error.status===404)notFound();throw error;}
  return <Shell name={invitation.account?.display_name||user.fullName||user.email.split('@')[0]} email={user.email} active="relationships" portal={invitation.portal||'affiliate'}><InvitationView invitation={invitation} user={user} independent={emailSignIn}/></Shell>;
}
