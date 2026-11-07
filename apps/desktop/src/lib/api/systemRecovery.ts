import {invokeManagedNative as invoke} from "./nativeClient";
import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import type {SystemRecoveryInventory,SystemRecoveryReview,SystemRecoveryDelivery} from "../../types/systemRecovery";
function native(){if(!isTauriRuntime())throw Error("Las copias de sistema requieren la aplicación nativa. No se simula un inventario vacío.");}
export async function getSystemRecovery():Promise<SystemRecoveryInventory>{native();return requestJson("/api/recovery/system");}
export async function reviewSystemRecovery(id:string):Promise<SystemRecoveryReview>{native();return requestJson(`/api/recovery/system/${encodeURIComponent(id)}`);}
export async function exportSystemRecovery(id:string,fingerprint:string):Promise<SystemRecoveryDelivery>{native();return invoke("export_system_recovery",{id,fingerprint});}
