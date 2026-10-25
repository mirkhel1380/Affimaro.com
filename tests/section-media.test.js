import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {marketingPages,renderMarketingDocument} from '../lib/marketing-content.mjs';
import {interiorPhoto} from '../lib/marketing-media.mjs';
import {storePlatforms} from '../lib/store-platform-catalog.mjs';
const file=path=>new URL('../'+path,import.meta.url),sprite=readFileSync(file('content/icon-sprite.html'),'utf8');
test('canonical sections have distinct real photos, responsive variants and four distinct role headers',()=>{
 const paths=[...Object.keys(marketingPages).filter(p=>p!=='/'&&!p.startsWith('/demo/')),'/pricing','/install','/preview'];assert.equal(paths.length,35);const names=paths.map(p=>interiorPhoto(p).name);assert.equal(new Set(names).size,35);const hashes=[];
 for(const path of paths){const photo=interiorPhoto(path);assert.ok(photo.alt.length>10);for(const small of ['', '-small']){const asset=file('public/images/page-'+photo.name+small+'.webp');assert.ok(existsSync(asset),path);const data=readFileSync(asset);assert.equal(data.subarray(0,4).toString(),'RIFF');hashes.push(createHash('sha256').update(data).digest('hex'));}assert.equal(interiorPhoto(path+'/?from=menu').name,photo.name);}
 assert.equal(new Set(hashes).size,70);assert.equal(new Set(['brand','affiliate','creator','agency'].map(p=>interiorPhoto('/auth/'+p+'/signup').name)).size,4);const home=renderMarketingDocument('/',sprite);assert.ok(home.includes('partnership-collaboration.webp'));assert.ok(!home.includes('m-interior-photo'));
});
test('compact platform choices use clean local SVG brand marks and keep official sign-in and verified setup distinct',()=>{
 const html=renderMarketingDocument('/integrations',sprite);for(const p of storePlatforms){const slug=p.id==='wordpress-com'?'wordpress':p.id,svg=readFileSync(file('public/platform-logos/'+slug+'.svg'),'utf8');assert.match(svg,/viewBox="0 0 24 24"/);assert.ok(!/<script|foreignObject|\son\w+=|href=|src=/i.test(svg));assert.ok(html.includes('/platform-logos/'+slug+'.svg'));if(p.loginUrl)assert.ok(html.includes('href="'+p.loginUrl+'" target="_blank" rel="noopener noreferrer"'));}
 assert.match(html,/<details class="m-platform-detail"><summary>Open your WordPress admin/);assert.ok(!html.includes('<details class="m-platform-detail" open'));const css=readFileSync(file('public/marketing.css'),'utf8');assert.match(css,/\.m-affiliate-hero\{background:#eef3e5/);assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
