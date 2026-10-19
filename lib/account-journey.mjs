// Free accounts keep invitations and their own portal destinations, while old
// subscription links return them to their free account instead of billing.
export function accountReturnTo(portal,value){
 if(portal!=='affiliate'&&portal!=='creator')return value;
 const home=portal==='affiliate'?'/partner':'/creator';
 try{
  const url=new URL(value,'https://app.local');
  if(url.origin!=='https://app.local'||/^\/(?:billing|agency\/billing)(\/|$)/.test(url.pathname)||(url.pathname==='/get-started'&&url.searchParams.has('plan')))return home;
 }catch{return home;}
 return value;
}
