// This snapshot is created by the server's applicant review, never from a form.
export type PartnerApprovalSnapshot={applicationId:string;partnerId:string;applicationStatus:string;applicationUpdatedAt:string;admissionRevision:number;properties:{id:string;revision:number}[]};
export function profileApprovalCondition(userId:string,admissionRevision:number,properties:readonly {id:string;revision:number}[],at=Date.now()){
 if(!properties.length)return {sql:'0',values:[] as unknown[]};
 return {sql:`EXISTS(SELECT 1 FROM platform_applications approved WHERE approved.user_id=? AND approved.status='approved' AND approved.revision=?)
  AND NOT EXISTS(SELECT 1 FROM account_closures closed WHERE closed.user_id=?)
  AND (SELECT count(*) FROM media_properties m WHERE m.user_id=? AND m.archived=0)=?
  AND NOT EXISTS(SELECT 1 FROM media_properties m WHERE m.user_id=? AND m.archived=0 AND (m.status<>'verified' OR m.verified_at IS NULL OR m.verified_at<?))
  AND NOT EXISTS(SELECT 1 FROM json_each(?) evidence WHERE NOT EXISTS(SELECT 1 FROM media_properties m WHERE m.id=json_extract(evidence.value,'$.id') AND m.revision=json_extract(evidence.value,'$.revision') AND m.user_id=? AND m.archived=0 AND m.status='verified'))`,
  values:[userId,admissionRevision,userId,userId,properties.length,userId,new Date(at-180*86400000).toISOString(),JSON.stringify(properties.map(p=>({id:p.id,revision:p.revision}))),userId]};
}
export function partnerApprovalCondition(snapshot:PartnerApprovalSnapshot,at=Date.now()){
 const profile=profileApprovalCondition(snapshot.partnerId,snapshot.admissionRevision,snapshot.properties,at);
 return {sql:` AND applications.id=? AND applications.affiliate_user_id=? AND applications.status=? AND applications.updated_at=? AND (${profile.sql})`,values:[snapshot.applicationId,snapshot.partnerId,snapshot.applicationStatus,snapshot.applicationUpdatedAt,...profile.values]};
}
