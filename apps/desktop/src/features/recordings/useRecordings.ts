import { useCallback, useEffect, useRef, useState } from "react";
import { recordingRequest } from "../../lib/api/recordings";
import type { RecordingSnapshot } from "../../types/recording";
export function useRecordings() {
  const [snapshot, setSnapshot] = useState<RecordingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const apply = useCallback(
    (next: RecordingSnapshot) =>
      setSnapshot((old) => (old && old.revision > next.revision ? old : next)),
    [],
  );
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await recordingRequest("snapshot");
        if (alive) apply(next);
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (alive) timer = setTimeout(poll, 500);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [apply]);
  const command = useCallback(
    async (action: string, payload: unknown = {}) => {
      if (running.current) return null;
      running.current = true;
      setBusy(action);
      setError(null);
      try {
        const next = await recordingRequest(action, payload);
        apply(next);
        return next;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [apply],
  );
  return { snapshot, error, busy, command };
}
