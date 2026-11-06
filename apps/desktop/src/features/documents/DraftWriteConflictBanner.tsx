import {Files} from "lucide-react";
export function DraftWriteConflictBanner({busy,onReview,onRecovery}:{busy:boolean;onReview:()=>void;onRecovery:()=>void}){
  return <aside aria-label="Conflicto del borrador guardado" className="my-2 flex flex-wrap items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-ink-primary">
    <Files size={18} aria-hidden="true" className="shrink-0"/><div className="min-w-[180px] flex-1"><p className="font-medium">Revisa el borrador guardado</p><p className="text-xs">No se ha sustituido. Tu edición sigue abierta; consérvala como copia antes de revisarlo.</p></div>
    <button type="button" disabled={busy} onClick={onReview} className="min-h-11 rounded-md bg-white px-3 text-xs font-medium disabled:opacity-60">{busy?"Conservando y revisando…":"Conservar y revisar borrador"}</button>
    <button type="button" onClick={onRecovery} className="min-h-11 rounded-md px-2 text-xs underline underline-offset-2">Recuperación</button>
  </aside>;
}
