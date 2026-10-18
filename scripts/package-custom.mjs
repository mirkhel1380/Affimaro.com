import {copyFileSync,mkdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),target=new URL('public/downloads/',root);
mkdirSync(target,{recursive:true});
copyFileSync(new URL('integrations/custom/affimaro.mjs',root),new URL('affimaro-custom.mjs',target));
copyFileSync(new URL('integrations/custom/README.md',root),new URL('custom-website-setup.md',target));
console.log('Built custom website client and setup guide.');
