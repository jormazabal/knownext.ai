import { useEffect, useRef, useState } from "react";
import { projectTransfers } from "../../lib/api/projectTransfer";
import { getApiErrorMessage } from "../../lib/api/client";
import type { ProjectTransferJob, ProjectTransferMode } from "../../types/projectTransfer";

export function useProjectTransfer(mode: ProjectTransferMode, onImported: (id: string) => void | Promise<void>, expectedTransferId?: string) {
  const [job, setJob] = useState<ProjectTransferJob | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const running = useRef(false), alive = useRef(true), current = useRef(job);
  const notified = useRef(new Set<string>());
  const expected = useRef(expectedTransferId); expected.current=expectedTransferId;
  current.current = job;
  async function notifyImported(next: ProjectTransferJob) {
    if (next.kind === "import" && next.phase === "completed" && next.targetProjectId && !notified.current.has(next.id)) {
      await onImported(next.targetProjectId); notified.current.add(next.id);
    }
  }
  function adopt(next: ProjectTransferJob, resetName = true) {
    if (!alive.current) return;
    if(expected.current&&(next.id!==expected.current||next.kind!=="import"||next.templateCatalogue||next.templateId))throw Error("La preparación no corresponde a la recuperación revisada. No se adopta otra transferencia.");
    current.current = next; setJob(next); setCancelRequested(next.cancelRequested);
    if (resetName) setName(next.requestedName ?? next.manifest?.projectName ?? "");
  }
  async function reload(preserveName = false) {
    const requested=expectedTransferId;
    const inventory = await projectTransfers.list();
    if (!alive.current||requested!==expected.current) return;
    setWarnings(inventory.warnings); const first = requested?inventory.jobs.find(j=>j.id===requested)??null:inventory.jobs[0] ?? null;
    if(requested&&!first){setJob(null);current.current=null;throw Error("No se encuentra la recuperación preparada. Consulta el mismo recibo desde Copias del proyecto; no se adopta otra transferencia.");}
    if (first) { adopt(first, !preserveName); await notifyImported(first); } else { setJob(null); current.current = null; }
  }
  useEffect(() => {
    alive.current = true;
    current.current=null;setJob(null);setBusy(true);setError(null);
    void reload().catch(error => { if (alive.current) setError(getApiErrorMessage(error, "No se pueden consultar las transferencias pendientes")); }).finally(() => { if (alive.current) setBusy(false); });
    return () => { alive.current = false; };
  }, [expectedTransferId]);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); }
    catch (error) {
      if (alive.current) { setError(getApiErrorMessage(error, "La transferencia no se pudo completar. Los originales se conservan."));
        // A lost acknowledgement is reconciled from its native receipt, never by repeating the action.
        try { await reload(true); } catch { /* Keep the last reviewed state and the original error. */ }
      }
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const start = (includeArchive = false) => run(async () => {
    if(expectedTransferId)throw Error("Esta ventana sólo abre la recuperación revisada. No inicia otra importación.");
    const started = await projectTransfers.begin(includeArchive && mode.kind === "export" ? {...mode, includeArchive: true} : mode); adopt(started);
    const prepared = started.phase === "awaiting_source" ? await projectTransfers.pick(started.id) : await projectTransfers.prepare(started.id);
    adopt(prepared);
  });
  const confirm = () => run(async () => {
    const latest = current.current; if (!latest?.archiveSha256) return;
    if(expectedTransferId&&latest.id!==expectedTransferId)throw Error("La preparación no corresponde a la recuperación revisada.");
    const result = latest.kind === "import" ? await projectTransfers.commit(latest.id, latest.archiveSha256, name.trim()) : await projectTransfers.deliver(latest.id, latest.archiveSha256);
    adopt(result);
    if (alive.current && latest.kind === "export" && result.phase === "ready" && !result.error) setNotice("Selección de destino cancelada. El paquete sigue preparado.");
    await notifyImported(result);
  });
  const resume = () => run(async () => {
    const latest = current.current; if (!latest) return;
    adopt(latest.phase === "awaiting_source" ? await projectTransfers.pick(latest.id) : await projectTransfers.prepare(latest.id));
  });
  const discard = (after?: () => void) => run(async () => {
    const latest = current.current; if (!latest) return;
    await notifyImported(latest);
    const result = await projectTransfers.discard(latest.id);
    if (!result.discarded || result.id !== latest.id) throw new Error("No se confirmó que la preparación se haya retirado.");
    if (alive.current) { current.current = null; setJob(null); setCancelRequested(false); setName(""); }
    after?.();
  });
  async function cancel() {
    const latest = current.current; if (!latest || cancelRequested) return;
    try { const result = await projectTransfers.cancel(latest.id); if (alive.current && current.current?.id === result.id) setCancelRequested(result.requested); }
    catch (error) { if (alive.current) setError(getApiErrorMessage(error, "No se pudo solicitar la cancelación")); }
  }
  const leave = (onClose: () => void) => {
    if (running.current || busy) return;
    const latest = current.current;
    if (latest?.phase === "completed") { void discard(onClose); return; }
    if (latest?.kind === "import" && latest.phase === "ready" && latest.archiveSha256) {
      void run(async () => {
        const remembered = await projectTransfers.rememberReview(latest.id, latest.archiveSha256!, name);
        if (remembered.id !== latest.id || remembered.archiveSha256 !== latest.archiveSha256 || remembered.requestedName !== name) throw new Error("No se confirmó la conservación del nombre. Se mantiene la revisión abierta.");
        adopt(remembered); if (alive.current) onClose();
      });
    } else onClose();
  };
  return { job, name, setName: (value: string) => { setName(value); setError(null); }, busy, error, notice, warnings, cancelRequested, start, confirm, resume, discard, cancel, leave, refresh: () => run(() => reload(true)) };
}
