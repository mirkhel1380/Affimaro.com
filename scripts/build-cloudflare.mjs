import {spawnSync} from 'node:child_process';

for(const args of [['run','check'],['exec','--','tsc','--noEmit'],['run','build:self-hosted']]){
  const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{stdio:'inherit',shell:process.platform==='win32'});
  if(result.status!==0)process.exit(result.status||1);
}
