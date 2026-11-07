import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
export async function importRecording(projectId:string,entryId:string,revision:string):Promise<unknown>{
  if(!isTauriRuntime())throw Error("Traer el audio requiere la aplicación nativa.");
  return invoke("import_portable_recording",{projectId,entryId,revision,acknowledge:true});
}
