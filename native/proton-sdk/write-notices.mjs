import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chooseLicense,chooseFileLicense,nugetAssetUsage} from './license-policy.mjs';
const [receiptFile,dotnetRoot,output]=process.argv.slice(2);
if(!receiptFile||!output)throw Error('sources.json, .NET root and output are required');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const source=read(receiptFile),sections=[],seen=new Set(),inventory={schemaVersion:1,rust:[],nuget:[],requiresReview:[]},packageIds=new Set();
function restoreGraphs(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['.git','bin','node_modules','target'].includes(e.name)?[]:restoreGraphs(path.join(dir,e.name))):(e.name==='project.assets.json'?[read(path.join(dir,e.name))]:[]));}
const allRestoreGraphs=[...restoreGraphs(source.sdkRoot),...restoreGraphs(source.cryptoRoot),...restoreGraphs(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'obj'))];
function add(label,file){if(!fs.existsSync(file)||!fs.statSync(file).isFile())return 0;const text=fs.readFileSync(file,'utf8');const key=label+'\n'+text;if(!seen.has(key)){seen.add(key);sections.push(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}\n${text}\n`);}return 1;}
function legal(label,dir){let count=0;if(!fs.existsSync(dir))return count;for(const entry of fs.readdirSync(dir,{withFileTypes:true}))if(entry.isFile()&&(/^(?:licen[cs]e|copying|copyright|notice|thirdparty)/i.test(entry.name)||entry.name==='AUTHORS'))count+=add(label+' / '+entry.name,path.join(dir,entry.name));return count;}
function review(kind,id,license,fileText,usage){
  // A declared file license is retained verbatim, not fabricated as an SPDX
  // expression. Selection applies to declared expressions, including dual ORs.
  const decision=license?chooseLicense(license):chooseFileLicense(id,fileText,usage);
  if(decision.reviewRequired)inventory.requiresReview.push({kind,id,license,reason:decision.reason});
  if(license)sections.push(`\nLicense selection for ${id}: ${decision.selected??'REQUIRES REVIEW'}. Original declaration: ${license}. Other upstream license alternatives and notices are retained for completeness.\n`);
  return {selectedLicense:decision.selected,licenseSelectionReason:decision.reason};
}
sections.push(`KnowNext.ai — Proton native SDK third-party notices\nSDK source: https://github.com/ProtonDriveApps/sdk/tree/${source.sdkRevision}\nCrypto source: https://github.com/ProtonDriveApps/dotnet-crypto/tree/${source.cryptoRevision}\nLocal source package: Proton.Cryptography ${source.cryptoPackageVersion}; not represented as an official Proton binary release.\n`);
legal('Proton Drive SDK',source.sdkRoot);legal('Proton Cryptography',source.cryptoRoot);legal('Microsoft .NET SDK/runtime',dotnetRoot);
const metadata=path.join(path.dirname(receiptFile),'crypto-metadata.json');
if(fs.existsSync(metadata))for(const pkg of read(metadata).packages){if(pkg.source) {const id=`${pkg.name} ${pkg.version}`;sections.push(`\nRust dependency: ${id}; license: ${pkg.license??'see included license'}; source: ${pkg.source}\n`);let notices=legal(id,path.dirname(pkg.manifest_path));if(pkg.license_file)notices+=add(id+' license',path.resolve(path.dirname(pkg.manifest_path),pkg.license_file));inventory.rust.push({name:pkg.name,version:pkg.version,license:pkg.license,source:pkg.source,notices,...review('rust',id,pkg.license)});}}
// Include package notices from the exact .NET restore graphs, including runtime
// packs used by NativeAOT. No credentials or NuGet configuration are copied.
function assets(dir){
 if(!fs.existsSync(dir))return;
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const f=path.join(dir,e.name);
  if(e.isDirectory()){if(!['.git','bin','node_modules','target'].includes(e.name))assets(f);continue;}
  if(e.name!=='project.assets.json')continue;
  const a=read(f);
  for(const [id,lib] of Object.entries(a.libraries??{})){
   if(lib.type!=='package'||packageIds.has(id))continue;
   for(const home of Object.keys(a.packageFolders??{})){
    const pkg=path.join(home,lib.path??id.toLowerCase());if(!fs.existsSync(pkg))continue;
    packageIds.add(id);let license=null,fileText=null,declaredNotices=0;
    const usage=nugetAssetUsage(allRestoreGraphs,id),nuspec=fs.readdirSync(pkg).find(n=>n.endsWith('.nuspec'));
    if(nuspec){
     const xml=fs.readFileSync(path.join(pkg,nuspec),'utf8');
     const expression=/<license\s+type="expression"[^>]*>([^<]+)<\/license>/.exec(xml);
     license=expression?.[1]?.replaceAll('&amp;','&')??null;
     const file=/<license\s+type="file"[^>]*>([^<]+)<\/license>/.exec(xml);
     if(file){const target=path.resolve(pkg,file[1].replaceAll('\\',path.sep));if(target.startsWith(path.resolve(pkg)+path.sep)){declaredNotices+=add(id+' declared license',target);fileText=fs.readFileSync(target,'utf8');}}
    }
    if(id.startsWith('Proton.Cryptography/'))license='MIT';
    sections.push(`\nNuGet dependency: ${id}; license: ${license??'see included package notices'}; https://www.nuget.org/packages/${id}\n`);
    const notices=legal(id,pkg)+declaredNotices;
    inventory.nuget.push({id,license,notices,assetUsage:usage,...review('nuget',id,license,fileText,usage)});
    break;
   }
  }
 }
}
assets(source.sdkRoot);assets(source.cryptoRoot);assets(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'obj'));
fs.writeFileSync(output,sections.join('\n'),'utf8');
fs.mkdirSync(source.noticesDirectory,{recursive:true});
const canonicalNotices=path.join(source.noticesDirectory,'THIRD-PARTY-NOTICES.txt');
if(path.resolve(canonicalNotices)!==path.resolve(output))fs.copyFileSync(output,canonicalNotices);
fs.writeFileSync(path.join(path.dirname(receiptFile),'license-inventory.json'),JSON.stringify(inventory,null,2)+'\n','utf8');
if(inventory.requiresReview.length)throw Error(`Dependency license terms require explicit review before distribution: ${inventory.requiresReview.map(p=>`${p.id}: ${p.license??'file license'}`).join('; ')}; see license-inventory.json`);
