import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const testFile=resolve(root,'tests/woocommerce-plugin.php');
const wasmRoot=process.argv[2];
if(!wasmRoot){
  const result=spawnSync('php',[testFile],{encoding:'utf8'});
  if(result.error)throw new Error('PHP is unavailable. Pass a separate QA directory containing @php-wasm/node and @php-wasm/universal.');
  if(result.status!==0)throw new Error(result.stderr||result.stdout);
  console.log(JSON.parse(result.stdout));
}else{
  const require=createRequire(resolve(wasmRoot,'package.json'));
  const {PHP}=await import(pathToFileURL(require.resolve('@php-wasm/universal')).href);
  const {loadNodeRuntime}=await import(pathToFileURL(require.resolve('@php-wasm/node')).href);
  const php=new PHP(await loadNodeRuntime(process.argv[3]||'8.3',{emscriptenOptions:{processId:process.pid}}));
  try{
    php.mkdir('/app/tests');php.mkdir('/app/integrations/woocommerce/affimaro');
    php.writeFile('/app/tests/woocommerce-plugin.php',await readFile(testFile));
    php.writeFile('/app/integrations/woocommerce/affimaro/affimaro.php',await readFile(resolve(root,'integrations/woocommerce/affimaro/affimaro.php')));
    const result=await php.run({scriptPath:'/app/tests/woocommerce-plugin.php'});
    if(result.exitCode!==0||result.errors)throw new Error(result.errors||result.text);
    console.log(JSON.parse(result.text));
  }finally{php.exit();}
}
