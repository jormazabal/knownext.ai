import { useCallback, useEffect, useRef, useState } from "react";
import { archiveRecoveryCopy, getRecoveryInventory, recoverAsCopy, previewRecoveryCopy } from "../../lib/api/recovery";
import { getApiErrorMessage } from "../../lib/api/client";
import type { RecoveryCopy, RecoveryCopyPayload, RecoveryInventory, RecoveryPreview } from "../../types/recovery";
import type { RestoreDraftResponse } from "../../types/domain";

export function useRecoveryReview(open: boolean, onRecovered: (result: RestoreDraftResponse) => Promise<void>, onChanged: () => void, archivedOverride?: boolean) {
  const [localArchived, setArchived] = useState(false);
  const archived = archivedOverride ?? localArchived;
  const [inventory, setInventory] = useState<RecoveryInventory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RecoveryPreview | null>(null);
  const request = useRef(0);
  const submitting = useRef(false);
  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true); setError("");
    try {
      const response = await getRecoveryInventory(archived);
      if (sequence === request.current) setInventory(response);
    } catch (error) {
      if (sequence === request.current) setError(getApiErrorMessage(error, "No se pudieron revisar las copias. Se conservan sin cambios."));
    } finally { if (sequence === request.current) setLoading(false); }
  }, [archived]);
  useEffect(() => {
    setInventory(null); setNotice("");
    if (open) void refresh();
    return () => { request.current += 1; };
  }, [open, refresh]);

  async function run(copy: RecoveryCopy, payload?: RecoveryCopyPayload) {
    if (submitting.current) return false;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    let committed = false;
    try {
      if (payload) {
        const result = await recoverAsCopy(copy, payload);
        committed = true;
        setNotice("Archivo nuevo recuperado. Se conserva la copia de origen.");
        try { await onRecovered(result); }
        catch { setNotice("El archivo nuevo está recuperado. Vuelve a abrir el proyecto para actualizar la vista; la copia de origen se conserva."); }
      } else {
        const result = await archiveRecoveryCopy(copy);
        committed = true;
        setNotice(result.warning ?? (result.retired ? "Copia apartada y verificada. Se conserva sin caducidad automática." : "Copia archivada; el original sigue pendiente de revisión."));
      }
      onChanged();
      await refresh();
      return true;
    } catch (error) {
      setError(getApiErrorMessage(error, "No se ha completado la operación. Actualiza antes de volver a intentarlo."));
      return committed;
    } finally { submitting.current = false; setBusy(false); }
  }
  function clearFeedback() { setError(""); setPreview(null); }
  async function inspect(copy: RecoveryCopy) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); clearFeedback();
    try { setPreview(await previewRecoveryCopy(copy)); }
    catch (error) { setError(getApiErrorMessage(error, "No se pudo leer la copia. Se conserva sin cambios.")); }
    finally { submitting.current = false; setBusy(false); }
  }
  return { archived, setArchived, inventory, error, notice, loading, busy, refresh, run, preview, inspect, clearFeedback };
}
