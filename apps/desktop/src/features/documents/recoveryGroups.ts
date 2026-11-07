import type {RecoveryCopy} from "../../types/recovery";
type Group={key:string;name:string;operationId?:string;documentId?:string;updatedAt:string|null;items:RecoveryCopy[]};
const order={local:0,disk:1,proposal:2,remote:3};
export function recoveryRoleLabel(role:RecoveryCopy['variantRole']){
  return role?({local:"Mi edición",disk:"En disco",proposal:"Propuesta combinada",remote:"Remoto conocido"} as const)[role]:undefined;
}
/** Presentation only: grouping never grants copy/restore authority. */
export function groupRecoveryCopies(copies:RecoveryCopy[]):Group[]{
 const groups=new Map<string,Group>();
 for(const copy of copies){
  const grouped=copy.source==='archive'&&copy.state==='archived'&&copy.canCopy&&copy.fingerprint&&copy.operationId&&copy.documentId&&copy.variantRole&&copy.variantRole in order;
  const key=grouped?JSON.stringify([copy.documentId,copy.operationId]):JSON.stringify([copy.source??'active',copy.key]);
  const existing=groups.get(key);
  if(existing){existing.items.push(copy);if(copy.updatedAt&&(!existing.updatedAt||copy.updatedAt>existing.updatedAt))existing.updatedAt=copy.updatedAt;}
  else groups.set(key,{key,name:copy.name,operationId:grouped?copy.operationId!:undefined,documentId:copy.documentId??undefined,updatedAt:copy.updatedAt,items:[copy]});
 }
 return [...groups.values()].map(group=>({...group,items:group.operationId?[...group.items].sort((a,b)=>order[a.variantRole!]-order[b.variantRole!]):group.items}));
}
