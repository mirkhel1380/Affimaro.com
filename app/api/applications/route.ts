import { action } from "../../../lib/http";
export const dynamic="force-dynamic";
export const POST=(request:Request)=>action(request,(s,body)=>s.apply(body));
export const PATCH=(request:Request)=>action(request,(s,body)=>s.review(body));
