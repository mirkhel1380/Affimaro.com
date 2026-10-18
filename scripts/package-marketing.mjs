import {readFileSync,writeFileSync} from 'node:fs';
import {renderMarketingDocument} from '../lib/marketing-content.mjs';
const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8');
writeFileSync(new URL('../public/demo/index.html',import.meta.url),renderMarketingDocument('/',sprite));
console.log('Built the public homepage from the shared marketing content.');
