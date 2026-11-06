import {compareHistory} from "../versions/historyDiff";
export type MergeChoice="local"|"disk"|"both";
export type MergeSegment={type:"same";text:string}|{type:"change";id:string;local:string;disk:string};
export type ConflictMergeModel={status:"ready";local:string;disk:string;segments:MergeSegment[];changes:number}|{status:"limited";local:string;disk:string;reason:string};
function tokens(text:string){const lines=text.split("\n");return lines.map((line,index)=>line+(index<lines.length-1?"\n":""));}
export function buildConflictMerge(local:string,disk:string):ConflictMergeModel{
  if(local===disk)return {status:"ready",local,disk,segments:[{type:"same",text:local}],changes:0};
  const compared=compareHistory(local,disk,{fullContext:true});if(compared.status==="limited")return {status:"limited",local,disk,reason:compared.reason};
  const left=tokens(local),right=tokens(disk),segments:MergeSegment[]=[];let change:{type:"change";id:string;local:string;disk:string}|null=null;let changes=0;
  for(const operation of compared.unified){
    if(operation.type==="skip")throw new Error("La comparación completa no puede omitir contenido");
    if(operation.type==="same"){
      change=null;const text=left[(operation.leftNumber??1)-1];const prior=segments[segments.length-1];if(prior?.type==="same")prior.text+=text;else segments.push({type:"same",text});
    }else{
      if(!change){change={type:"change",id:`change-${++changes}`,local:"",disk:""};segments.push(change);}
      if(operation.type==="removed")change.local+=left[(operation.leftNumber??1)-1];else change.disk+=right[(operation.rightNumber??1)-1];
    }
  }
  return {status:"ready",local,disk,segments,changes};
}
export function composeConflictMerge(model:ConflictMergeModel,choices:Record<string,MergeChoice>,whole?:"local"|"disk"):string|null{
  if(whole)return model[whole];if(model.status!=="ready")return null;
  const changes=model.segments.filter((s):s is Extract<MergeSegment,{type:"change"}>=>s.type==="change");
  if(changes.some(segment=>!choices[segment.id]))return null;
  if(changes.length&&changes.every(segment=>choices[segment.id]==="local"))return model.local;
  if(changes.length&&changes.every(segment=>choices[segment.id]==="disk"))return model.disk;
  return model.segments.map(segment=>{
    if(segment.type==="same")return segment.text;
    const choice=choices[segment.id];if(choice==="local")return segment.local;if(choice==="disk")return segment.disk;
    const separator=segment.local&&!segment.local.endsWith("\n")&&segment.disk?(model.local.includes("\r\n")?"\r\n":"\n"):"";
    return segment.local+separator+segment.disk;
  }).join("");
}
