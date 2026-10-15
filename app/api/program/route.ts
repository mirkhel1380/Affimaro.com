import { action } from "../../../lib/http";
export const dynamic="force-dynamic";
export const PATCH=(request:Request)=>action(request,(s,body)=>s.saveProgram(body));
