import {trustedPublicOrigin} from './public-origin.ts';

// Native preview navigation must leave its frame for independent email sign-in.
// Keep section links, the local demo, downloads and independent-host URLs intact.
export function handoffLandingLinks(html:string,independentOrigin:string){
  const origin=trustedPublicOrigin(independentOrigin);
  return html.replace(/<a\b[^>]*>/g,tag=>{
    const href=tag.match(/\shref="([^"]+)"/)?.[1];
    if(!href||!/^\/(account|start|workspace|partner|payments|reports|billing|join|install)([/?#]|$)/.test(href))return tag;
    return tag.replace(/\s+target="[^"]*"/g,'').replace(/\shref="[^"]+"/,` href="${origin}${href}" target="_top"`);
  });
}
