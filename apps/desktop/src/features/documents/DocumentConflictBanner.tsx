import type {DocumentConflictStatus} from "../../types/domain";

export function DocumentConflictBanner({
  conflictStatus,
  baseVerified = true,
  onKeepLocalVersion,
  onLoadDiskVersion,
  onMergeDiskVersion,
  sourceUnavailable=false,
  recoveryMessage,
  onReviewRecovery,
  onRetrySource,
}: {
  conflictStatus: DocumentConflictStatus;
  baseVerified?: boolean;
  onKeepLocalVersion: () => void;
  onLoadDiskVersion: () => void;
  onMergeDiskVersion?: () => void;
  sourceUnavailable?:boolean;
  recoveryMessage?:string|null;
  onReviewRecovery?:()=>void;
  onRetrySource?:()=>void;
}) {
  const orphaned = conflictStatus === "orphaned";
  return (
    <div className="mb-3 flex flex-wrap items-start gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-3 text-sm text-ink-primary">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <p className="font-semibold">{sourceUnavailable?"La fuente necesita revisión":orphaned ? "El archivo ya no existe en disco" : !baseVerified ? "No se puede verificar la base del borrador" : "El archivo cambió en disco"}</p>
        <p className="mt-1 text-sm leading-6 text-ink-secondary">
          {sourceUnavailable?"Puedes recuperar tu borrador con otro nombre. El archivo original se mantiene.":orphaned
            ? "Puedes guardar tu borrador para recrear el archivo o cargar disco para descartar el borrador local."
            : "Puedes comparar y combinar las versiones, mantener tu edición o cargar la versión del disco."}
        </p>
        {sourceUnavailable&&recoveryMessage&&<details className="mt-1 text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3 font-medium">Detalles de la fuente</summary><p className="max-h-32 overflow-y-auto break-words leading-5">{recoveryMessage}</p></details>}
      </div>
      <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
      {sourceUnavailable?<>{onRetrySource&&<button className="min-h-11 rounded-md px-3 text-sm font-medium text-brand-dark hover:bg-white" onClick={onRetrySource}>Revisar fuente</button>}{onReviewRecovery&&<button className="min-h-11 rounded-md bg-brand-dark px-3 text-sm font-semibold text-white" onClick={onReviewRecovery}>Recuperar copia</button>}</>:<>
      {!orphaned&&onMergeDiskVersion&&<button className="min-h-11 rounded-md bg-brand-dark px-3 py-2 text-sm font-semibold text-white" onClick={onMergeDiskVersion}>Comparar y combinar</button>}
      {!orphaned ? (
        <button className="min-h-11 rounded-md border border-brand-orange px-3 py-2 text-sm font-semibold text-brand-orange hover:bg-white" onClick={onLoadDiskVersion}>
          Cargar disco
        </button>
      ) : null}
      <button className="min-h-11 rounded-md bg-brand-orange px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark" onClick={onKeepLocalVersion}>
        {orphaned ? "Recrear archivo" : "Mantener mi versión"}
      </button>
      </>}
      </div>
    </div>
  );
}
