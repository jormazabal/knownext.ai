import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { AssetMetadata, DocumentRecord, HandwrittenNoteRecord, Project, ProjectVersioningStatus, WorkspaceTab } from "../../types/domain";

type Props = {
  tab: WorkspaceTab | null;
  project: Project | null;
  document: DocumentRecord | null;
  note: HandwrittenNoteRecord | null;
  image: AssetMetadata | null;
  dirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  needsReview?: boolean;
  loadError?: string;
  versioning: ProjectVersioningStatus | null;
  onConfigureProject: () => void;
};

export function DocumentInfoPanel({tab,project,document,note,image,dirty,saveState,versioning,onConfigureProject,needsReview,loadError}:Props) {
  if(!tab || tab.kind==="ai-conversation") return <p className="px-2 py-5 text-sm text-ink-secondary">Abre un documento para consultar su información.</p>;
  const personal=tab.kind==="notes", release=tab.kind==="release-notes";
  const currentDocument=tab.kind==="document" && document?.id===tab.id ? document:null;
  const currentNote=tab.kind==="handwritten-note" && note?.id===tab.id ? note:null;
  const currentImage=tab.kind==="image" && image?.id===tab.id ? image:null;
  const record=currentDocument ?? currentNote;
  const path=record?.path ?? ("path" in tab ? tab.path:null);
  const conflict=needsReview || record?.baseVerified===false || record?.diskChanged || record?.orphaned;
  const loading=(tab.kind==="document" || tab.kind==="handwritten-note") && !record;
  const editable=personal || tab.kind==="document" || tab.kind==="handwritten-note";
  const status=loading ? loadError ? "Información no disponible; revisa el aviso del documento" : "Cargando información…" : !editable ? "Solo lectura" : conflict ? "Requiere revisar las versiones" : saveState==="saving" ? "Guardando en el dispositivo…" : saveState==="error" ? "Guardado pendiente de resolver" : personal ? "Autoguardado en este dispositivo" : dirty ? "Cambios pendientes de guardar" : "Guardado en el dispositivo";
  const format=tab.kind==="handwritten-note" ? "Nota manuscrita (.knote)" : tab.kind==="image" ? currentImage?.mimeType ?? "Imagen" : tab.kind==="reference-document" ? tab.format.toUpperCase() : "Markdown";
  const scope=personal ? "Personal · este dispositivo" : release ? "Aplicación" : project?.name ?? "Proyecto no disponible";
  return <section className="px-2 py-2" aria-label="Información del documento">
    <h2 className="break-words text-base font-semibold">{tab.name}</h2>
    <p role="status" className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-secondary">
      {saveState==="saving" || loading && !loadError ? <Loader2 aria-hidden size={15} className="mt-0.5 shrink-0 animate-spin"/> : conflict || loadError || saveState==="error" ? <AlertCircle aria-hidden size={15} className="mt-0.5 shrink-0 text-brand-orange"/> : <CheckCircle2 aria-hidden size={15} className="mt-0.5 shrink-0"/>}{status}
    </p>
    <dl className="mt-6 space-y-5 text-sm">
      <Info label="Ámbito" value={scope}/>
      <Info label="Formato" value={format}/>
      {path && <Info label="Ruta en el proyecto" value={path}/>}
      {currentDocument && <Info label="Contenido" value={`${currentDocument.wordCount.toLocaleString("es-ES")} ${currentDocument.wordCount===1?"palabra":"palabras"}`}/>}
      {currentNote && <Info label="Contenido" value={`${currentNote.content.pages.length} ${currentNote.content.pages.length===1?"página":"páginas"}`}/>}
      {currentImage && <><Info label="Tamaño" value={formatBytes(currentImage.sizeBytes)}/>{currentImage.width && currentImage.height ? <Info label="Dimensiones" value={`${currentImage.width} × ${currentImage.height} px`}/>:null}</>}
      {!personal && !release && project && <Info label="Historial" value={versioning?.available ? "Historial local disponible" : versioning?.enabled ? "Historial local no disponible" : "Sin historial local"}/>}
    </dl>
    {!personal && !release && project && <button className="mt-6 min-h-11 rounded-md px-2 text-left text-sm font-semibold text-brand-orange hover:bg-brand-hover" onClick={onConfigureProject}>Configurar este proyecto</button>}
  </section>;
}

function Info({label,value}:{label:string;value:string}) {return <div><dt className="text-xs text-ink-secondary">{label}</dt><dd className="mt-1 break-words leading-6 text-ink-primary">{value}</dd></div>;}
function formatBytes(bytes:number) {if(bytes<1024)return `${bytes} B`;return bytes<1024*1024?`${(bytes/1024).toLocaleString("es-ES",{maximumFractionDigits:1})} KB`:`${(bytes/(1024*1024)).toLocaleString("es-ES",{maximumFractionDigits:1})} MB`;}
