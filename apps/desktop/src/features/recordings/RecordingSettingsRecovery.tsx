import {useState} from "react";
import {isTauriMobileRuntime} from "../../lib/runtime/platform";
import {ModalFrame} from "../../components/ui/ModalFrame";
import type {RecordingSnapshot} from "../../types/recording";

export function RecordingSettingsRecovery({snapshot,busy,error,onRecover,onClose}:{snapshot:RecordingSnapshot;busy:boolean;error:string|null;onRecover:(revision:string)=>Promise<RecordingSnapshot|null>;onClose:()=>void}){
  const [revision]=useState(snapshot.settingsRecoveryRevision);
  const [attempted,setAttempted]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const changed=revision!==snapshot.settingsRecoveryRevision;
  const available=!snapshot.settingsError;
  const button="min-h-11 rounded-md px-3 text-xs font-semibold disabled:opacity-50";
  return <ModalFrame label="Recuperar preferencias de grabación" onClose={()=>{if(!busy)onClose();}} className="z-[180]">
    <section className="flex max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white shadow-menu" aria-busy={busy}>
      <header className="px-5 pt-4"><h2 className="text-base font-semibold">Recuperar preferencias</h2><p className="mt-1 text-xs text-ink-secondary">Grabación · nuevas sesiones</p></header>
      <div className="min-h-0 space-y-3 overflow-y-auto px-5 py-4 text-xs leading-5">
        <p>Se conservará una copia exacta de las preferencias actuales antes de restaurar las básicas. El audio y las sesiones se mantienen.</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2"><dt>Micrófono</dt><dd>Activado</dd><dt>Audio de aplicaciones</dt><dd>{snapshot.settings.systemAudio?"Activado":"Desactivado"}</dd><dt>Idiomas</dt><dd>Detección automática</dd><dt>Conservación de audio</dt><dd>7 días tras completar</dd>{!isTauriMobileRuntime()&&<><dt>Inicio con Windows</dt><dd>Desactivado</dd></>}</dl>
        <p className="text-ink-secondary">Después podrás ajustar estas preferencias. No se inicia ninguna grabación.</p>
        {available?<p role="status">Las preferencias ya están disponibles. La consulta actual confirma que puedes volver a utilizarlas.</p>:<p role="status" className="text-ink-secondary">{snapshot.settingsError}</p>}
        {!revision&&!available&&<p role="alert">No se puede conservar una copia verificable del archivo. Recupera su acceso antes de volver a revisar.</p>}
        {changed&&!available&&<p role="alert">Las preferencias han cambiado. Cierra y vuelve a revisar antes de otra acción.</p>}
        {error&&!available&&<p role="alert" className="text-red-700">{error}</p>}
        {uncertain&&!available&&<p role="status">La recuperación no se ha confirmado. Se consultará el estado sin repetir la acción. Cierra y vuelve a revisar antes de intentarlo otra vez.</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-3"><button className={button} disabled={busy} onClick={onClose}>{available?"Volver a ajustes":"Cancelar"}</button><button className={`${button} bg-brand-dark text-white`} disabled={busy||attempted||available||changed||!revision} onClick={async()=>{if(!revision)return;setAttempted(true);const next=await onRecover(revision);if(next&&!next.settingsError)onClose();else setUncertain(true);}}>{busy?"Conservando y recuperando…":"Restaurar preferencias básicas"}</button></footer>
    </section>
  </ModalFrame>;
}
