import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const nativeTestConfig=JSON.stringify({bundle:{resources:['crates/knownext-docs/assets/fonts/OFL.txt']}});
function output(program,args){
  const r=spawnSync(program,args,{cwd:root,encoding:'utf8',windowsHide:true,shell:process.platform==='win32'&&program==='pnpm'});
  if(r.error||r.status!==0)throw new Error(`${program} did not complete successfully`);
  return r.stdout.trim();
}
function run(program,args,extraEnv={}){
  const r=spawnSync(program,args,{cwd:root,env:{...process.env,...extraEnv},stdio:'inherit',windowsHide:true,shell:process.platform==='win32'&&program==='pnpm'});
  if(r.error||r.status!==0)throw new Error(`${program} validation failed`);
}
function tools(){return {node:process.version,rust:output('rustc',['--version']),pnpm:output('pnpm',['--version']),git:output('git',['--version']),image:process.env.ImageVersion??'',nativeTestConfig,buildJobs:process.env.CARGO_BUILD_JOBS??'',devDebug:process.env.CARGO_PROFILE_DEV_DEBUG??'',testDebug:process.env.CARGO_PROFILE_TEST_DEBUG??''};}
export function reusableQuality({repository,tree,environment,run,commit,jobs,evidence}){
  if(!repository||!environment.image||run?.repository?.full_name!==repository||run?.head_repository?.full_name!==repository)return false;
  if(run.status!=='completed'||run.conclusion!=='success'||run.path!=='.github/workflows/quality.yml'||!['pull_request','workflow_dispatch'].includes(run.event))return false;
  if(commit?.sha!==run.head_sha||commit?.tree?.sha!==tree||evidence?.sourceHead!==run.head_sha||evidence?.tree!==tree)return false;
  if(evidence.runId!==String(run.id)||evidence.repository!==repository||evidence.frontend!=='passed'||evidence.native!=='passed')return false;
  if(Object.keys(environment).some(k=>environment[k]!==evidence.environment?.[k]))return false;
  return ['Frontend regression','Native regression with isolated fixtures'].every(name=>jobs?.some(job=>job.conclusion==='success'&&job.steps?.some(step=>step.name===name&&step.conclusion==='success')));
}
function recordQuality(){
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const result={repository:process.env.GITHUB_REPOSITORY,runId:process.env.GITHUB_RUN_ID,sourceHead:event.pull_request?.head?.sha??process.env.GITHUB_SHA,tree:output('git',['rev-parse','HEAD^{tree}']),environment:tools(),frontend:'passed',native:'passed'};
  fs.mkdirSync(path.join(root,'output'),{recursive:true});
  fs.writeFileSync(path.join(root,'output/quality-evidence.json'),JSON.stringify(result,null,2)+'\n');
}
function findQuality(){
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GH_TOKEN)return false;
  const repository=process.env.GITHUB_REPOSITORY;
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??''))return false;
  const tree=output('git',['rev-parse','HEAD^{tree}']),environment=tools();
  try{
    const runs=JSON.parse(output('gh',['api',`repos/${repository}/actions/workflows/quality.yml/runs?status=success&per_page=10`])).workflow_runs;
    for(const candidate of runs){
      if(!/^[0-9a-f]{40}$/.test(candidate.head_sha)||!Number.isSafeInteger(candidate.id))continue;
      const commit=JSON.parse(output('gh',['api',`repos/${repository}/git/commits/${candidate.head_sha}`]));
      if(commit.tree?.sha!==tree)continue;
      const dir=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP??os.tmpdir(),'knownext-quality-'));
      try{
        output('gh',['run','download',String(candidate.id),'--repo',repository,'--name','quality-evidence','--dir',dir]);
        const names=fs.readdirSync(dir);if(names.length!==1||names[0]!=='quality-evidence.json')continue;
        const evidence=JSON.parse(fs.readFileSync(path.join(dir,names[0]),'utf8'));
        const jobs=JSON.parse(output('gh',['api',`repos/${repository}/actions/runs/${candidate.id}/jobs?per_page=100`])).jobs;
        if(reusableQuality({repository,tree,environment,run:candidate,commit,jobs,evidence})){
          console.log(`Reusing successful Quality run ${candidate.id}: identical tree and toolchain/runner image.`);
          fs.mkdirSync(path.join(root,'output'),{recursive:true});
          fs.writeFileSync(path.join(root,'output/release-regression-evidence.json'),JSON.stringify({provider:'GitHub Actions',qualityRunId:candidate.id,tree,environment,reused:true},null,2)+'\n');
          return true;
        }
      }catch{ /* Missing/expired evidence requires a fresh regression. */ }
    }
  }catch{console.log('No matching authenticated Quality evidence; running the full regression.');}
  return false;
}
function releaseCheck(){
  run('pnpm',['version:check']);run('pnpm',['build']);run('pnpm',['bundle:check-clean']);
  const scripts=fs.readdirSync(path.join(root,'scripts')).filter(name=>name.endsWith('.test.mjs')).map(name=>`scripts/${name}`);
  run(process.execPath,['--test',...scripts]);
  if(!findQuality()){
    run('pnpm',['--filter','@knownext/desktop','test','--maxWorkers=4','--minWorkers=1']);
    // Tests use fake provider drivers; the signed production build below must
    // independently prepare and validate its real native SDK resources.
    run('pnpm',['rust:test'],{TAURI_CONFIG:nativeTestConfig});
  }
  console.log('Release validation passed.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.includes('--record-quality'))recordQuality();else releaseCheck();
}
