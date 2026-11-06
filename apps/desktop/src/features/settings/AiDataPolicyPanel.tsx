import {useEffect,useState} from "react";
import {ChevronDown} from "lucide-react";
import {getAiDataPolicy} from "../../lib/api/aiDataPolicy";
import type {AiDataPolicy} from "../../types/aiDataPolicy";

export function AiDataPolicyPanel({language="es"}:{language?:"es"|"en"}){
  const english=language==="en";
  const[open,setOpen]=useState(false),[attempt,setAttempt]=useState(0);
  const[policy,setPolicy]=useState<AiDataPolicy|null>(null),[error,setError]=useState(false);
  useEffect(()=>{
    if(!open||policy)return;let current=true;setError(false);
    void getAiDataPolicy().then(value=>{if(current)setPolicy(value);}).catch(()=>{if(current)setError(true);});
    return()=>{current=false;};
  },[open,attempt,policy]);
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} className="rounded-md bg-panel px-4 text-ink-primary">
    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 py-3 text-sm font-medium"><span>{english?"AI data and retention":"Datos y conservación de IA"}</span><ChevronDown size={16} aria-hidden="true" className={open?"shrink-0 rotate-180":"shrink-0"}/></summary>
    <div className="space-y-4 pb-4 text-xs leading-5">
      {!policy&&!error&&<p role="status" className="text-ink-secondary">{english?"Reading local data policy…":"Consultando la política local…"}</p>}
      {error&&<div role="alert"><p>{english?"Data information could not be loaded. You can try again.":"No se ha podido consultar la información de datos. Puedes volver a intentarlo."}</p><button type="button" className="mt-2 min-h-11 rounded px-3 font-medium text-brand-dark hover:bg-brand-hover" onClick={()=>setAttempt(value=>value+1)}>{english?"Try again":"Reintentar"}</button></div>}
      {policy&&<>
        <section><h5 className="font-semibold">{english?"Sent to the provider":"Se envía al proveedor"}</h5><p className="mt-1 text-ink-secondary">{english?"The request and the context prepared for the action: the document or selection, attachments and relevant text fragments. Images and audio may be included when the corresponding capability is used.":"La solicitud y el contexto preparado para la acción: documento o selección, adjuntos y fragmentos de texto relevantes. Puede incluir imágenes y audio cuando se usa la capacidad correspondiente."}</p></section>
        <section><h5 className="font-semibold">{english?"Kept on this device":"Se conserva en este dispositivo"}</h5><ul className="mt-1 list-disc space-y-2 pl-4 text-ink-secondary"><li>{english?`Conversations include prompts, responses and operation events: up to ${policy.conversation.maximumEvents.toLocaleString("en-US")} events per project, with the oldest events removed first.`:`Las conversaciones incluyen prompts, respuestas y eventos de operaciones: hasta ${policy.conversation.maximumEvents.toLocaleString("es-ES")} eventos por proyecto, retirando primero los más antiguos.`}</li><li>{english?"Attached context and generated content kept for review are stored separately.":"El contexto adjunto y el contenido generado que se conserva para revisión se guardan por separado."}</li><li>{english?"The local index copies saved text. Relevant fragments may be used as AI context. Rebuild it after changing the originals.":"El índice local contiene una copia de texto guardado. Sus fragmentos relevantes pueden usarse como contexto IA. Reconstrúyelo tras cambiar los originales."}</li></ul><p className="mt-2 text-ink-secondary">{english?"These categories have no automatic expiry by date.":"Estas categorías no tienen caducidad automática por fecha."}</p></section>
        <p className="text-ink-secondary">{english?"Linked remote images can contact their host when displayed. Project AI pause controls new AI sends; it does not block those separate image requests.":"Las imágenes remotas enlazadas pueden contactar con su servidor al mostrarse. La pausa IA del proyecto controla los nuevos envíos IA; no bloquea esas peticiones de imágenes independientes."}</p>
        <section><h5 className="font-semibold">{english?"Deletion scope":"Alcance de la eliminación"}</h5><p className="mt-1 text-ink-secondary">{english?"Conversations, context, review results and indexes are separate categories. Removing one does not remove the others or the source documents. Local deletion does not delete provider copies; this app does not verify provider retention.":"Conversaciones, contexto, resultados e índices son categorías distintas. Eliminar una no elimina las demás ni los documentos originales. El borrado local no elimina copias del proveedor; la aplicación no verifica su retención."}</p></section>
      </>}
    </div>
  </details>;
}
