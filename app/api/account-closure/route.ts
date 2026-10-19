// Independent hosting handles password reauthentication and cookie revocation in its auth boundary.
export function POST(){return Response.json({ok:false,error:'Close your account from the independent Affimaro website.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
