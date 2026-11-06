import type {HandwrittenNoteContent,HandwrittenNotePage} from "../../types/domain";
import {cloneHandwrittenValue} from "./handwrittenModel";
export type PageChoice="local"|"disk"|"both";
export type PageConflict={id:string;local?:HandwrittenNotePage;disk?:HandwrittenNotePage;changed:boolean};
export function reviewPageChoices(local:HandwrittenNoteContent,disk:HandwrittenNoteContent):PageConflict[]{
  if(local.pages.length>1000||disk.pages.length>1000)throw new Error("Esta revisión admite hasta1000páginas por versión. Las notas se conservan.");
  const a=new Map(local.pages.map(page=>[page.id,page])),b=new Map(disk.pages.map(page=>[page.id,page]));
  if(a.size!==local.pages.length||b.size!==disk.pages.length)throw new Error("Hay páginas con identidad duplicada. Se conservan ambas versiones para revisión.");
  return [...new Set([...a.keys(),...b.keys()])].map(id=>({id,local:a.get(id),disk:b.get(id),changed:JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))||local.ocr.textByPage[id]!==disk.ocr.textByPage[id]}));
}
export function composePageChoices(local:HandwrittenNoteContent,disk:HandwrittenNoteContent,choices:Record<string,PageChoice>,general?:"local"|"disk"):HandwrittenNoteContent|null{
  if(!general)return null;const rows=reviewPageChoices(local,disk);if(rows.some(row=>row.changed&&!choices[row.id]))return null;
  const primary=general==="local"?local:disk,secondary=general==="local"?disk:local;
  const ids=[...new Set([...primary.pages,...secondary.pages].map(page=>page.id))];const byId=new Map(rows.map(row=>[row.id,row]));
  const merged=cloneHandwrittenValue(primary);merged.id=local.id;merged.pages=[];for(const id of ids)delete merged.ocr.textByPage[id];const reserved=new Set([...ids,...Object.keys(local.ocr.textByPage),...Object.keys(disk.ocr.textByPage)]);let next=1;
  function append(page:HandwrittenNotePage|undefined,source:HandwrittenNoteContent,copy=false){if(!page)return;const value=cloneHandwrittenValue(page);if(copy){let id;do{id=`merge-page-${next++}`;}while(reserved.has(id));reserved.add(id);value.id=id;}merged.pages.push(value);const text=source.ocr.textByPage[page.id];if(text!==undefined)merged.ocr.textByPage[value.id]=text;}
  for(const id of ids){const row=byId.get(id)!;const choice=row.changed?choices[id]:general;if(choice==="local")append(row.local,local);else if(choice==="disk")append(row.disk,disk);else{append(row.local,local);append(row.disk,disk,!!row.local);}}
  return merged.pages.length&&merged.pages.length<=1000?merged:null;
}
