import {invoke} from "@tauri-apps/api/core";
export const queryRuntimeOperations=()=>invoke<unknown>("local_operation_status");
export const cancelRuntimeOperation=(id:string)=>invoke<unknown>("cancel_local_operation",{operationId:id});

export type RuntimeContinuity={schemaVersion:1;persistenceAvailable:boolean;previousSessionCount:number;checkedAt:string;maximumEntries:number;includesPrivateContent:false};
export async function queryRuntimeContinuity(){const value=await invoke<RuntimeContinuity>("local_operation_continuity");if(!value||value.schemaVersion!==1||typeof value.persistenceAvailable!=="boolean"||!Number.isSafeInteger(value.previousSessionCount)||value.previousSessionCount<0||value.previousSessionCount>384||value.includesPrivateContent!==false||!Number.isFinite(Date.parse(value.checkedAt)))throw Error("No se pudo comprobar el registro de tareas");return value;}
