import {notFound} from 'next/navigation';
import {getRawDb} from '../../../db';
import {requireChatGPTUser} from '../../chatgpt-auth';
import {emailSignIn} from '../../../lib/auth-mode';
import {nativeConfirmationAccount} from '../../../self-hosted/native-email-confirmation';
import {Shell,Card} from '../../ui';
import {ConfirmationForm} from './confirmation-form';
export const dynamic='force-dynamic';
export const metadata={title:'Affimaro — Confirm your setup email',robots:{index:false,follow:false}};
export default async function ConfirmEmailPage(){
  if(emailSignIn)notFound();
  const user=await requireChatGPTUser('/setup/confirm-email');
  let account;try{account=await nativeConfirmationAccount(true,getRawDb(),user);}catch{notFound();}
  return <Shell name={user.fullName||user.email.split('@')[0]} email={user.email} active="account"><div lang="en" dir="ltr" style={{maxWidth:620,margin:'24px auto'}}><Card title="Confirm your Affimaro email"><div className="a-card-body"><p style={{lineHeight:1.9}}>Enter the latest verification code from your email.</p><p dir="ltr" style={{overflowWrap:'anywhere',fontWeight:600}}>{account.email}</p><ConfirmationForm/><p className="a-muted" style={{marginTop:24,lineHeight:1.9}}>Once your email is verified, you can continue setting up Affimaro.</p></div></Card></div></Shell>;
}
