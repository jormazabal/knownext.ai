import {queryRuntimeOperations,cancelRuntimeOperation,queryRuntimeContinuity} from "../api/operationRuntime";
import {ApiError} from "../api/errors";
import type {LocalOperation, RuntimeOperation} from "../../types/operations";

const listeners=new Set<()=>void>();
let operations:LocalOperation[]=[];
let continuityAvailable:boolean|null=null;
export const getRuntimeContinuity=()=>continuityAvailable;
export const getLocalOperations=()=>operations;
export const subscribeLocalOperations=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
function update(id:string,patch:Partial<LocalOperation>){operations=operations.map(entry=>entry.id===id?{...entry,...patch}:entry);listeners.forEach(listener=>listener());}
const terminal=(phase:string)=>!["queued","running"].includes(phase);
function register(entry:LocalOperation){
  // Never evict active or uncertain work to make room for cosmetic history.
  operations=[...operations.filter(operation=>!terminal(operation.phase)||operation.unconfirmed),...operations.filter(operation=>terminal(operation.phase)&&!operation.unconfirmed).slice(-19),entry];
  listeners.forEach(listener=>listener());
}
function valid(value:unknown):value is RuntimeOperation{
  if(!value||typeof value!=="object")return false;
  const entry=value as RuntimeOperation;
  return typeof entry.id==="string"&&/^operation-[a-zA-Z0-9-]{10,70}$/.test(entry.id)&&["queued","running","succeeded","failed","cancelled","expired","unknown"].includes(entry.phase)&&["mutation","query","ai","transfer","index","control","background"].includes(entry.lane)&&typeof entry.cancellable==="boolean"&&Number.isFinite(Date.parse(entry.queuedAt))&&(entry.startedAt===null||Number.isFinite(Date.parse(entry.startedAt)))&&(entry.finishedAt===null||Number.isFinite(Date.parse(entry.finishedAt)))&&(entry.cancelRequested===undefined||typeof entry.cancelRequested==="boolean")&&(entry.recovered===undefined||typeof entry.recovered==="boolean")&&(entry.stage===undefined||entry.stage===null||["preparing","waiting-remote","validating","publishing","observing"].includes(entry.stage));
}
export async function refreshLocalOperations(includePrevious=false){
  if(!includePrevious&&!operations.some(entry=>entry.native&&(!terminal(entry.phase)||entry.unconfirmed)))return;
  const response=await queryRuntimeOperations();
  if(!Array.isArray(response)||response.length>384||!response.every(valid))throw new Error("No se pudo comprobar el estado de las operaciones.");
  if(includePrevious){try{const continuity=await queryRuntimeContinuity();continuityAvailable=continuity.persistenceAvailable;}catch{continuityAvailable=false;}operations=[...operations];listeners.forEach(listener=>listener());}
  const historical=response.filter(entry=>entry.recovered).slice(-50);
  for(const entry of response){
    const current=operations.find(operation=>operation.id===entry.id);
    if(current){
      if(terminal(current.phase)&&current.phase!=="unknown"&&!terminal(entry.phase))continue;
      const publishing=current.stage==="publishing"||current.stage==="observing";
      update(entry.id,{phase:entry.phase,cancellable:entry.cancellable&&!entry.cancelRequested&&!publishing,cancelRequested:entry.cancelRequested,stage:publishing?current.stage:entry.stage,stoppedAfterStart:entry.phase==="cancelled"&&entry.startedAt!==null});
    }else if(includePrevious&&historical.includes(entry)){
      register({id:entry.id,label:"Sesión anterior · revisa su resultado",phase:entry.phase,startedAt:Date.parse(entry.startedAt??entry.queuedAt),unconfirmed:entry.phase==="unknown",cancellable:false,native:true,recovered:true,stage:entry.stage});
    }
  }
}
export async function cancelLocalOperation(id:string){
  const current=operations.find(entry=>entry.id===id);
  if(!current?.native)return false;
  const response=await cancelRuntimeOperation(id);
  if(response===null)return false;
  if(!valid(response)||response.id!==id)throw new Error("No se pudo comprobar la cancelación.");
  update(id,{phase:response.phase,cancellable:response.cancellable&&!response.cancelRequested,cancelRequested:response.cancelRequested,stage:response.stage,stoppedAfterStart:response.phase==="cancelled"&&response.startedAt!==null});
  return response.phase==="cancelled";
}
export function dismissLocalOperation(id:string){operations=operations.filter(entry=>entry.id!==id||!terminal(entry.phase));listeners.forEach(listener=>listener());}
export function localOperationDiagnostic(){
  const entries=operations.slice(-50).map(({id,phase,startedAt,unconfirmed,stage,cancelRequested,recovered})=>({id,phase,startedAt:new Date(startedAt).toISOString(),resultNeedsReview:unconfirmed,stage:stage??null,cancelRequested:!!cancelRequested,previousSession:!!recovered}));
  return JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),scope:"runtime-observation",continuityAvailable,maximumEntries:50,omittedEntries:Math.max(0,operations.length-50),includesPrivateContent:false,operations:entries},null,2);
}

