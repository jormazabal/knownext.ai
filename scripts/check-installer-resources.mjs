import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertProtonWindowsResources,protonWindowsResources,protonComponentGuid} from './check-proton-windows.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const fontLicenseResource='crates/knownext-docs/assets/fonts/OFL.txt';
export const installerResources=[fontLicenseResource,...protonWindowsResources.map(name=>`resources/proton/windows/${name}`)];
export function assertInstallerResources(config,source,expected=path.join(root,'apps/desktop/src-tauri',fontLicenseResource)){
  const resources=config?.bundle?.resources;
  if(!Array.isArray(resources)||resources.length!==installerResources.length||installerResources.some((value,index)=>resources[index]!==value))throw Error('The per-user MSI template supports exactly the reviewed Noto license and Proton DLL/notices resources. Review its components and removal rules before changing bundle.resources.');
  if(typeof source!=='string'||!source.trim()||path.resolve(source).toLowerCase()!==path.resolve(expected).toLowerCase())throw Error('TAURI_KNOWNEXT_FONT_LICENSE must identify the repository OFL license. Use the tauri:build script or configure the documented CI input.');
}
function merge(base,patch){for(const [key,value] of Object.entries(patch)){if(value&&typeof value==='object'&&!Array.isArray(value))base[key]=merge(base[key]&&typeof base[key]==='object'?base[key]:{},value);else base[key]=value;}return base;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.env.TAURI_ENV_PLATFORM&&process.env.TAURI_ENV_PLATFORM!=='windows'){console.log('Windows installer resource guard: not applicable to this target.');}
  else{
    const config=JSON.parse(fs.readFileSync(path.join(root,'apps/desktop/src-tauri/tauri.conf.json'),'utf8'));
    const platform=path.join(root,'apps/desktop/src-tauri/tauri.windows.conf.json');if(fs.existsSync(platform))merge(config,JSON.parse(fs.readFileSync(platform,'utf8')));
    if(process.env.TAURI_CONFIG)merge(config,JSON.parse(process.env.TAURI_CONFIG));
    assertInstallerResources(config,process.env.TAURI_KNOWNEXT_FONT_LICENSE);
    fs.accessSync(path.join(root,'apps/desktop/src-tauri',fontLicenseResource),fs.constants.R_OK);
    const expected=path.join(root,'apps/desktop/src-tauri/resources/proton/windows');
    if(!process.env.TAURI_KNOWNEXT_PROTON_RESOURCES||path.resolve(process.env.TAURI_KNOWNEXT_PROTON_RESOURCES).toLowerCase()!==path.resolve(expected).toLowerCase())throw Error('Prepare the pinned Windows Proton resources before bundling');
    if(process.env.TAURI_KNOWNEXT_PROTON_COMPONENT_GUID!==protonComponentGuid(config.bundle.windows.wix.upgradeCode))throw Error('Missing or mismatched per-family Proton installer component GUID');
    assertProtonWindowsResources(expected);
    console.log('Windows per-user installer resources verified: OFL, Proton ABI/provenance/notices, HKCU key paths and uninstall directories.');
  }
}
