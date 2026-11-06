import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
export async function deliverMixedRetirement(projectId: string, planId: string, revision: string): Promise<unknown> {
  if (!isTauriRuntime()) throw Error("La retirada de copias requiere la aplicación nativa.");
  return invoke("retire_mixed_payloads", {projectId, planId, revision, acknowledge: true});
}
