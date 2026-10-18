import {readFileSync,writeFileSync} from 'node:fs';
import {renderMarketingDocument} from '../lib/marketing-content.mjs';
import {pricingSection} from '../lib/pricing-catalog.mjs';
const sprite=readFileSync(new URL('../content/icon-sprite.html',import.meta.url),'utf8');
writeFileSync(new URL('../public/demo/index.html',import.meta.url),renderMarketingDocument('/',sprite));
writeFileSync(new URL('../content/pricing-section.html',import.meta.url),pricingSection());
console.log('Built the public homepage from the shared marketing content.');
