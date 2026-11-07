import { useCallback, useEffect, useRef, useState } from "react";
import { copyAiResult, listAiResults, preserveAiResult, removeAiResult } from "../../lib/api/aiResults";
import { getApiErrorMessage } from "../../lib/api/client";
import type { AiReviewRecord } from "../../types/aiResults";
import type { FileOperationResult } from "../../types/domain";

export type AiResultReviewEntry = { result: AiReviewRecord; stored: boolean; error?: string };
export function useAiResultReview(enabled: boolean) {
  const [entries, setEntries] = useState<AiResultReviewEntry[]>([]);
  const entriesRef = useRef(entries); entriesRef.current = entries;
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const revision = useRef(0);
  const writes = useRef(new Map<string, Promise<boolean>>());
  const removedIds = useRef(new Set<string>());
  const wasRemoved = useCallback((id: string) => removedIds.current.has(id), []);
  const reload = useCallback(async () => {
    const version = ++revision.current;
    try {
      const snapshot = await listAiResults();
      if (version !== revision.current) return;
      const durable = snapshot.results.filter(result => !removedIds.current.has(result.id));
      const confirmedIds = new Set(durable.map(result => result.id));
      setEntries(current => [...durable.map(result => ({ result, stored: true })), ...current.filter(entry => !entry.stored && !confirmedIds.has(entry.result.id) && !removedIds.current.has(entry.result.id))]);
      setWarnings(snapshot.warnings); setError(null);
    } catch (failure) { if (version === revision.current) setError(getApiErrorMessage(failure, "No se pueden consultar los resultados conservados.")); }
  }, []);
  useEffect(() => { if (enabled) void reload(); return () => { revision.current++; }; }, [enabled, reload]);

  function adopt(result: AiReviewRecord, stored: boolean, error?: string) {
    if (removedIds.current.has(result.id)) return;
    revision.current++;
    setEntries(current => {
      const confirmed = current.find(entry => entry.result.id === result.id && entry.stored);
      return [!stored && confirmed ? confirmed : { result, stored, error }, ...current.filter(entry => entry.result.id !== result.id)];
    });
  }

  async function retain(result: AiReviewRecord) {
    if (removedIds.current.has(result.id)) return;
    if (writes.current.has(result.id)) { await writes.current.get(result.id); return; }
    revision.current++;
    setEntries(current => current.some(entry => entry.result.id === result.id) ? current : [{ result, stored: false }, ...current]);
    const writing = (async () => { try {
      await preserveAiResult(result);
      setEntries(current => current.map(entry => entry.result.id === result.id ? { result, stored: true } : entry));
      return true;
    } catch (failure) {
      setEntries(current => current.map(entry => entry.result.id === result.id && !entry.stored ? { ...entry, stored: false, error: getApiErrorMessage(failure, "Solo disponible en esta sesión; no cierres la aplicación antes de conservarlo.") } : entry));
      return false;
    } })();
    writes.current.set(result.id, writing);
    await writing;
    if (writes.current.get(result.id) === writing) writes.current.delete(result.id);
  }
  async function copy(id: string, outputId: string): Promise<FileOperationResult | null> {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setError(null);
    try {
      const entry = entriesRef.current.find(entry => entry.result.id === id);
      if (!entry) return null;
      const storedWhileWaiting = await writes.current.get(id);
      if (!entry.stored && !storedWhileWaiting) { await preserveAiResult(entry.result); setEntries(current => current.map(item => item.result.id === id ? { ...item, stored: true, error: undefined } : item)); }
      return await copyAiResult(id, outputId);
    } catch (failure) { setError(getApiErrorMessage(failure, "No se pudo crear la copia. El resultado se conserva.")); return null; }
    finally { pending.current = false; setBusy(false); }
  }
  async function remove(id: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); revision.current++;
    try {
      const storedWhileWaiting = await writes.current.get(id);
      const entry = entriesRef.current.find(entry => entry.result.id === id);
      if (entry?.stored || storedWhileWaiting) await removeAiResult(id);
      removedIds.current.add(id);
      setEntries(current => current.filter(entry => entry.result.id !== id));
    } catch (failure) { setError(getApiErrorMessage(failure, "No se pudo quitar el resultado.")); }
    finally { pending.current = false; setBusy(false); }
  }
  return { entries, warnings, error, busy, retain, adopt, copy, remove, reload, wasRemoved };
}
