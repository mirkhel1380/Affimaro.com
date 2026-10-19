export function GET(request:Request){return new Response(null,{status:307,headers:{Location:new URL('/preview',request.url).href,'Cache-Control':'no-store'}});}
