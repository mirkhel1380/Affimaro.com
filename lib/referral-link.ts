// One format for eligible links in the affiliate portal and invitation page.
export function storeReferralLink(link:{platform:string;store_url:string;application_id:string;program_id:string}){
  return link.platform==='shopify'?`${link.store_url}/?ref=af_${link.application_id}&utm_source=affimaro&utm_medium=affiliate&utm_campaign=${link.program_id}&utm_content=${link.application_id}`:`${link.store_url}/?affimaro_ref=${link.application_id}`;
}

export const trackedReferralPath=(applicationId:string)=>'/r/'+applicationId;
