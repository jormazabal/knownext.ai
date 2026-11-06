import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertInstallerResources,fontLicenseResource} from './check-installer-resources.mjs';
const config={bundle:{resources:[fontLicenseResource]}},expected='C:/knownext/crates/OFL.txt';
test('the exact legal resource and caller source are admitted',()=>assert.doesNotThrow(()=>assertInstallerResources(config,expected,expected)));
test('additional or replaced resources cannot be silently omitted by the template',()=>{
 for(const resources of [[],[fontLicenseResource,'extra.bin'],['replacement.txt'],{'OFL.txt':'elsewhere'}])assert.throws(()=>assertInstallerResources({bundle:{resources}},expected,expected),/supports exactly/);
});
test('missing or unrelated source paths are rejected before reading them',()=>{
 for(const source of [undefined,'','C:/private/unrelated.txt'])assert.throws(()=>assertInstallerResources(config,source,expected),/TAURI_KNOWNEXT_FONT_LICENSE/);
});
