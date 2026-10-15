import { action } from "../../../lib/http";
export const dynamic="force-dynamic";
export const POST=(request:Request)=>action(request,(s,body)=>s.createBusiness(body));
export const PATCH=(request:Request)=>action(request,(s,body)=>s.saveBusiness(body));
