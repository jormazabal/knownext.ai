import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
export async function deliverConflictPackage(id:string,revision:string):Promise<unknown>{
 if(!isTauriRuntime())throw Error("Compartir variantes requiere la aplicación nativa. No se simula la entrega.");
 return invoke("export_conflict_package",{id,revision});
}
