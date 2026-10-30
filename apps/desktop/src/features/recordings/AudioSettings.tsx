import { useEffect, useState } from "react";
import { recordingRequest } from "../../lib/api/recordings";
import type { RecordingDevice } from "../../types/recording";
import { useRecordings } from "./useRecordings";
import { isTauriMobileRuntime } from "../../lib/runtime/platform";
export function AudioSettings({
  onOpenRecordings,
  onCredentials,
}: {
  onOpenRecordings: () => void;
  onCredentials: () => void;
}) {
  const { snapshot, error, busy, command } = useRecordings();
  const settings = snapshot?.settings;
  const [devices, setDevices] = useState<RecordingDevice[]>([]);
  useEffect(() => {
    void recordingRequest<RecordingDevice[]>("devices")
      .then(setDevices)
      .catch(() => undefined);
  }, []);
  const save = (patch: object) =>
    void command("settings", { ...settings, ...patch });
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Audio y grabación</h3>
        <p className="mt-2 text-sm text-ink-secondary">
          Preferencias para nuevas sesiones. Abrir estos ajustes no activa el
          micrófono.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {snapshot?.warning && <p role="status">{snapshot.warning}</p>}
      <p role="status" className="text-sm">
        {busy
          ? "Guardando…"
          : settings && !error
            ? "Configuración guardada"
            : ""}
      </p>
      {settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset
            disabled={!!busy}
            className="space-y-3 rounded-lg border border-line p-4"
          >
            <legend className="px-2 font-semibold">Comportamiento</legend>
            {!isTauriMobileRuntime() && (
              <>
                <label className="flex min-h-11 items-center justify-between gap-3">
                  Iniciar con Windows
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand-orange"
                    checked={settings.startWithWindows}
                    onChange={(e) =>
                      save({ startWithWindows: e.target.checked })
                    }
                  />
                </label>
                <label className="flex min-h-11 items-center justify-between gap-3">
                  Permanecer en la bandeja
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand-orange"
                    checked={settings.keepInTray}
                    onChange={(e) => save({ keepInTray: e.target.checked })}
                  />
                </label>
              </>
            )}
            <p className="text-xs text-ink-secondary">
              La grabación siempre comienza con una acción tuya. El inicio automático se aplica a la aplicación instalada.
            </p>
            <label className="flex min-h-11 items-center justify-between gap-3">
              Micrófono al iniciar
              <input
                type="checkbox"
                checked={settings.microphone}
                onChange={(e) => save({ microphone: e.target.checked })}
              />
            </label>
            {!isTauriMobileRuntime() && (
              <label className="flex min-h-11 items-center justify-between gap-3">
                Audio de aplicaciones al iniciar
                <input
                  type="checkbox"
                  checked={settings.systemAudio}
                  onChange={(e) => save({ systemAudio: e.target.checked })}
                />
              </label>
            )}
            {!isTauriMobileRuntime() &&
              (
                [
                  [
                    "microphoneDevice",
                    "Micrófono predeterminado",
                    "microphone",
                  ],
                  ["outputDevice", "Salida de aplicaciones", "system"],
                ] as const
              ).map(([key, label, kind]) => (
                <label key={key} className="block text-sm">
                  {label}
                  <select
                    className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2"
                    value={settings[key] ?? ""}
                    onChange={(e) => save({ [key]: e.target.value || null })}
                  >
                    <option value="">
                      Dispositivo predeterminado del sistema
                    </option>
                    {devices
                      .filter((d) => d.kind === kind)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
          </fieldset>
          <fieldset
            disabled={!!busy}
            className="space-y-3 rounded-lg border border-line p-4"
          >
            <legend className="px-2 font-semibold">
              Transcripción de reuniones
            </legend>
            <p>OpenAI · GPT-Transcribe</p>
            <p className="text-xs text-ink-secondary">
              Sin diarización. Se reutiliza la clave configurada en IA
              documental.
            </p>
            <button
              type="button"
              className="min-h-11 text-brand-orange"
              onClick={onCredentials}
            >
              Ver credenciales
            </button>
            <label className="block text-sm">
              Idiomas
              <select
                className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2"
                value={settings.languages.join(",")}
                onChange={(e) =>
                  save({
                    languages: e.target.value ? e.target.value.split(",") : [],
                  })
                }
              >
                <option value="">Detección automática</option>
                <option value="es">Castellano</option>
                <option value="eu">Euskera</option>
                <option value="es,eu">Castellano y euskera</option>
              </select>
            </label>
            <label className="block text-sm">
              Conservar audio local
              <select
                className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2"
                value={settings.retentionDays ?? "manual"}
                onChange={(e) =>
                  save({
                    retentionDays:
                      e.target.value === "manual"
                        ? null
                        : Number(e.target.value),
                  })
                }
              >
                <option value="0">Borrar tras crear el documento</option>
                <option value="7">Siete días tras crear el documento</option>
                <option value="manual">Hasta borrado manual</option>
              </select>
            </label>
            <p className="text-xs text-ink-secondary">
              Las grabaciones pendientes se conservan. La limpieza se realiza
              mientras la aplicación está abierta y afecta solo a la copia
              local.
            </p>
          </fieldset>
        </div>
      )}
      <button
        type="button"
        className="min-h-11 rounded-md bg-brand-orange px-4 text-sm font-semibold text-white"
        onClick={onOpenRecordings}
      >
        Abrir Grabaciones
      </button>
    </div>
  );
}
