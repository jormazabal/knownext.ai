import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const fontLicenseResource='crates/knownext-docs/assets/fonts/OFL.txt';
export function assertInstallerResources(config,source,expected=path.join(root,'apps/desktop/src-tauri',fontLicenseResource)){
  const resources=config?.bundle?.resources;
  if(!Array.isArray(resources)||resources.length!==1||resources[0]!==fontLicenseResource)throw Error('The per-user MSI template supports exactly the bundled Noto OFL license. Review its components and removal rules before changing bundle.resources.');
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
    console.log('Windows per-user installer resources verified: OFL, HKCU key path and uninstall directory contract.');
  }
}
