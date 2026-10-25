export type PortalPageQuery=Record<string,string|string[]|undefined>;

// The caller supplies its own fixed portal route and known view fields. Keep
// high-priority selections first and fit the existing 500-character Auth limit.
export function portalReturnPath(path:string,raw:PortalPageQuery,limits:Record<string,number>){
 const query=new URLSearchParams();
 for(const [key,max] of Object.entries(limits)){
  const value=raw[key];if(typeof value!=='string'||!value||/[\u0000-\u001f\u007f]/.test(value))continue;
  query.set(key,value.slice(0,max));if((path+'?'+query).length>500)query.delete(key);
 }
 return path+(query.size?'?'+query:'');
}
