import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
export async function deliverMixedBackup(mode:"export"|"verify",projectId:string,planId:string,revision:string):Promise<unknown>{if(!isTauriRuntime())throw Error("El respaldo y su comprobación requieren la aplicación nativa.");return invoke(mode==="export"?"export_mixed_backup":"verify_mixed_backup",{projectId,planId,revision});}
