import { useCallback, useState, type SetStateAction } from "react";

/** Drafts remain in memory only. Each setter stays bound to its original scope. */
export function useSessionValue<T>(scope: string, initial: T) {
  const [drafts, setDrafts] = useState<Record<string, T>>({});
  const update = useCallback((next: SetStateAction<T>) => {
    setDrafts(current => ({
      ...current,
      [scope]: typeof next === "function" ? (next as (value: T) => T)(current[scope] ?? initial) : next,
    }));
  }, [scope, initial]);
  return [drafts[scope] ?? initial, update] as const;
}

export function useSessionDraft(scope: string) {
  return useSessionValue(scope, "");
}
