import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import type {CompatibilityInventory,ProjectProtection} from "../../types/compatibilityInventory";
function native(){if(!isTauriRuntime())throw Error("Esta revisión requiere el estado de la aplicación nativa.");}
export function getCompatibilityInventory():Promise<CompatibilityInventory>{native();return requestJson("/api/recovery/formats");}
export function getProjectProtection(project:string):Promise<ProjectProtection>{native();return requestJson(`/api/projects/${encodeURIComponent(project)}/protection`);}
