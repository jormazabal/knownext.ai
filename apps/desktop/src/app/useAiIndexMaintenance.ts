import { useEffect, useRef, useState } from "react";
import { deleteAiIndex, getAiIndexStatus, rebuildAiIndex } from "../lib/api/ai";
import { getApiErrorMessage } from "../lib/api/client";
import type { AiIndexStatusResponse } from "../types/domain";

type Context = {
  projectId: string | undefined;
  projectEpoch: number;
  index: AiIndexStatusResponse | null;
  onResult: (result: AiIndexStatusResponse) => void;
  refresh: (projectId: string) => Promise<void>;
  onError: (cause: unknown, fallback: string) => void;
};

/** Own one local maintenance intent; reconcile errors by reading, never replaying. */
export function useAiIndexMaintenance(context: Context) {
  const current = useRef(context);
  current.current = context;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{projectId: string; epoch: number; message: string} | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function run(operation: "rebuild" | "clear" | "refresh") {
    const request = current.current;
    const projectId = request.projectId;
    if (!projectId || inFlight.current) return;
    const belongs = () => mounted.current && current.current.projectId === projectId && current.current.projectEpoch === request.projectEpoch;
    const revision = request.index?.projectId === projectId ? request.index.indexRevision : null;
    if (operation === "clear" && !revision) {
      setFailure({projectId, epoch: request.projectEpoch, message: "Actualiza el estado del índice antes de limpiarlo."});
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const result = operation === "clear" ? await deleteAiIndex(projectId, revision!) : operation === "rebuild" ? await rebuildAiIndex(projectId) : await getAiIndexStatus(projectId);
      if (result.projectId !== projectId) throw new Error("La respuesta del índice pertenece a otro proyecto. Consulta su estado.");
      if (belongs()) {
        current.current.onResult(result);
        if (operation !== "refresh") await current.current.refresh(projectId);
      }
    } catch (cause) {
      if (!belongs()) return;
      // A failed/lost ACK may follow a real removal. Read the actual state;
      // an explicit later click is required for any further mutation.
      if (operation !== "refresh") {
        try {
          const observed = await getAiIndexStatus(projectId);
          if (belongs() && observed.projectId === projectId) current.current.onResult(observed);
        } catch { /* Keep the prior state and the original operation error. */ }
      }
      if (belongs()) {
        const fallback = operation === "clear" ? "No se pudo confirmar la limpieza del índice. Consulta el estado antes de reintentar." : operation === "rebuild" ? "No se pudo confirmar la reconstrucción del índice. Consulta el estado antes de repetir." : "No se pudo actualizar el estado del índice. Se conserva la revisión anterior.";
        setFailure({projectId, epoch: request.projectEpoch, message: getApiErrorMessage(cause, fallback)});
        current.current.onError(cause, fallback);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    busy,
    error: failure && failure.projectId === context.projectId && failure.epoch === context.projectEpoch ? failure.message : null,
    rebuild: () => run("rebuild"),
    clear: () => run("clear"),
    refresh: () => run("refresh"),
  };
}
