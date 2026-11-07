import { LoaderCircle, X } from "lucide-react";
type Props={progress:string|null;saved:{exportId:string;fileName:string}|null;opening:boolean;onOpen:()=>void;onClose:()=>void};
export function ExportStatus({progress,saved,opening,onOpen,onClose}:Props) {
  if(!progress&&!saved)return null;
  return <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),12px)] z-[130] flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm text-ink-primary shadow-menu md:left-auto md:right-4 md:max-w-sm">
    {progress?<><LoaderCircle size={18} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true"/><div className="min-w-0"><p className="text-xs font-semibold">Preparando exportación</p><p className="truncate text-xs text-ink-secondary" title={progress}>{progress}</p></div></>:saved&&<><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Archivo exportado</p><p className="truncate text-xs text-ink-secondary" title={saved.fileName}>{saved.fileName}</p></div><button className="min-h-11 px-2 text-brand-orange" disabled={opening} onClick={onOpen}>Abrir</button><button aria-label="Cerrar aviso de exportación" className="grid min-h-11 min-w-11 place-items-center" onClick={onClose}><X size={16}/></button></>}
  </div>;
}
