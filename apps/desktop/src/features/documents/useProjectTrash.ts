import { useCallback, useEffect, useRef, useState } from "react";
import { getProjectTrash, reviewProjectTrash, restoreProjectTrash,reviewTrashRestoreAttempt,createTrashRestoreAttemptId } from "../../lib/api/trash";
import { ApiError,getApiErrorMessage } from "../../lib/api/client";
import type { FileOperationResult } from "../../types/domain";
import type { TrashSnapshot, TrashReview,TrashRestoreSummary,TrashRestoreProof } from "../../types/trash";

export function useProjectTrash(projectId: string, onRestored: (result: FileOperationResult) => void) {
  const [snapshot, setSnapshot] = useState<TrashSnapshot>({ entries: [], warnings: [] });
  const [selected, setSelected] = useState<TrashReview | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt,setAttempt]=useState<TrashRestoreSummary|null>(null);
  const acknowledged=useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const revision = useRef(0);
  const restored = useRef(onRestored); restored.current = onRestored;
  const reload = useCallback(async () => {
    if (pending.current) return;
    const version = ++revision.current; setLoading(true); setSelected(null);
    try {
      const next = await getProjectTrash(projectId);
      if (version === revision.current) { setSnapshot(next); setError(null); setBlocked(new Set()); }
    } catch (failure) { if (version === revision.current) setError(getApiErrorMessage(failure,"No se ha podido consultar la papelera. La decisión anterior sigue bloqueada.")); }
    finally { if (version === revision.current) setLoading(false); }
  }, [projectId]);
  useEffect(() => {
    pending.current=false;setBusy(false);setLoading(true);++revision.current;
    setSnapshot({entries:[],warnings:[]}); setSelected(null);setBlocked(new Set());setNotice(null);setAttempt(null);acknowledged.current=new Set();
    const timer=setTimeout(()=>void reload(),0);
    return () => { clearTimeout(timer);revision.current++; };
  }, [reload]);
  async function review(id: string) {
    if (pending.current || loading || blocked.has(id)) return;
    pending.current=true;setBusy(true);setSelected(null);setError(null);setNotice(null);
    const version=++revision.current;
    try {
      const next=await reviewProjectTrash(projectId,id);
      if(next.entry.id!==id || next.entry.projectId!==projectId || next.entry.status!=="stored" || !/^[a-f0-9]{64}$/.test(next.revision)) throw new Error("La revisión recibida no corresponde al elemento seleccionado.");
      if(version===revision.current)setSelected(next);
    }catch(failure){if(version===revision.current){setError(getApiErrorMessage(failure,"No se puede revisar el contenido. Se conserva sin cambios."));setBlocked(old=>new Set(old).add(id));}}
    finally{if(version===revision.current){pending.current=false;setBusy(false);}}
  }
  async function restore() {
    if (pending.current || !selected || blocked.has(selected.entry.id)) return;
    const reviewed=selected;
    pending.current = true; setBusy(true); setError(null);setNotice(null);
    const version = ++revision.current;
    let attemptId:string;
    try{attemptId=createTrashRestoreAttemptId();}catch{pending.current=false;setBusy(false);setError("No se pudo crear la identidad del intento. La restauración no ha comenzado.");return;}
    const target:TrashRestoreSummary={id:attemptId,entryId:reviewed.entry.id,originalPath:reviewed.entry.originalPath,createdAt:new Date().toISOString(),phase:"applying"};
    setAttempt(target);
    let result:FileOperationResult;
    try {
      try {
        const response = await restoreProjectTrash(projectId, reviewed.entry.id, reviewed.revision,attemptId);
        if(response.restoreAttemptId!==attemptId||response.restoredRevision!==reviewed.revision)throw new Error("El acuse no corresponde a este intento de restauración.");
        result=response;
      }catch(failure){
        if(failure instanceof ApiError&&failure.operationOutcome==="not-started")throw failure;
        const proof=await reviewTrashRestoreAttempt(projectId,reviewed.entry.id,attemptId);
        if(!confirmed(proof,target)||proof.reviewedRevision!==reviewed.revision)throw failure;
        result=proof.result!;
      }
    } catch (failure) {
      if (version === revision.current) {
        setSelected(null);setBlocked(old=>new Set(old).add(reviewed.entry.id));
        const notStarted=failure instanceof ApiError&&failure.operationOutcome==="not-started";
        if(notStarted)setAttempt(null);
        setError(getApiErrorMessage(failure,"No se ha confirmado la restauración.")+(notStarted?" Actualiza y revisa antes de otra decisión.":" Consulta el intento para comprobar el resultado; no se repetirá la petición."));
      }
      return;
    } finally { if(version===revision.current){pending.current = false; setBusy(false);} }
    acknowledge(target,result,version);
  }
  function confirmed(proof:TrashRestoreProof,target:TrashRestoreSummary){return proof.attemptId===target.id&&proof.entryId===target.entryId&&proof.status==="confirmed"&&proof.canReplay===false&&Boolean(proof.result);}
  function acknowledge(target:TrashRestoreSummary,result:FileOperationResult,version:number){
    if(version!==revision.current)return;
    setAttempt(target);setSelected(null);setError(null);setSnapshot(old=>({...old,entries:old.entries.filter(entry=>entry.id!==target.entryId)}));
    setNotice("Elemento restaurado. El resto de copias se conserva.");
    if(acknowledged.current.has(target.id))return;
    acknowledged.current.add(target.id);
    try{restored.current(result);}catch{setNotice("Elemento restaurado; no se pudo actualizar la vista. Actualiza el proyecto para comprobar su contenido.");}
  }
  async function verifyAttempt(target:TrashRestoreSummary){
    if(pending.current)return;
    pending.current=true;setBusy(true);setSelected(null);setAttempt(target);setError(null);setNotice(null);
    const version=++revision.current;
    try{
      const proof=await reviewTrashRestoreAttempt(projectId,target.entryId,target.id);
      if(confirmed(proof,target)){acknowledge(target,proof.result!,version);}
      else if(version===revision.current){setBlocked(old=>new Set(old).add(target.entryId));setError("El intento no está confirmado o sus pruebas cambiaron. Se conservan los datos; esta consulta no repite la restauración.");}
    }catch(failure){if(version===revision.current)setError(getApiErrorMessage(failure,"No se puede consultar el intento conservado. No se ha repetido la restauración."));}
    finally{if(version===revision.current){pending.current=false;setBusy(false);}}
  }
  return { snapshot, selected, blocked, attempt, error, notice, loading, busy, review, restore, reload,verifyAttempt, clearReview:()=>setSelected(null) };
}
