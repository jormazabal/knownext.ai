import {requestJson} from "./client";
import {isTauriRuntime} from "../runtime/platform";
import type {AiUsageLedgerInfo} from "../../types/aiUsage";
export function getAiUsageLedger():Promise<AiUsageLedgerInfo>{
  if(!isTauriRuntime())return Promise.reject(new Error("La conservación del consumo requiere la aplicación nativa. No se modifica el registro."));
  return requestJson("/api/ai/usage/ledger");
}
export function upgradeAiUsageLedger(revision:string):Promise<AiUsageLedgerInfo>{
  if(!isTauriRuntime())return Promise.reject(new Error("La conservación del consumo requiere la aplicación nativa."));
  return requestJson("/api/ai/usage/ledger/upgrade",{method:"POST",body:JSON.stringify({revision})});
}
