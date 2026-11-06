import { useCallback, useEffect, useRef, useState } from "react";
import { recordingRequest } from "../../lib/api/recordings";
import type { RecordingSnapshot } from "../../types/recording";
export function useRecordings(active = true) {
  const [snapshot, setSnapshot] = useState<RecordingSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  const running = useRef(false);
  const snapshotRequest = useRef<Promise<RecordingSnapshot> | null>(null);
  const apply = useCallback(
    (next: RecordingSnapshot) =>
      setSnapshot((old) => (old && old.revision > next.revision ? old : next)),
    [],
  );
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", changed);
    changed();
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!active || !visible) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      // Reuse a read still in flight after a quick hide/show transition.
      const task = snapshotRequest.current ?? recordingRequest<RecordingSnapshot>("snapshot");
      snapshotRequest.current = task;
      try {
        const next = await task;
        if (alive) { apply(next); setSnapshotError(null); }
      } catch (e) {
        if (alive) setSnapshotError(String(e));
      } finally {
        if (snapshotRequest.current === task) snapshotRequest.current = null;
        if (alive) timer = setTimeout(poll, 500);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, visible, apply]);
  const command = useCallback(
    async (action: string, payload: unknown = {}) => {
      if (running.current) return null;
      running.current = true;
      setBusy(action);
      setCommandError(null);
      try {
        const next = await recordingRequest(action, payload);
        apply(next);
        return next;
      } catch (e) {
        setCommandError(String(e));
        return null;
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [apply],
  );
  return { snapshot, error: commandError ?? snapshotError, busy, command };
}
