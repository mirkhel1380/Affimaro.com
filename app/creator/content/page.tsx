import {CreatorWorkspace} from '../page';
export const dynamic='force-dynamic';
export default function Content({searchParams=Promise.resolve({})}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){return CreatorWorkspace('content',searchParams);}
