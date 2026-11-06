import {requestJson} from "./client";
import {invokeManagedNative as invoke} from "./nativeClient";
import {isTauriRuntime} from "../runtime/platform";
import type {AiBudgetMode,AiBudgetStatus} from "../../types/aiBudget";
export const AI_BUDGET_NOTICE_EVENT="knownext:ai-budget-notice";
export async function refreshAiExchangeRate():Promise<void>{
  if(!isTauriRuntime())throw Error("La consulta del cambio requiere la aplicación nativa.");
  await invoke("refresh_ai_exchange_rate");
}
export function getAiBudget(month:string,projectId:string):Promise<AiBudgetStatus>{
  if(!isTauriRuntime())return Promise.reject(Error("Los presupuestos requieren la aplicación nativa; no se simula un límite."));
  return requestJson(`/api/ai/usage/budget?${new URLSearchParams({month,...(projectId?{projectId}:{})})}`);
}
export function setAiBudget(month:string,projectId:string,revision:string,rule:{limitEur:number;mode:AiBudgetMode}|null):Promise<AiBudgetStatus>{
  if(!isTauriRuntime())return Promise.reject(Error("Los presupuestos requieren la aplicación nativa."));
  return requestJson("/api/ai/usage/budget",{method:"POST",body:JSON.stringify({revision,month,projectId:projectId||null,limitEur:rule?.limitEur??null,mode:rule?.mode??null})});
}
export function budgetNotice(status:AiBudgetStatus):string{
  const active=status.checks.filter(check=>check.state!=="ok");
  if(!active.length)return "";
  return active.map(check=>`${check.projectId?"Proyecto":"Todos los proyectos"}: ${check.recordedEur.toFixed(2)} / ${check.limitEur.toFixed(2)} EUR${check.unpricedEntries?` · ${check.unpricedEntries} registros sin importe EUR`:""}. ${check.blocked?"Se detienen nuevos envíos.":"Aviso; el envío puede continuar."}`).join(" ");
}
/** Presentation check; the native service independently enforces a fresh check. */
export async function checkAiBudgetBeforeSend(projectId=""):Promise<void>{
  if(!isTauriRuntime())return;
  const status=await getAiBudget(new Date().toISOString().slice(0,7),projectId);
  if(status.schemaVersion!==1||status.basis!=="local-recorded-estimates"||!Array.isArray(status.checks))throw Error("No se pudo confirmar el presupuesto; no se inicia otro envío.");
  const message=budgetNotice(status);
  if(message)window.dispatchEvent(new CustomEvent(AI_BUDGET_NOTICE_EVENT,{detail:message}));
  if(status.checks.some(check=>check.blocked))throw Error(message);
  if(status.checks.some(check=>check.mode==="stop-new")&&!status.exchangeRateAvailable)throw Error("El presupuesto necesita una referencia EUR vigente. Actualiza el cambio en Consumo de IA; el audio local se conserva.");
}
