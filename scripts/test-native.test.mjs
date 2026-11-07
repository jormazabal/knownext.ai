import {test} from "node:test";
import assert from "node:assert/strict";
import {nativeFixtureVariables,runNativeRegression} from "./test-native.mjs";

test("native regression cannot inherit external probe paths or enable ignored campaigns",()=>{
 const environment={PATH:"toolchain",CARGO_TARGET_DIR:"test-cache",...Object.fromEntries(nativeFixtureVariables.map(name=>[name,"external-fixture"]))};
 let observed;const result=runNativeRegression({environment,execute:(command,args,options)=>{observed={command,args,options};return{status:0};}});
 assert.equal(result,0);assert.equal(observed.command,"cargo");assert.ok(observed.args.includes("--workspace"));assert.ok(observed.args.includes("--lib"));assert.ok(observed.args.includes("--tests"));assert.ok(observed.args.includes("--no-fail-fast"));assert.ok(observed.args.includes("--test-threads=1"));assert.ok(!observed.args.includes("--ignored"));assert.ok(!observed.args.includes("--include-ignored"));
 for(const key of nativeFixtureVariables){assert.equal(observed.options.env[key],undefined);assert.equal(environment[key],"external-fixture");}
 assert.equal(observed.options.env.PATH,"toolchain");assert.equal(observed.options.env.CARGO_TARGET_DIR,"test-cache");assert.equal(observed.options.windowsHide,true);assert.equal(observed.options.stdio,"inherit");assert.ok(!observed.options.shell);
});
test("native regression preserves a failing child exit code",()=>{assert.equal(runNativeRegression({environment:{},execute:()=>({status:7})}),7);assert.equal(runNativeRegression({environment:{},execute:()=>({status:null})}),1);});
