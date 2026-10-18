import template from '../../../content/demo-page.html?raw';
export async function GET(_request:Request,{params}:{params:Promise<{portal:string}>}){
  const {portal}=await params;if(!['brands','affiliates'].includes(portal))return new Response('Demo not found.',{status:404});
  return new Response(template.replaceAll('{{portal}}',portal),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
