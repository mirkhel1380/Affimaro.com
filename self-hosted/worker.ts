import handler from 'vinext/server/fetch-handler';
import {independentFetch} from './bridge';
export default {
  fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext){
    return independentFetch(request,env as unknown as Record<string,unknown>&{DB:D1Database},verified=>handler.fetch(verified,env,ctx));
  },
};
