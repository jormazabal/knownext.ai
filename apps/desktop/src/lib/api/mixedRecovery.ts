import {requestJson} from "./client";
import type {MixedRecoveryCatalog} from "../../types/mixedRecovery";
export type {MixedRecoveryCatalog} from "../../types/mixedRecovery";
export async function getMixedRecoveryCatalog(projectId:string):Promise<MixedRecoveryCatalog>{
 const value=await requestJson<MixedRecoveryCatalog>(`/api/projects/${encodeURIComponent(projectId)}/sync/mixed-selections`);
 if(!value||value.schemaVersion!==1||value.projectId!==projectId||!Number.isFinite(Date.parse(value.checkedAt))||typeof value.limited!=="boolean"||!Array.isArray(value.warnings)||value.warnings.length>10||value.warnings.some(w=>typeof w!=="string")||!Array.isArray(value.items)||value.items.length>64||new Set(value.items.map(i=>i?.id)).size!==value.items.length||value.items.some(i=>!i||!/^mixed-[a-f0-9]{32}$/i.test(i.id)||!Number.isFinite(Date.parse(i.createdAt))||!/^[a-f0-9]{64}$/i.test(i.planRevision)||!Number.isSafeInteger(i.paths)||i.paths<1||i.paths>256))throw Error("El catálogo no identifica las preparaciones de este proyecto. Consulta de nuevo; las copias se conservan.");
 return value;
}
