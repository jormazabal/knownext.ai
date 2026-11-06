import {useId} from "react";
import {useAiBudget} from "./useAiBudget";
import type {AiBudgetMode} from "../../types/aiBudget";
export function AiBudgetControls({month,projectId}:{month:string;projectId:string}){
  const budget=useAiBudget(month,projectId),id=useId();
  return <details className="my-2 text-xs leading-5"><summary className="flex min-h-11 cursor-pointer items-center font-medium">Presupuesto de IA · {projectId?"proyecto elegido":"todos los proyectos"}</summary>
    <p className="text-ink-secondary">Límite de {month} (UTC) para este perfil. Se comprueba antes de nuevos envíos. Las operaciones en curso pueden superar el importe; no equivale a un tope de facturación.</p>
    <button type="button" disabled={budget.busy} onClick={()=>void budget.review()} className="min-h-11 rounded px-2 text-brand-dark hover:bg-brand-hover disabled:opacity-50">{budget.observeFirst?"Comprobar estado":"Consultar presupuesto"}</button>
    {budget.status&&<><p>Confirmado: {budget.status.rule?`${budget.status.rule.limitEur.toFixed(2)} EUR · ${budget.status.rule.mode==="notice"?"solo avisar":"detener nuevos envíos"}`:"sin límite propio"}.</p>
      {budget.status.checks.map(check=><p key={check.projectId??"global"} className={check.blocked?"text-red-700":"text-ink-secondary"}>{check.projectId?"Proyecto":"Todos los proyectos"}: {check.recordedEur.toFixed(2)} / {check.limitEur.toFixed(2)} EUR{check.unpricedEntries?` · ${check.unpricedEntries} sin importe EUR`:""}{check.blocked?" · nuevos envíos detenidos":""}.</p>)}
      <div className="mt-2 grid grid-cols-1 gap-2"><label htmlFor={`${id}-amount`}>Importe mensual (EUR)<input id={`${id}-amount`} inputMode="decimal" value={budget.amount} disabled={budget.busy} onChange={event=>budget.setAmount(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"/></label>
        <label htmlFor={`${id}-mode`}>Al llegar al límite<select id={`${id}-mode`} value={budget.mode} disabled={budget.busy} onChange={event=>budget.setMode(event.target.value as AiBudgetMode)} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"><option value="notice">Solo avisar</option><option value="stop-new">Detener nuevos envíos</option></select></label></div>
      <p className="mt-2 text-ink-secondary">El límite general y el del proyecto se aplican juntos. Sin importe EUR conocido, el modo de detener exige revisar el consumo. Grabar y conservar audio local sigue disponible.</p>
      {!budget.status.exchangeRateAvailable&&<><p className="mt-2">No hay cambio EUR vigente. Un límite de detención impedirá nuevos envíos hasta actualizarlo.</p><button type="button" disabled={budget.busy} onClick={()=>void budget.refreshRate()} className="min-h-11 rounded px-2 text-brand-dark hover:bg-brand-hover disabled:opacity-50">Actualizar cambio BCE</button></>}
      <div className="flex flex-wrap gap-1"><button type="button" disabled={budget.busy||budget.observeFirst} onClick={()=>void budget.save()} className="min-h-11 rounded px-2 text-brand-dark hover:bg-brand-hover disabled:opacity-50">Guardar límite</button>{budget.status.rule&&<button type="button" disabled={budget.busy||budget.observeFirst} onClick={()=>void budget.save(true)} className="min-h-11 rounded px-2 hover:bg-panel disabled:opacity-50">Retirar límite</button>}</div></>}
    {budget.busy&&<p role="status">Comprobando el presupuesto…</p>}{budget.message&&<p role="status">{budget.message}</p>}{budget.error&&<p role="alert" className="text-red-700">{budget.error}</p>}
  </details>;
}
