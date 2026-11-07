import {useEffect,useRef,useState} from "react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import {getApiErrorMessage} from "../../lib/api/client";

export type DocumentFooterDialogAction =
  | "discard-draft"
  | "update-remote"
  | "update-remote-discard-draft"
  | "sync-saved-while-draft";

type CloseDirtyDocumentDialogProps = {
  open: boolean;
  documentName: string;
  onCancel: () => void;
  onDiscard: () => void | boolean | Promise<void | boolean>;
  onSave: () => void | boolean | Promise<void | boolean>;
};

export function CloseDirtyDocumentDialog({ open, documentName, onCancel, onDiscard, onSave }: CloseDirtyDocumentDialogProps) {
  const[busy,setBusy]=useState<"save"|"discard"|null>(null);const[error,setError]=useState("");
  const inFlight=useRef(false);const mounted=useRef(true);
  const cancelButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(!open&&!inFlight.current)setError("");},[open]);
  useEffect(()=>{
    const dialog=cancelButton.current?.closest<HTMLElement>('[role="alertdialog"]');
    if(!dialog||dialog.closest('[inert]'))return;
    if(busy)dialog.focus({preventScroll:true});else if(error)cancelButton.current?.focus({preventScroll:true});
  },[busy,error]);
  async function run(action:"save"|"discard"){
    if(inFlight.current)return;inFlight.current=true;setBusy(action);setError("");
    try{const result=await (action==="save"?onSave():onDiscard());if(result===false&&mounted.current)setError("No se pudo completar la operación. El documento sigue abierto; puedes reintentar o cancelar el cierre.");}
    catch(cause){if(mounted.current)setError(getApiErrorMessage(cause,"No se pudo completar la operación. Se conserva el documento abierto."));}
    finally{inFlight.current=false;if(mounted.current)setBusy(null);}
  }
  if (!open) return null;

  return (
    <ModalFrame label="Cerrar documento con cambios" role="alertdialog" onClose={()=>{if(!inFlight.current)onCancel();}} className="z-[90]">
      <section aria-busy={!!busy} className="flex max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
        <header className="shrink-0 px-5 pt-4">
          <h2 className="text-[15px] font-semibold">Cerrar documento con cambios</h2>
          <p className="mt-1 break-all text-xs leading-5 text-ink-secondary">{documentName}</p>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4 text-xs leading-5 text-ink-secondary">
          El documento tiene cambios pendientes de guardar en disco. Puedes guardarlos, descartar el borrador interno o cancelar el cierre.
          {error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-4">
          <button ref={cancelButton} type="button" disabled={!!busy} className="min-h-11 rounded-md px-4 text-xs hover:bg-panel disabled:opacity-50" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" disabled={!!busy} className="min-h-11 rounded-md px-4 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={()=>void run("discard")}>
            {busy==="discard"?"Descartando…":"Descartar"}
          </button>
          <button type="button" disabled={!!busy} className="min-h-11 rounded-md bg-brand-dark px-4 text-xs font-semibold text-white disabled:opacity-50" onClick={()=>void run("save")}>
            {busy==="save"?"Guardando…":"Guardar"}
          </button>
        </footer>
      </section>
    </ModalFrame>
  );
}

type DocumentFooterActionDialogProps = {
  open: boolean;
  action: DocumentFooterDialogAction | null;
  documentName: string;
  onCancel: () => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
};

export function DocumentFooterActionDialog({ open, action, documentName, onCancel, onConfirm }: DocumentFooterActionDialogProps) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const inFlight=useRef(false);const mounted=useRef(true);const cancelButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(!inFlight.current)setError("");},[open,action,documentName]);
  useEffect(()=>{
    const dialog=cancelButton.current?.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if(!dialog||dialog.closest('[inert]'))return;
    if(busy)dialog.focus({preventScroll:true});else if(error)cancelButton.current?.focus({preventScroll:true});
  },[busy,error]);
  async function confirm(){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError("");
    try{const result=await onConfirm();if(result===false&&mounted.current)setError("No se ha confirmado la operación. Se conserva el contenido abierto. Revisa su estado antes de volver a intentarlo.");}
    catch(cause){if(mounted.current)setError(getApiErrorMessage(cause,"No se pudo completar la operación. Se conserva el contenido abierto."));}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  if (!open || !action) return null;
  const copy = getDocumentFooterActionCopy(action, documentName);

  return (
    <ModalFrame label={copy.title} role={copy.danger?"alertdialog":"dialog"} onClose={()=>{if(!inFlight.current)onCancel();}} className="z-[90]">
      <section aria-busy={busy} className="flex max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
        <header className="shrink-0 px-5 pt-4">
          <h2 id="document-footer-action-title" className="text-[15px] font-semibold text-ink-primary">{copy.title}</h2>
          <p className="mt-1 break-words [overflow-wrap:anywhere] text-xs leading-5 text-ink-secondary">{documentName}</p>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <p className="text-[12px] leading-5 text-ink-secondary">{copy.description}</p>
          {error&&<p role="alert" className="mt-3 text-xs leading-5 text-red-700">{error}</p>}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-4">
          <button ref={cancelButton} disabled={busy} className="min-h-11 rounded-md px-3 text-xs font-medium text-ink-primary hover:bg-panel disabled:opacity-50" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            className={[
              "min-h-11 rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-50",
              copy.danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-orange hover:bg-brand-dark",
            ].join(" ")}
            type="button"
            disabled={busy}
            onClick={()=>void confirm()}
          >
            {busy?"Procesando…":copy.confirmLabel}
          </button>
        </footer>
      </section>
    </ModalFrame>
  );
}

export function getDocumentFooterActionCopy(action: DocumentFooterDialogAction, documentName: string) {
  if (action === "discard-draft") {
    return {
      title: "Descartar cambios pendientes",
      description: `Se volverá a la última versión guardada de ${documentName}. Los cambios no guardados se perderán.`,
      confirmLabel: "Descartar cambios",
      danger: true,
    };
  }
  if (action === "update-remote-discard-draft") {
    return {
      title: "Actualizar y perder cambios pendientes",
      description: "Existe una versión más reciente en Git/GitHub. Si continúas, se descargará esa versión y se perderán los cambios pendientes que todavía no has guardado.",
      confirmLabel: "Actualizar y descartar",
      danger: true,
    };
  }
  if (action === "sync-saved-while-draft") {
    return {
      title: "Sincronizar versión guardada",
      description: "Se sincronizará la última versión guardada del documento. Los cambios pendientes seguirán abiertos como borrador hasta que los guardes.",
      confirmLabel: "Sincronizar versión guardada",
      danger: false,
    };
  }
  return {
    title: "Revisar versión disponible",
    description: "Existe una versión más reciente en Git/GitHub. Si continúas, se descargará y se mostrará la última versión del documento.",
    confirmLabel: "Actualizar",
    danger: false,
  };
}

export { RecoverableDraftsDialog } from "./RecoverableDraftsDialog";
