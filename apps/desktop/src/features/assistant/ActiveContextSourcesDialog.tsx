import {AlertCircle,CheckCircle2,FileText,RefreshCw,X,type LucideIcon} from "lucide-react";
import {createPortal} from "react-dom";
import type {RefObject} from "react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import type {AiContextSource,AiContextSourcePreviewResponse} from "../../types/domain";

type Props={
  refElement:RefObject<HTMLDivElement>;sources:AiContextSource[];preview:AiContextSourcePreviewResponse|null;previewLoadingId:string|null;
  busy:boolean;blocked:boolean;error:string|null;onPreview:(source:AiContextSource)=>void|Promise<void>;onRefresh?:()=>void|Promise<void>;
  onRemove?:(id:string)=>void|Promise<void>;onExtend?:(id:string)=>void|Promise<void>;onAddToProject?:(id:string)=>void|Promise<void>;onClose:()=>void;
};
const originLabels={current:"Archivo comprobado",changed:"Fuente modificada",unavailable:"Origen no disponible",unverified:"Origen pendiente de revisión",unsupported:"Copia de formato no compatible",snapshot:"Instantánea adjunta"};
function status(source:AiContextSource){if(source.requiresReview)return "Revisar copia";return {ready:"Disponible",warning:"Aviso",error:"Lectura no disponible",processing:"Procesando",expired:"Caducada",expiring:"Caduca pronto"}[source.status];}
function Action({icon:Icon,children,onClick,disabled=false,primary=false}:{icon?:LucideIcon;children:string;onClick:()=>void;disabled?:boolean;primary?:boolean}){
  return <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-40 ${primary?"bg-brand-orange text-white hover:bg-brand-dark":"text-ink-secondary hover:bg-panel"}`}>{Icon&&<Icon size={15}/>}{children}</button>;
}
export function ActiveContextSourcesDialog({refElement,sources,preview,previewLoadingId,busy,blocked,error,onPreview,onRefresh,onRemove,onExtend,onAddToProject,onClose}:Props){
  const selected=sources.find(source=>source.id===(previewLoadingId??preview?.source.id));
  const review=preview?.originReview;
  const OriginIcon=review?.status==="current"?CheckCircle2:review?.status==="snapshot"?FileText:AlertCircle;
  const canRefresh=Boolean(onRefresh&&review?.canRefresh&&(review.status==="changed"||review.status==="unverified"));
  return createPortal(<ModalFrame label="Fuentes del contexto IA" onClose={onClose}>
    <section ref={refElement} className="flex w-full max-w-[760px] flex-col overflow-hidden rounded-2xl bg-white text-sm shadow-menu" style={{height:"min(600px, calc(100dvh - 24px))"}}>
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4"><div><h2 className="font-semibold text-ink-primary">Fuentes del contexto IA <span className="ml-2 text-xs font-normal text-ink-secondary">{sources.length}</span></h2><p className="mt-2 text-xs leading-5 text-ink-secondary">Revisa qué copia se usará y actualízala desde su archivo cuando lo necesites.</p></div><button type="button" aria-label="Cerrar fuentes del contexto" className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel" onClick={onClose}><X size={18}/></button></header>
      <div className="shrink-0 px-4 py-3 sm:hidden"><label className="sr-only" htmlFor="context-source-select">Fuente de contexto</label><select id="context-source-select" value={selected?.id??""} disabled={busy} className="min-h-11 w-full rounded bg-panel px-3 text-sm" onChange={event=>{const source=sources.find(source=>source.id===event.target.value);if(source)void onPreview(source);}}><option value="">Elige una fuente</option>{sources.map(source=><option key={source.id} value={source.id}>{source.name} · {status(source)}</option>)}</select></div>
      <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Fuentes incorporadas" className="hidden min-h-0 overflow-y-auto px-3 py-4 sm:block">{sources.length?sources.map(source=><button key={source.id} type="button" disabled={busy} aria-pressed={preview?.source.id===source.id} className={`flex min-h-11 w-full flex-col justify-center rounded-lg px-3 py-2 text-left disabled:opacity-50 ${preview?.source.id===source.id?"bg-brand-hover":"hover:bg-panel"}`} onClick={()=>void onPreview(source)}><span className="w-full break-words text-xs font-semibold">{source.name}</span><span className="mt-1 text-[11px] text-ink-secondary">{status(source)}</span></button>):<p className="px-3 text-xs text-ink-secondary">No hay fuentes incorporadas.</p>}</nav>
        <div className="min-h-0 overflow-y-auto px-5 pb-4 pt-2 sm:pt-4">
          {error&&<p role="alert" className="mb-3 break-words text-xs leading-5 text-red-800">{error}</p>}
          {previewLoadingId&&<p role="status" className="mb-3 text-xs text-ink-secondary">Comprobando copia y origen…</p>}
          {preview?<>
            <h3 className="break-words font-semibold">{preview.source.name}</h3><p className="mt-1 text-xs text-ink-secondary">{{project_document:"Documento del proyecto",handwritten_note:"Nota manuscrita",image:"Imagen",external_file:"Adjunto"}[preview.source.kind]} · {Math.ceil(preview.source.sizeBytes/1024)} KB</p>
            <section aria-label="Vigencia de la copia" className="my-4 text-xs leading-5"><p className="flex items-center gap-2 font-semibold"><OriginIcon size={15} className={`shrink-0 ${review?.status==="current"?"text-emerald-700":review?.status==="snapshot"?"text-ink-secondary":"text-brand-orange"}`}/>{review?originLabels[review.status]:"Vigencia de origen no comprobada"}</p><p className="mt-2 text-ink-secondary">{review?.message??"Vuelve a revisar esta copia antes de usarla como contexto."}</p></section>
            {preview.source.warning&&preview.source.warning!==review?.message&&<p className="mb-3 text-xs leading-5 text-brand-dark">{preview.source.warning}</p>}
            {preview.source.error&&<p className="mb-3 text-xs leading-5 text-red-800">{preview.source.error}</p>}
            <section aria-label="Texto de la copia conservada"><h4 className="mb-2 text-xs font-semibold text-ink-secondary">Copia conservada</h4><p className="whitespace-pre-wrap break-words text-xs leading-5 text-ink-secondary">{preview.previewText|| (preview.source.kind==="image"?"Imagen incorporada al contexto visual.":"Sin texto extraíble en esta copia.")}</p></section>
            <footer className="sticky bottom-0 mt-5 flex flex-wrap gap-1 bg-white py-2" aria-label="Acciones sobre esta copia">
              <Action icon={RefreshCw} disabled={busy||!!previewLoadingId} onClick={()=>void onPreview(preview.source)}>Revisar origen</Action>
              {canRefresh&&<Action primary disabled={busy||blocked||!!previewLoadingId} onClick={()=>void onRefresh?.()}>{busy?"Actualizando…":"Actualizar copia"}</Action>}
              {onExtend&&preview.source.expiresAt&&<Action disabled={busy} onClick={()=>void onExtend(preview.source.id)}>Mantener 1 h</Action>}
              {onAddToProject&&preview.source.kind==="external_file"&&!preview.source.path&&!!preview.previewText&&<Action icon={FileText} disabled={busy} onClick={()=>void onAddToProject(preview.source.id)}>Crear documento con este texto</Action>}
              {onRemove&&<Action disabled={busy} onClick={()=>void onRemove(preview.source.id)}>Quitar del contexto</Action>}
            </footer>
          </>:!previewLoadingId&&<p className="py-6 text-sm leading-6 text-ink-secondary">Elige una fuente para ver su copia incorporada, comprobar su origen y decidir qué usar.</p>}
        </div>
      </div>
    </section>
  </ModalFrame>,document.body);
}
