import {useState} from "react";
import {X} from "lucide-react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import {MAX_PAGE_TEXT} from "./pageTranscription";

export function PageTranscriptionDialog({pageNumber,initialText,currentText=initialText,onApply,onClose}:{pageNumber:number;initialText:string;currentText?:string;onApply:(text:string,baseText:string)=>string|null;onClose:()=>void}) {
  const [text,setText]=useState(initialText);const [error,setError]=useState("");
  const [baseText,setBaseText]=useState(initialText);
  const conflict=currentText!==baseText;
  return <ModalFrame label="Texto de la página" onClose={onClose}>
    <section className="flex max-h-[calc(100dvh-24px)] w-[min(620px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu">
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4"><div><h2 className="font-semibold">Texto de la página {pageNumber}</h2><p className="mt-2 text-xs leading-5 text-ink-secondary">Añade o corrige la transcripción. Los trazos y las demás páginas se conservan. Guarda la nota para consultar el texto en Acceso rápido; la búsqueda indica los archivos fuera de sus límites.</p></div><button type="button" aria-label="Cerrar texto de la página" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel"><X size={18}/></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3"><label className="block text-xs font-semibold">Transcripción revisada<textarea data-autofocus value={text} maxLength={MAX_PAGE_TEXT} onChange={event=>{setText(event.target.value);setError("");}} className="mt-2 h-56 min-h-32 w-full resize-y rounded-md border border-line bg-white p-3 text-sm leading-6 focus:border-brand-orange focus:outline-none"/></label><p className="mt-2 text-xs text-ink-secondary">{text.length.toLocaleString("es-ES")} / 64.000 caracteres · Solo en esta nota</p>{conflict&&<div className="mt-3 rounded bg-panel p-3"><p role="status" className="text-xs leading-5">El texto actual ha cambiado. Revisa y combina lo necesario en tu edición antes de continuar.</p><label className="mt-2 block text-xs font-semibold">Texto actual de la página<textarea readOnly value={currentText} className="mt-1 h-28 w-full rounded border border-line bg-white p-2 text-xs leading-5"/></label><button type="button" onClick={()=>{setBaseText(currentText);setError("");}} className="mt-2 min-h-11 rounded px-2 text-xs font-semibold text-brand-orange hover:bg-brand-hover">He revisado el texto actual</button></div>}{error&&<p role="alert" className="mt-3 text-xs leading-5 text-red-800">{error}</p>}</div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pb-4"><button type="button" onClick={onClose} className="min-h-11 rounded px-3 text-xs hover:bg-panel">Cancelar</button><button type="button" disabled={conflict} onClick={()=>{const failure=onApply(text,baseText);if(failure)setError(failure);else onClose();}} className="min-h-11 rounded bg-brand-orange px-4 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-40">Aplicar texto a la nota</button></footer>
    </section>
  </ModalFrame>;
}
