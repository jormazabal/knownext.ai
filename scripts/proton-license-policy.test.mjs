import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseLicense,chooseFileLicense,nugetAssetUsage} from '../native/proton-sdk/license-policy.mjs';

test('self_cell selects Apache without treating the optional GPL alternative as mandatory',()=>{
 const result=chooseLicense('Apache-2.0 OR GPL-2.0-only');
 assert.equal(result.selected,'Apache-2.0');assert.equal(result.reviewRequired,false);
 assert.equal(result.declared,'Apache-2.0 OR GPL-2.0-only');
});
test('r-efi selects MIT while retaining its original triple-license declaration',()=>{
 const result=chooseLicense('MIT OR Apache-2.0 OR LGPL-2.1-or-later');
 assert.equal(result.selected,'MIT');assert.equal(result.reviewRequired,false);
 assert.match(result.declared,/LGPL/);
});
test('mandatory GPL and GPL conjunction cannot be bypassed by a permissive component',()=>{
 for(const expression of ['GPL-2.0-only','LGPL-2.1-or-later','AGPL-3.0-only','MIT AND GPL-2.0-only','GPL-2.0-only AND MIT','MIT AND (GPL-2.0-only OR LGPL-2.1-or-later)']){
  assert.equal(chooseLicense(expression).reviewRequired,true,expression);
  assert.equal(chooseLicense(expression).selected,null,expression);
 }
});
test('parentheses and AND precedence select a complete permitted branch',()=>{
 assert.equal(chooseLicense('(MIT OR GPL-2.0-only) AND Apache-2.0').selected,'MIT AND Apache-2.0');
 assert.equal(chooseLicense('GPL-2.0-only OR MIT AND Apache-2.0').selected,'MIT AND Apache-2.0');
 assert.equal(chooseLicense('(GPL-2.0-only AND MIT) OR BSD-3-Clause').selected,'BSD-3-Clause');
 assert.equal(chooseLicense('(MIT OR Apache-2.0) AND Unicode-3.0').selected,'MIT AND Unicode-3.0');
});
test('unknown terms, malformed expressions and unknown exceptions stay blocked',()=>{
 for(const expression of ['LicenseRef-Private','MIT AND LicenseRef-Private','MIT AND','MIT OR','(MIT OR GPL-2.0-only','MIT) OR GPL-2.0-only','MIT WITH Unknown-exception','MIT + GPL-2.0-only',''])assert.equal(chooseLicense(expression).reviewRequired,true,expression);
});
test('the known LLVM exception and Cargo legacy alternatives remain explicit',()=>{
 assert.equal(chooseLicense('Apache-2.0 WITH LLVM-exception').selected,'Apache-2.0 WITH LLVM-exception');
 assert.equal(chooseLicense('MIT/Apache-2.0').selected,'MIT');
 assert.equal(chooseLicense('Apache-2.0 / MIT').selected,'Apache-2.0');
 assert.equal(chooseLicense('bzip2-1.0.6').reviewRequired,false);
});
test('MPL remains an explicit review rather than a permissive selection',()=>{
 assert.equal(chooseLicense('MPL-2.0').reviewRequired,true);
 assert.equal(chooseLicense('MPL-2.0').selected,null);
});
test('file-only licenses require retained evidence and real build-only asset proof',()=>{
 const missing=nugetAssetUsage({},'Tool/1');assert.equal(missing.buildOnly,false);assert.equal(chooseFileLicense('Tool/1','Original tool license',missing).reviewRequired,true);
 const build={targets:{net10:{'Tool/1':{type:'package',build:{'build/tool.targets':{}}}}}};
 const usage=nugetAssetUsage(build,'Tool/1');
 assert.equal(usage.buildOnly,true);
 assert.equal(chooseFileLicense('Tool/1','Original tool license',usage).reviewRequired,false);
 assert.equal(chooseFileLicense('Tool/1','',usage).reviewRequired,true);
 const runtime={targets:{net10:{'Tool/1':{type:'package',compile:{'lib/tool.dll':{}}}}}};
 const mixed=nugetAssetUsage([build,runtime],'Tool/1');
 assert.equal(mixed.buildOnly,false);
 assert.equal(chooseFileLicense('Tool/1','Original tool license',mixed).reviewRequired,true);
 assert.equal(chooseFileLicense('Unknown/1','GPL text',{buildOnly:false}).reviewRequired,true);
});
test('the exact pinned SQLite dedication is distinguished from an unknown file license',()=>{
 const text='\r\nSQLite is Public Domain\r\n\r\nhttps://sqlite.org/copyright.html\r\n';
 assert.equal(chooseFileLicense('SQLite/3.54.0',text,{buildOnly:false}).reviewRequired,false);
 assert.equal(chooseFileLicense('Other/1',text,{buildOnly:false}).reviewRequired,true);
 assert.equal(chooseFileLicense('SQLite/3.54.0',text+' changed',{buildOnly:false}).reviewRequired,true);
});
