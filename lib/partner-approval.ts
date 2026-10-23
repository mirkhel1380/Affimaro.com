// This snapshot is created by the server's applicant review, never from a form.
export type PartnerApprovalSnapshot={applicationId:string;partnerId:string;applicationStatus:string;applicationUpdatedAt:string;admissionRevision:number;properties:{id:string;revision:number}[]};
export function partnerApprovalCondition(snapshot:PartnerApprovalSnapshot,at=Date.now()){
 return {sql:` AND applications.id=? AND applications.affiliate_user_id=? AND applications.status=? AND applications.updated_at=?
  AND EXISTS(SELECT 1 FROM platform_applications approved WHERE approved.user_id=applications.affiliate_user_id AND approved.status='approved' AND approved.revision=?)
  AND (SELECT count(*) FROM media_properties m WHERE m.user_id=applications.affiliate_user_id AND m.archived=0)=?
  AND NOT EXISTS(SELECT 1 FROM media_properties m WHERE m.user_id=applications.affiliate_user_id AND m.archived=0 AND (m.status<>'verified' OR m.verified_at IS NULL OR m.verified_at<?))
  AND NOT EXISTS(SELECT 1 FROM json_each(?) evidence WHERE NOT EXISTS(SELECT 1 FROM media_properties m WHERE m.id=json_extract(evidence.value,'$.id') AND m.revision=json_extract(evidence.value,'$.revision') AND m.user_id=applications.affiliate_user_id AND m.archived=0 AND m.status='verified'))`,
  values:[snapshot.applicationId,snapshot.partnerId,snapshot.applicationStatus,snapshot.applicationUpdatedAt,snapshot.admissionRevision,snapshot.properties.length,new Date(at-180*86400000).toISOString(),JSON.stringify(snapshot.properties)]};
}
