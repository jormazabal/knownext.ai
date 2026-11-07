import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
export async function deliverIncompleteMixed(projectId: string, planId: string, revision: string, key: string): Promise<unknown> {
  if (!isTauriRuntime()) throw Error("La extracción de copias requiere la aplicación nativa.");
  return invoke("export_incomplete_mixed", {projectId, planId, revision, key, acknowledgeUnverified: true});
}
