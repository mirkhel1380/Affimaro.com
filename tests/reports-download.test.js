import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),cache=join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true});const temp=mkdtempSync(join(cache,'report-download-'));after(()=>rmSync(temp,{recursive:true,force:true}));
const bundle=await build({entryPoints:[join(root,'app/reports/export-button.tsx')],write:false,bundle:true,platform:'node',format:'esm',target:'node22',jsx:'automatic',packages:'external'}),path=join(temp,'download.mjs');writeFileSync(path,bundle.outputFiles[0].contents);const {downloadReportCsv}=await import(pathToFileURL(path).href);

test('successful CSV saves use the filtered authenticated response and clean up the download URL',async t=>{
 const events=[],query='view=business&range=custom&from=2026-10-24&to=2026-10-24',filename='affimaro-business-report-2026-10-24-2026-10-24.csv';let savedBlob,cleanup;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,'/api/reports/export?'+query);assert.equal(init.credentials,'same-origin');return new Response('\uFEFF"section"\r\n"performance_total"\r\n',{headers:{'Content-Type':'text/csv; charset=utf-8'}});});
 t.mock.method(URL,'createObjectURL',blob=>{savedBlob=blob;return 'blob:fixture-download';});t.mock.method(URL,'revokeObjectURL',url=>events.push('revoke '+url));t.mock.method(globalThis,'setTimeout',(fn,delay)=>{assert.equal(delay,1000);cleanup=fn;return 0;});
 const original=globalThis.document;t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});const link={href:'',download:'',click(){events.push('click');},remove(){events.push('remove');}};globalThis.document={body:{appendChild(node){assert.equal(node,link);events.push('append');}},createElement(tag){assert.equal(tag,'a');return link;}};
 await downloadReportCsv(query,filename);assert.equal(link.href,'blob:fixture-download');assert.equal(link.download,filename);assert.deepEqual(events,['append','click','remove']);assert.deepEqual([...new Uint8Array(await savedBlob.arrayBuffer()).slice(0,3)],[0xEF,0xBB,0xBF]);cleanup();assert.equal(events.at(-1),'revoke blob:fixture-download');
});

test('server size, permission and session errors are surfaced without creating a downloaded file',async t=>{
 let created=0;t.mock.method(URL,'createObjectURL',()=>{created++;throw new Error('Unexpected download');});
 for(const [status,error] of [[409,'Narrow the report to 5,000 rows.'],[401,'Sign in to export your report.'],[403,'Wait for approval.'],[413,'Exact report limit exceeded.']]){t.mock.method(globalThis,'fetch',async()=>Response.json({ok:false,error},{status}));await assert.rejects(downloadReportCsv('view=business','report.csv'),e=>e.message===error);}
 t.mock.method(globalThis,'fetch',async()=>new Response('Unavailable',{status:503}));await assert.rejects(downloadReportCsv('view=business','report.csv'),/could not be prepared/);assert.equal(created,0);
});

test('a successful sign-in HTML or other non-CSV response cannot be saved as a performance report',async t=>{
 let created=0;t.mock.method(URL,'createObjectURL',()=>{created++;throw new Error('Unexpected download');});for(const type of ['text/html','application/json','text/csv-extra','text/plain']){t.mock.method(globalThis,'fetch',async()=>new Response('<form>Sign in</form>',{headers:{'Content-Type':type}}));await assert.rejects(downloadReportCsv('view=affiliate','report.csv'),/Sign in again/);}assert.equal(created,0);
});
