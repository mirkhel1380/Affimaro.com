import {requireChatGPTUser} from '../../chatgpt-auth';
import {getRawDb} from '../../../db';
import {getAdmission} from '../../../lib/admissions';
import {mediaPropertiesFor} from '../../../lib/media-properties';
import {Shell,PageHeading,Card} from '../../ui';
import {MediaManager} from '../media-manager';
import {applicationJourney} from '../../../lib/application-journey';
export const dynamic='force-dynamic';
export const metadata={title:'Channels & ownership | Affimaro',robots:{index:false,follow:false}};
export default async function ChannelsPage({searchParams=Promise.resolve({})}:{searchParams?:Promise<{return_to?:string}>}={}){const query=await searchParams,entry=applicationJourney(undefined,query.return_to),user=await requireChatGPTUser(entry.channels,{allowApplication:true}),db=getRawDb(),app=await getAdmission(db,user.userId),properties=await mediaPropertiesFor(db,user.userId),journey=applicationJourney(app?.portal,query.return_to);return <Shell name={user.fullName||user.email.split('@')[0]} email={user.email} portal={app?.portal||'affiliate'} active="channels" reviewOnly={app?.status!=='approved'}><PageHeading eyebrow="YOUR CHANNELS · VERIFIED CONTROL" title="Your platforms. Your proof." description="Add every website, social profile or publishing channel you plan to use. Each one has its own verification."/><Card title="Connected properties"><div className="a-card-body"><MediaManager properties={properties}/></div></Card><a className="a-btn a-btn-outline a-spaced-link" href={journey.resume}>Back to your application</a></Shell>;}
