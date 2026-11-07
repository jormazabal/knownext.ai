import {useEffect,useRef,useState} from "react";
import {getRecoveryQuotas} from "../../lib/api/recoveryQuotas";
import {getApiErrorMessage} from "../../lib/api/client";
import type {RecoveryQuotaInventory} from "../../types/recoveryQuotas";
const labels = {"conflict-attempts":"Recibos de combinación","mixed-reviews":"Selecciones por archivo","mixed-applications":"Preparaciones de archivos","graph-joins":"Reuniones de historial","project-templates":"Plantillas de proyecto","project-transfers":"Traslados pendientes","export-batches":"Exportaciones preparadas","history-restores":"Restauraciones históricas","ai-changes":"Cambios IA y reversión","document-replacements":"Reemplazos de documentos","scheduled-backups":"Copias programadas","project-template-catalogues":"Incorporaciones de plantillas","meeting-minutes":"Actas revisadas","handwritten-ocr":"Reconocimiento manuscrito"};
const size = (n:number) => n < 1024 ? `${n} B` : n < 1024**2 ? `${(n/1024).toFixed(1)} KiB` : `${(n/1024**2).toFixed(1)} MiB`;
const button = "min-h-11 max-w-full rounded px-3 text-xs font-medium hover:bg-brand-hover disabled:opacity-50";
export function RecoveryQuotaPanel() {
  const [data,setData] = useState<RecoveryQuotaInventory|null>(null), [busy,setBusy] = useState(false), [error,setError] = useState(""), [limit,setLimit] = useState(20);
  const alive = useRef(false), flight = useRef(false);
  useEffect(() => {alive.current=true;return () => {alive.current=false;};},[]);
  async function refresh() {
    if (flight.current) return;
    flight.current=true;setBusy(true);setError("");
    try {const value=await getRecoveryQuotas();if(alive.current){setData(value);setLimit(20);}}
    catch(cause){if(alive.current){setData(null);setError(getApiErrorMessage(cause,"No se pudieron consultar los cupos."));}}
    finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  const rows=data?.items.slice().sort((a,b) => Number(b.status==="full")-Number(a.status==="full") || Number(!b.complete)-Number(!a.complete) || a.family.localeCompare(b.family)) ?? [];
  return <details className="mt-3 rounded-lg bg-panel p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Cupos de registros</summary><section aria-label="Ocupación de cupos de recuperación" className="text-xs leading-5 [overflow-wrap:anywhere]">
    <p>El espacio y el número de registros tienen límites distintos. Retirar los archivos de una combinación conserva su identificador para impedir repeticiones; no libera ese cupo.</p>
    <p className="mt-2 text-ink-secondary">Consulta los almacenes con cupo conocido. Se cuentan metadatos, incluidos registros desconocidos o incompletos, sin abrir su contenido. Los ámbitos por proyecto muestran solo almacenes existentes. La medición no confirma que una nueva operación pueda iniciarse.</p>
    <button disabled={busy} className={`${button} mt-2 bg-white`} onClick={()=>void refresh()}>{busy?"Consultando cupos…":data?"Actualizar cupos":"Revisar cupos"}</button>
    {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
    {data&&<><p className="mt-2 font-medium">{data.complete?"Metadatos medidos":"Medición parcial · los recuentos son mínimos"}</p>{!data.projectMappingComplete&&<p className="mt-2 text-brand-dark">No se pudo comprobar el catálogo de proyectos. Los almacenes permanecen sin atribuir.</p>}
      <ul className="mt-2 space-y-2">{rows.slice(0,limit).map(row=><li key={row.id} className="rounded bg-white p-3"><h4 className="font-medium">{labels[row.family]}</h4><p className="text-ink-secondary">{row.scope==="profile"?"Este perfil":row.projectName??"Proyecto sin asociación comprobada"}</p><p className="mt-1 font-medium">{!row.complete&&"≥ "}{row.entries} de {row.maxEntries} registros</p><p className="text-ink-secondary">{!row.complete&&"≥ "}{size(row.bytes)} de {size(row.maxBytes)}</p>{row.status==="full"&&<p className="mt-2 font-medium text-brand-dark">Límite alcanzado en los metadatos observados</p>}{!row.complete&&<p className="mt-2 text-brand-dark">Consulta incompleta; no se deduce espacio disponible.</p>}{row.idsRetainedOnPayloadRetirement?<p className="mt-2 text-ink-secondary">Conservar identidades evita repetir una operación. Reducir sus archivos conserva los registros.</p>:<p className="mt-2 text-ink-secondary">Gestiona este contenido desde su flujo de plantillas o traslados, con su revisión propia.</p>}</li>)}</ul>
      {rows.length>limit&&<button className={`${button} mt-2 bg-white`} onClick={()=>setLimit(v=>v+20)}>Mostrar 20 más · {rows.length-limit} restantes</button>}
      <p className="mt-2 text-[11px] text-ink-secondary">Consulta de {new Intl.DateTimeFormat("es-ES",{dateStyle:"short",timeStyle:"short"}).format(new Date(data.checkedAt))}. Cambiar el presupuesto global no cambia estos cupos. No se retira ni recicla ningún registro.</p>
    </>}
  </section></details>;
}
