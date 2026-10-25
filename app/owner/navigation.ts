import {ownerDatasets} from '../../lib/owner';
import {portalReturnPath,type PortalPageQuery} from '../../lib/portal-return-path';

// A finite dataset selection can carry list context into account details.
// It never supplies a URL or grants access to a dataset or account.
export function ownerRecordSource(value:unknown){
 return typeof value==='string'&&value!=='users'&&Object.hasOwn(ownerDatasets,value)?value:undefined;
}
export function ownerUsersPath(query:PortalPageQuery){
 const source=ownerRecordSource(query.source);
 return portalReturnPath('/owner/users',source?{user:query.user,source,review:query.review,page:query.page,q:query.q}:{user:query.user,role:query.role,page:query.page,q:query.q},{user:200,source:14,role:10,review:8,page:6,q:120});
}
export function ownerAccountBackPath(query:PortalPageQuery){
 const source=ownerRecordSource(query.source);
 return source?portalReturnPath('/owner/data',{table:source,review:query.review,page:query.page,q:query.q},{table:14,review:8,page:6,q:120}):ownerUsersPath({...query,user:undefined});
}
