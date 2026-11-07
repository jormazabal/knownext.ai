// Select a reviewed permissive SPDX alternative. This is deliberately not a
// blanket approval of a package or a substitute for its retained license text.
const permissive=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','Zlib','0BSD','CC0-1.0','Unlicense','BSL-1.0','Unicode-3.0','Unicode-DFS-2016','bzip2-1.0.6']);
const exceptions=new Set(['Apache-2.0 WITH LLVM-exception']);

function parse(expression){
  // Cargo historically used `/` for alternative licenses. Preserve that
  // explicitly documented OR meaning; never treat AND as an alternative.
  const normalized=expression.replace(/\s*\/\s*/g,' OR ');
  const tokens=normalized.match(/\(|\)|[A-Za-z0-9][A-Za-z0-9.+:-]*/g)??[];
  if(tokens.join('')!==normalized.replace(/\s/g,''))throw Error('Invalid SPDX token');
  let index=0;
  const take=()=>tokens[index++];
  function atom(){
    if(tokens[index]==='('){take();const node=or();if(take()!==')')throw Error('Unclosed SPDX group');return node;}
    const id=take();
    if(!id||['AND','OR','WITH',')'].includes(id))throw Error('Missing SPDX license');
    if(tokens[index]==='WITH'){
      take();const exception=take();
      if(!exception||['AND','OR','WITH','(',')'].includes(exception))throw Error('Missing SPDX exception');
      return {type:'license',id:`${id} WITH ${exception}`};
    }
    return {type:'license',id};
  }
  function and(){let node=atom();while(tokens[index]==='AND'){take();node={type:'and',left:node,right:atom()};}return node;}
  function or(){let node=and();while(tokens[index]==='OR'){take();node={type:'or',left:node,right:and()};}return node;}
  const tree=or();if(index!==tokens.length)throw Error('Unexpected SPDX token');
  return {tree,normalized};
}
function select(node){
  if(node.type==='license')return permissive.has(node.id)||exceptions.has(node.id)?node.id:null;
  const left=select(node.left),right=select(node.right);
  if(node.type==='or')return left??right;
  return left&&right?`${left} AND ${right}`:null;
}
export function chooseLicense(expression){
  if(typeof expression!=='string'||!expression.trim())return {declared:expression??null,selected:null,reviewRequired:true,reason:'No SPDX expression; inspect original package license notice'};
  try{
    const {tree,normalized}=parse(expression),selected=select(tree);
    return {declared:expression,normalized,selected,reviewRequired:!selected,reason:selected?'Selected reviewed permissive alternative; preserve its notices':'No fully reviewed permissive alternative; explicit distribution review required'};
  }catch{return {declared:expression,selected:null,reviewRequired:true,reason:'Unknown or malformed license expression; explicit review required'};}
}

export function nugetAssetUsage(assets,id){
 const evidence=[];
 for(const graph of Array.isArray(assets)?assets:[assets])for(const [framework,target] of Object.entries(graph.targets??{})){
  const item=target[id];if(!item)continue;
  const runtimeAssets=['compile','runtime','native','runtimeTargets'].flatMap(role=>Object.keys(item[role]??{}).filter(file=>file.replaceAll('\\','/').split('/').at(-1)!=='_._').map(file=>({role,file})));
  evidence.push({framework,roles:Object.keys(item).filter(k=>!['type','dependencies'].includes(k)),runtimeAssets});
 }
 return {buildOnly:evidence.length>0&&evidence.every(item=>item.runtimeAssets.length===0),evidence};
}

export function chooseFileLicense(id,text,usage){
 if(id==='SQLite/3.54.0'&&text?.replaceAll('\r\n','\n').trim()==='SQLite is Public Domain\n\nhttps://sqlite.org/copyright.html')return {selected:'SQLite public-domain dedication',reviewRequired:false,reason:'Exact public-domain notice from the pinned SQLite package retained'};
 if(usage?.buildOnly&&text?.trim())return {selected:null,reviewRequired:false,reason:'Build-tool-only package: restored targets contain no compile/runtime/native assets; original license retained'};
 return {selected:null,reviewRequired:true,reason:'File-only or unknown license requires explicit distribution review'};
}
