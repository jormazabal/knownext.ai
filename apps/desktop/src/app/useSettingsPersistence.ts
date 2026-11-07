import { useCallback, useRef, useState } from "react";
import { getApiErrorMessage } from "../lib/api/client";
import type { SettingsSaveDomain } from "../types/settings";

export type SettingsDomain = SettingsSaveDomain;
type Store = "configuration" | "export-template";
type Phase = "pending" | "saving" | "saved" | "error";
export type SettingsWriteState = { phase: Phase; message?: string };
export type SettingsWriteStates = Partial<Record<SettingsDomain, SettingsWriteState>>;

/** Orders writes to each actual JSON store; failed writes never discard UI values. */
export function useSettingsPersistence() {
  const [states, setStates] = useState<SettingsWriteStates>({});
  const current = useRef<SettingsWriteStates>({});
  const versions = useRef<Record<SettingsDomain, number>>({app: 0, ai: 0, export: 0});
  const queues = useRef<Partial<Record<Store, Promise<unknown>>>>({});
  const retries = useRef<Partial<Record<SettingsDomain, () => Promise<boolean>>>>({});
  const publish = useCallback((domain: SettingsDomain, value: SettingsWriteState) => {
    current.current = {...current.current, [domain]: value};
    setStates(current.current);
  }, []);

  const stage = useCallback((domain: SettingsDomain) => {
    versions.current[domain] += 1;
    delete retries.current[domain];
    publish(domain, {phase: "pending"});
  }, [publish]);

  const save = useCallback(function submit<T>(domain: SettingsDomain, store: Store, write: () => Promise<T>, onSaved: (value: T) => void): Promise<boolean> {
    const version = ++versions.current[domain];
    retries.current[domain] = () => submit(domain, store, write, onSaved);
    publish(domain, {phase: "saving"});
    const task = (queues.current[store] ?? Promise.resolve()).catch(() => undefined).then(async () => {
      if (versions.current[domain] !== version) return true;
      let value: T;
      try { value = await write(); }
      catch (error) {
        if (versions.current[domain] === version) publish(domain, {phase: "error", message: getApiErrorMessage(error, "No se pudieron guardar estos ajustes. Se conservan los cambios para volver a intentarlo.")});
        return false;
      }
      if (versions.current[domain] !== version) return true;
      try { onSaved(value); publish(domain, {phase: "saved"}); }
      catch { publish(domain, {phase: "saved", message: "Los ajustes están guardados. Vuelve a abrir la configuración para actualizar la vista."}); }
      return true;
    });
    queues.current[store] = task;
    const cleanup = () => { if (queues.current[store] === task) delete queues.current[store]; };
    void task.then(cleanup, cleanup);
    return task;
  }, [publish]);

  const retry = useCallback((domain: SettingsDomain) => current.current[domain]?.phase === "error" ? retries.current[domain]?.() ?? Promise.resolve(false) : Promise.resolve(false), []);
  const hasPending = useCallback((domain: SettingsDomain) => {
    const phase = current.current[domain]?.phase;
    return phase === "pending" || phase === "saving" || phase === "error";
  }, []);
  const getRevision = useCallback((domain: SettingsDomain) => versions.current[domain], []);
  return {states, stage, save, retry, hasPending, getRevision};
}

export function settingsSaveSummary(states: SettingsWriteStates, language: "es" | "en" = "es"): {state: "idle" | "saving" | "saved" | "error"; message: string | null} {
  const entries = Object.values(states);
  const errors = entries.filter(entry => entry.phase === "error").length;
  if (errors) return {state: "error", message: language === "en" ? `${errors} settings ${errors === 1 ? "group needs" : "groups need"} attention. Changes are kept in this session for retry.` : `${errors} ${errors === 1 ? "grupo de ajustes pendiente" : "grupos de ajustes pendientes"}. Los cambios siguen en esta sesión; puedes reintentar.`};
  if (entries.some(entry => entry.phase === "pending" || entry.phase === "saving")) return {state: "saving", message: null};
  if (entries.length) return {state: "saved", message: entries.find(entry => entry.message)?.message ?? null};
  return {state: "idle", message: null};
}
