import {spawnSync} from "node:child_process";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const nativeFixtureVariables=["KNOWNEXT_SHARED_PROJECT_FIXTURE","KNOWNEXT_SHARED_STATE_FIXTURE","KNOWNEXT_SHARED_MODE","KNOWNEXT_OWNED_LOCK_FIXTURE","KNOWNEXT_OWNED_LOCK_MODE"];
export function runNativeRegression({environment=process.env,execute=spawnSync}={}){
  const env={...environment};
  // Probe parents provide their own temporary paths to child processes. Never
  // inherit a caller's explicit probe path into an ordinary workspace campaign.
  for(const key of nativeFixtureVariables)delete env[key];
  const result=execute("cargo",["test","--manifest-path",resolve(repoRoot,"apps/desktop/src-tauri/Cargo.toml"),"--workspace","--lib","--tests","--no-fail-fast","--","--test-threads=1"],{cwd:repoRoot,env,stdio:"inherit",windowsHide:true});
  if(result.error)throw result.error;
  return result.status??1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=runNativeRegression();
