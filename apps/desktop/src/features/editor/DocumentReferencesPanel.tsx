import {ArrowUpRight,Loader2,RefreshCw} from "lucide-react";
import {useEffect,useRef,useState} from "react";
import {getDocumentReferences} from "../../lib/api/documentReferences";
import {getApiErrorMessage} from "../../lib/api/client";
import type {DocumentReference,DocumentReferencesResponse,LocalReferenceTarget} from "../../types/documentReferences";

type Props={documentId:string;name:string;revision?:string;dirty:boolean;onOpen:(target:LocalReferenceTarget)=>void};

export function DocumentReferencesPanel({documentId,name,revision,dirty,onOpen}:Props) {
  const [response,setResponse]=useState<DocumentReferencesResponse|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const active=useRef(documentId);active.current=documentId;
  useEffect(()=>{
    let cancelled=false;setBusy(true);setError("");
    void getDocumentReferences(documentId).then(result=>{
      if(result.documentId!==documentId) throw new Error("La consulta no corresponde al archivo actual. Vuelve a actualizar las referencias.");
      if(!cancelled && active.current===documentId) setResponse(result);
    }).catch(error=>{
      if(!cancelled && active.current===documentId) setError(getApiErrorMessage(error,"No se pudieron consultar las referencias. Puedes volver a intentarlo."));
    }).finally(()=>{if(!cancelled && active.current===documentId)setBusy(false);});
    return()=>{cancelled=true;};
  },[documentId,revision,refresh]);
  const data=response?.documentId===documentId?response:null;
  return <section className="px-2 py-2" aria-label="Referencias del documento" aria-busy={busy}>
    <header className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-base font-semibold">{name}</h2><p className="mt-1 text-xs leading-5 text-ink-secondary">Enlaces locales del contenido guardado.</p></div><button className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-panel disabled:opacity-50" disabled={busy} aria-label="Actualizar referencias" onClick={()=>setRefresh(value=>value+1)}>{busy?<Loader2 aria-hidden size={16} className="animate-spin"/>:<RefreshCw aria-hidden size={16}/>}</button></header>
    {dirty && <p className="mt-3 text-xs leading-5 text-brand-orange">Hay cambios sin guardar. Guarda para incluirlos en esta vista.</p>}
    {error && <p role="alert" className="mt-3 break-words text-sm text-red-700">{error}{data?" Se conserva la consulta anterior.":""}</p>}
    {!data && busy && <p role="status" className="mt-5 text-sm text-ink-secondary">Revisando documentos guardados…</p>}
    {data && <>
      <p role="status" className="mt-4 text-xs leading-5 text-ink-secondary">{data.complete?"Revisión completa":"Revisión parcial"} · {data.scannedDocuments} documentos<br/><time dateTime={data.queriedAt}>{formatQueryTime(data.queriedAt)}</time></p>
      {data.outgoingSupported ? <ReferenceList title="Desde este archivo" entries={data.outgoing} complete={data.sourceRead && !data.limited} empty="No hay enlaces locales en el contenido consultado." onOpen={onOpen}/> : <p className="mt-4 text-xs leading-5 text-ink-secondary">Puedes consultar qué documentos enlazan este recurso.</p>}
      <ReferenceList title="Referencias recibidas" entries={data.incoming} complete={data.complete} empty="No se han encontrado referencias recibidas." onOpen={onOpen}/>
      {data.warnings.length>0 && <details className="mt-5 text-xs leading-5 text-ink-secondary"><summary className="min-h-11 cursor-pointer font-semibold">{data.warnings.length} avisos de la revisión</summary><ul className="space-y-3">{data.warnings.map((warning,index)=><li className="break-words" key={index}>{warning}</li>)}</ul></details>}
      {!data.complete && <p className="mt-4 text-xs leading-5 text-ink-secondary">{data.limited?"La consulta ha alcanzado su límite de tiempo, archivos o resultados y no cubre todo el proyecto.":"Algunos archivos no se pudieron consultar; revisa los avisos disponibles."}</p>}
    </>}
  </section>;
}

function formatQueryTime(value:string) {const date=new Date(value);return Number.isNaN(date.getTime())?"Fecha no disponible":`Consulta del ${new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date)}`;}

function ReferenceList({title,entries,empty,complete,onOpen}:{title:string;entries:DocumentReference[];empty:string;complete:boolean;onOpen:Props["onOpen"]}) {
  return <section className="mt-6"><h3 className="text-sm font-semibold">{title} <span className="ml-1 font-normal text-ink-secondary">{entries.length}</span></h3>
    {!entries.length ? <p className="mt-3 text-xs leading-5 text-ink-secondary">{complete?empty:"No hay resultados en la parte consultada."}</p> : <ul className="mt-2 space-y-2">{entries.map((entry,index)=>{
      const openable=entry.target.status==="available" && entry.target.kind!=="attachment";
      return <li key={`${entry.target.id}:${entry.line}:${entry.column}:${index}`} className="py-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{entry.target.name}</p>{entry.target.path!==entry.target.name && <p className="mt-1 break-words text-xs text-ink-secondary">{entry.target.path}</p>}<p className="mt-1 text-xs text-ink-secondary">Línea {entry.line}{entry.target.status==="missing"?" · Recurso no encontrado":entry.target.status==="blocked"?" · Ruta no accesible desde el proyecto":entry.target.kind==="attachment"?" · Sin visor integrado":entry.target.kind==="folder"?" · Carpeta del proyecto":""}</p></div>{openable && <button aria-label={`${entry.target.kind==="folder"?"Mostrar carpeta":"Abrir"} ${entry.target.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-panel" onClick={()=>onOpen(entry.target)}><ArrowUpRight aria-hidden size={17}/></button>}</div><details className="mt-1 text-xs leading-5 text-ink-secondary"><summary className="cursor-pointer py-2">Ver enlace</summary><p className="break-all">{entry.rawTarget}</p><p>Línea {entry.line}, columna {entry.column}</p></details></li>;
    })}</ul>}
  </section>;
}
