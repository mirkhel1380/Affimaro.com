import landing from "../public/demo/index.html?raw";
export const GET=()=>new Response(landing,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
