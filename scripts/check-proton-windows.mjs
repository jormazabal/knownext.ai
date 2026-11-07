import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const protonWindowsResources=['knownext_proton.dll','proton_crypto.dll','THIRD-PARTY-NOTICES.txt','provenance.json'];
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function protonComponentGuid(upgradeCode){
 if(typeof upgradeCode!=='string'||!upgradeCode)throw Error('Windows upgrade family is required');
 const h=crypto.createHash('sha256').update(`${upgradeCode}/knownext-proton-resources/v1`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function inspectWindowsLibrary(file){
  const b=fs.readFileSync(file),pe=b.readUInt32LE(0x3c);
  if(b.toString('ascii',0,2)!=='MZ'||b.toString('ascii',pe,pe+4)!=='PE\0\0'||b.readUInt16LE(pe+4)!==0x8664||!(b.readUInt16LE(pe+22)&0x2000))throw Error('Proton requires an x64 PE DLL');
  const optional=pe+24,sections=optional+b.readUInt16LE(pe+20),count=b.readUInt16LE(pe+6);
  if(b.readUInt16LE(optional)!==0x20b)throw Error('Proton DLL must be PE32+');
  const offset=rva=>{for(let i=0;i<count;i++){const p=sections+i*40,start=b.readUInt32LE(p+12),size=Math.max(b.readUInt32LE(p+8),b.readUInt32LE(p+16));if(rva>=start&&rva<start+size)return b.readUInt32LE(p+20)+rva-start;}throw Error('Invalid PE directory');};
  const string=at=>{const end=b.indexOf(0,at);if(end<at||end-at>4096)throw Error('Invalid PE name');return b.toString('ascii',at,end);};
  const imports=[],exports=[];
  const irva=b.readUInt32LE(optional+120);
  if(irva){let p=offset(irva);for(let i=0;i<512;i++,p+=20){const name=b.readUInt32LE(p+12);if(!name)break;imports.push(string(offset(name)));}}
  const erva=b.readUInt32LE(optional+112);
  if(erva){const p=offset(erva),names=b.readUInt32LE(p+24),table=offset(b.readUInt32LE(p+32));if(names>100000)throw Error('Invalid PE exports');for(let i=0;i<names;i++)exports.push(string(offset(b.readUInt32LE(table+i*4))));}
  return {bytes:b.length,sha256:digest(file),machine:'x86_64',imports,exports};
}
export function assertProtonWindowsResources(directory=path.join(root,'apps/desktop/src-tauri/resources/proton/windows')){
  for(const name of protonWindowsResources)if(!fs.statSync(path.join(directory,name)).isFile())throw Error(`Required Proton resource missing: ${name}`);
  const pins=JSON.parse(fs.readFileSync(path.join(root,'native/proton-sdk/pins.json'),'utf8'));
  const provenance=JSON.parse(fs.readFileSync(path.join(directory,'provenance.json'),'utf8').replace(/^\uFEFF/,''));
  if(provenance.sdkRevision!==pins.sdk.revision||provenance.cryptoRevision!==pins.crypto.revision||provenance.cryptoPackageVersion!==pins.cryptoPackageVersion)throw Error('Proton provenance differs from pinned sources');
  const libraries={};
  for(const name of protonWindowsResources.filter(n=>n.endsWith('.dll'))){
    const info=inspectWindowsLibrary(path.join(directory,name));
    if(provenance.libraries?.[name]?.sha256!==info.sha256)throw Error(`Proton resource hash mismatch: ${name}`);
    const allowed=/^(?:api-ms-win-|ext-ms-win-)|^(?:kernel32|kernelbase|ntdll|advapi32|bcrypt|bcryptprimitives|crypt32|ncrypt|secur32|sspicli|ole32|oleaut32|combase|rpcrt4|shell32|shlwapi|user32|ws2_32|winhttp|normaliz|version|ucrtbase|msvcrt|iphlpapi|dnsapi|wldap32|psapi)\.dll$/i;
    if(info.imports.some(n=>!allowed.test(n)))throw Error(`Proton DLL has a non-system dependency: ${name}`);
    const required=name==='knownext_proton.dll'?['knownext_proton_request','knownext_proton_response_length','knownext_proton_free']:['srp_get_modulus_verification_key','interop_memory_free'];
    if(required.some(n=>!info.exports.includes(n)))throw Error(`Proton ABI incomplete: ${name}`);
    libraries[name]={bytes:info.bytes,sha256:info.sha256,imports:info.imports};
  }
  const notice=fs.readFileSync(path.join(directory,'THIRD-PARTY-NOTICES.txt'),'utf8');
  if(!notice.includes(pins.sdk.revision)||!notice.includes(pins.crypto.revision)||!notice.includes('Permission is hereby granted'))throw Error('Proton third-party notices incomplete');
  if(provenance.noticesSha256!==digest(path.join(directory,'THIRD-PARTY-NOTICES.txt')))throw Error('Proton notice hash mismatch');
  return {ok:true,sdkRevision:provenance.sdkRevision,cryptoRevision:provenance.cryptoRevision,libraries};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(assertProtonWindowsResources(process.argv[2]),null,2));