/** A timeout ends the UI wait, never the native operation. There is no automatic replay. */
export async function runLocalOperation<T>(execute:(id:string)=>Promise<T>,options:{native:boolean;label:string;timeoutMs?:number;signal?:AbortSignal|null}):Promise<T>{
  const id=`operation-${crypto.randomUUID()}`;
  const stopped=(code:string,message:string)=>new ApiError(409,"Operación no iniciada",message,"not-started",code,id);
  if(options.signal?.aborted)throw stopped("operation-cancelled","La operación se canceló antes de empezar.");
  const timeout=options.timeoutMs??120_000;
  if(!Number.isFinite(timeout)||timeout<=0||timeout>30*60_000)throw stopped("invalid-operation-timeout","El tiempo de espera no es válido.");
  if(operations.filter(entry=>(!terminal(entry.phase)||entry.unconfirmed)&&!entry.recovered).length>=128)throw stopped("operation-queue-full","Hay demasiadas operaciones pendientes. Revisa su estado antes de continuar.");
  register({id,phase:"queued",label:options.label,startedAt:Date.now(),unconfirmed:false,cancellable:false,native:options.native});
  let timer:ReturnType<typeof setTimeout>|undefined;
  let abort:(()=>void)|undefined;
  let timedOut=false;
  try{
    const work=Promise.resolve().then(()=>{
      if(options.signal?.aborted)throw stopped("operation-cancelled","La operación se canceló antes de empezar.");
      return execute(id);
    }).then(value=>{update(id,{phase:"succeeded",cancellable:false});return value;},failure=>{
      const notStarted=["operation-cancelled","operation-expired","operation-queue-full","operation-already-registered","invalid-operation-id","invalid-operation-resource","invalid-runtime-request","runtime-restart-reserved"];
      const error=typeof failure==="string"&&notStarted.includes(failure)
        ?stopped(failure,failure==="operation-cancelled"?"La operación se canceló antes de empezar.":"La operación no llegó a iniciarse. Revisa los trabajos pendientes.")
        :failure==="operation-stopped-before-publication"?new ApiError(409,"Trabajo detenido","Se confirmó la detención en un punto seguro antes de publicar. No se repite la operación.","not-applied",failure,id):failure==="github-session-changed"?new ApiError(409,"Sesión sustituida","La sesión cambió y esta respuesta anterior no se ha publicado.","not-applied",failure,id):failure instanceof ApiError?failure:new ApiError(502,"Resultado sin confirmar",typeof failure==="string"?failure:failure instanceof Error?failure.message:"No se pudo confirmar el resultado de la operación.","unknown","runtime-operation-unconfirmed",id);
      error.operationId??=id;
      const known=error instanceof ApiError&&(error.operationOutcome==="not-started"||error.operationOutcome==="not-applied");
      const cancelled=known&&(error.code==="operation-cancelled"||error.code==="operation-stopped-before-publication");
      update(id,{stoppedAfterStart:error.operationOutcome==="not-applied"&&cancelled,phase:cancelled?"cancelled":error instanceof ApiError&&error.status<500?"failed":"unknown",cancellable:false,unconfirmed:timedOut||!known&&!(error instanceof ApiError&&error.status<500)});
      throw error;
    });
    const interrupted=new Promise<never>((_resolve,reject)=>{
      timer=setTimeout(()=>{timedOut=true;update(id,{unconfirmed:true});reject(new ApiError(504,"Resultado pendiente","Se agotó la espera. La operación puede continuar; comprueba su estado antes de repetirla.","unknown","operation-wait-expired",id));},timeout);
      abort=()=>{if(options.native)void cancelLocalOperation(id).then(cancelled=>{if(cancelled)reject(stopped("operation-cancelled","La operación se canceló antes de empezar."));}).catch(()=>{/* An unconfirmed stop must not be reported as cancellation. */});};
      options.signal?.addEventListener("abort",abort,{once:true});
    });
    return await Promise.race([work,interrupted]);
  }finally{clearTimeout(timer);if(abort)options.signal?.removeEventListener("abort",abort);}
}
