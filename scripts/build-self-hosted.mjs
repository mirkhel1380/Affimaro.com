import {createBuilder} from 'vite';
import {execFileSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
const project=process.cwd(),stage=await mkdtemp(join(tmpdir(),'affimaro-build-'));
try{
  // Vinext currently writes some manifests to dist/ even with a custom outDir.
  // Build in an isolated source copy so the native Sites package is untouched.
  const paths=new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:project,encoding:'utf8'}).split('\0').filter(Boolean));
  for(const path of paths){if(path.startsWith('.env')||path.startsWith('.git/')||path.startsWith('dist/'))continue;await mkdir(dirname(join(stage,path)),{recursive:true});await cp(join(project,path),join(stage,path));}
  await symlink(join(project,'node_modules'),join(stage,'node_modules'),'dir');
  process.chdir(stage);
  const builder=await createBuilder({root:stage,configFile:join(stage,'vite.self-hosted.config.ts')});
  await builder.buildApp();
  const configPath=join(stage,'dist/server/wrangler.json'),config=JSON.parse(await readFile(configPath,'utf8'));
  config.d1_databases[0].migrations_dir='../../drizzle';
  await writeFile(configPath,JSON.stringify(config));
  process.chdir(project);
  await rm(join(project,'dist-self-hosted'),{recursive:true,force:true});
  await cp(join(stage,'dist'),join(project,'dist-self-hosted'),{recursive:true});
}finally{process.chdir(project);await rm(stage,{recursive:true,force:true});}
