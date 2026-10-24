import {CommissionReviewView} from '../../commission-review-view';
export const dynamic='force-dynamic';
export const metadata={title:'Commission approvals | Affimaro',robots:{index:false,follow:false}};
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return CommissionReviewView({portal:'brand',searchParams});}
