import {notFound} from 'next/navigation';
import {Shell} from '../../../ui';
import {previewRoles,previewSections,initialPreviewState,sampleDirectory} from '../../../../lib/portal-preview';
import type {Portal} from '../../../../lib/portal-policy';
import {PreviewWorkspace} from '../../workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Portal preview | Affimaro',robots:{index:false,follow:false}};
export default async function PortalPreview({params,searchParams}:{params:Promise<{portal:string;path?:string[]}>;searchParams:Promise<{tab?:string}>}){
 const args=await params,query=await searchParams;if(!previewRoles.includes(args.portal as Portal))notFound();const portal=args.portal as Portal,section=args.path?.[0]||'overview',detailId=args.path?.[1]==='profile'?args.path?.[2]||'':'';
 if(!previewSections(portal).includes(section)||args.path&&args.path.length>1&&!(section==='discover'&&args.path[1]==='profile'&&args.path.length===3&&sampleDirectory.some(p=>p.id===detailId)))notFound();
 const active=({overview:portal==='creator'?'creator':portal==='agency'?'agency':portal==='brand'?'business':'partner',resources:'resources',clicks:'clicks',account:'account',start:'start',relationships:query.tab==='invitations'?'invitations':'relationships',discover:'discover',application:'application',ownership:'ownership',settings:'settings','close-account':'settings',program:'business',partners:'relationships',store:'business',orders:'business',payments:'payments',reports:'reports',billing:'billing',content:'content',clients:'clients',profile:'profile'} as Record<string,string>)[section];
 return <Shell portal={portal} name={initialPreviewState(portal).displayName} email={portal+'@preview.example'} active={active} previewMode><PreviewWorkspace key={portal+'/'+section+'/'+(query.tab||'all')+'/'+detailId} portal={portal} section={section} tab={query.tab||'all'} detailId={detailId}/></Shell>;
}
