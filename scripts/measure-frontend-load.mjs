import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const dist=path.join(root,'apps/desktop/dist');
const label=process.argv[2]??'current';
if(!/^[a-z][a-z0-9-]{0,50}$/.test(label))throw Error('Usa una etiqueta breve con letras, números y guiones');
const manifestBytes=await readFile(path.join(dist,'.vite/manifest.json'));
const manifest=JSON.parse(manifestBytes.toString('utf8'));
const visited=new Set();
function visit(key){
  if(visited.has(key))return;
  if(!manifest[key])throw Error(`Import ausente del manifiesto: ${key}`);
  visited.add(key);for(const dependency of manifest[key].imports??[])visit(dependency);
}
for(const[key,entry]of Object.entries(manifest))if(entry.isEntry)visit(key);
if(!visited.size)throw Error('Compila la aplicación antes de medir su grafo inicial');
const files=[];
for(const key of visited){
  const entry=manifest[key];const file=path.resolve(dist,entry.file);
  if(!file.startsWith(dist+path.sep)||!entry.file.endsWith('.js'))throw Error('El manifiesto no describe un recurso JavaScript del build');
  const bytes=await readFile(file);
  files.push({key,file:entry.file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const result={variant:label,measuredAt:new Date().toISOString(),buildManifestSha256:createHash('sha256').update(manifestBytes).digest('hex'),initialScriptFiles:files.length,deferredEntries:Object.values(manifest).filter(entry=>entry.isDynamicEntry).length,scope:'production static import graph; not native startup latency or memory',initialJavascriptBytes:files.reduce((sum,file)=>sum+file.bytes,0),files};
await mkdir(path.join(root,'output'),{recursive:true});
const output=path.join(root,`output/frontend-load-${label}.json`);
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({variant:label,initialJavascriptBytes:result.initialJavascriptBytes,output}));
