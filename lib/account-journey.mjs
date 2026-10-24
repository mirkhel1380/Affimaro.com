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

// A successful profile submission is a new package choice. Keep that choice
// in a fresh billing continuation instead of returning to an older signup plan.
// Existing checkout returns, invitations and other destinations keep their URL.
export function applicationSubmissionPath(portal,returnTo,plan){
 if(!['brand','agency'].includes(portal)||!['starter','growth','business'].includes(plan)||typeof returnTo!=='string')return null;
 let url;try{url=new URL(returnTo,'https://app.local');}catch{return null;}
 if(!returnTo.startsWith('/')||returnTo.startsWith('//')||url.origin!=='https://app.local'||!['/billing','/agency/billing'].includes(url.pathname)||url.searchParams.getAll('plan').length>1||[...url.searchParams.keys()].some(key=>key!=='plan'))return null;
 url.pathname=portal==='agency'?'/agency/billing':'/billing';url.searchParams.set('plan',plan);
 return '/application?'+new URLSearchParams({return_to:url.pathname+url.search+url.hash});
}
