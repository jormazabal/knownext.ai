import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
export async function deliverConflictPayloads(kind:"backup"|"retire",id:string,revision:string){
 if(!isTauriRuntime())throw Error("El respaldo y la retirada requieren la aplicación nativa de Windows o Android.");
 return invoke(kind==="backup"?"export_conflict_payload_backup":"retire_conflict_payloads",kind==="backup"?{id,revision}:{id,revision,acknowledge:true});
}
