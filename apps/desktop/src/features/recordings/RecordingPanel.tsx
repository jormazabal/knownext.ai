import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Pause,
  Play,
  Square,
  X,
  FolderOpen,
  Trash2,
  Volume2,
} from "lucide-react";
import { useRecordings } from "./useRecordings";
import { recordingAudio, recordingRequest } from "../../lib/api/recordings";
import { getProjectTree, listProjects } from "../../lib/api/projects";
import type { DocumentTreeNode, Project } from "../../types/domain";
import type {
  RecordingDestination,
  RecordingDevice,
  RecordingSession,
  RecordingSettings,
} from "../../types/recording";
import {
  isTauriMobileRuntime,
  isTauriRuntime,
} from "../../lib/runtime/platform";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm hover:bg-brand-hover disabled:opacity-40";
const statusLabels: Record<RecordingSession["status"], string> = {
  recording: "Grabando",
  paused: "En pausa",
  pendingDestination: "Pendiente de destino",
  ready: "Lista para transcribir",
  queued: "En cola",
  transcribing: "Transcribiendo",
  attention: "Requiere atención",
  completed: "Completada",
};
export function recordingTime(samples: number) {
  const seconds = Math.floor(samples / 24000);
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(
      2,
      "0",
    )}:${Math.floor(seconds / 60) % 60 < 10 ? "0" : ""}${Math.floor(seconds / 60) % 60}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function RecordingPanel({
  initialDestination = null,
  onClose,
  onOpenDocument,
}: {
  initialDestination?: RecordingDestination | null;
  onClose?: () => void;
  onOpenDocument?: (id: string) => void;
}) {
  const { snapshot, error, busy, command } = useRecordings();
  const [startingName, setStartingName] = useState(
    initialDestination?.name ?? "",
  );
  const [draft, setDraft] = useState<RecordingSettings | null>(null);
  const [devices, setDevices] = useState<RecordingDevice[]>([]);
  const [destination, setDestination] = useState<RecordingSession | null>(null);
  const [list, setList] = useState(true);
  const [playing, setPlaying] = useState<RecordingSession | null>(null);
  const [confirm, setConfirm] = useState<{
    session: RecordingSession;
    action: "delete-audio" | "queue" | "discard";
  } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const active = snapshot?.sessions.find((s) => s.id === snapshot.captureOwner);
  const settings = active?.settings ?? draft ?? snapshot?.settings;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    void recordingRequest<RecordingDevice[]>("devices")
      .then(setDevices)
      .catch(() => undefined);
    return () => {
      previousFocus?.focus();
      void recordingRequest("preview-stop").catch(() => undefined);
    };
  }, []);
  async function update(next: RecordingSettings) {
    if (active) await command("inputs", { id: active.id, settings: next });
    else {
      setDraft(next);
      if (snapshot?.preview) await command("preview", { settings: next });
    }
  }
  async function stop() {
    if (!active) return;
    const next = await command("stop", { id: active.id });
    const session = next?.sessions.find((s) => s.id === active.id);
    if (session && !session.destination) setDestination(session);
    setList(true);
  }
  async function openDocument(id: string) {
    if (onOpenDocument) onOpenDocument(id);
    else if (isTauriRuntime()) {
      await emit("recording-open-document", { id });
      const main = await WebviewWindow.getByLabel("main");
      await main?.show();
      await main?.setFocus();
    }
  }
  return (
    <section
      ref={panelRef}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          if (confirm) setConfirm(null);
          else if (destination) setDestination(null);
          else if (playing) setPlaying(null);
          else onClose?.();
        }
        if (e.key === "Tab") {
          const dialogs = panelRef.current?.querySelectorAll<HTMLElement>(
            '[role="dialog"],[role="alertdialog"]',
          );
          const root = dialogs?.length
            ? dialogs[dialogs.length - 1]
            : panelRef.current;
          const items = Array.from(
            root?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
            ) ?? [],
          ).filter((el) => el.getClientRects().length > 0);
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
      className="flex h-full max-h-[100dvh] flex-col bg-white text-ink-primary"
      aria-label="Grabaciones"
    >
      <header className="flex items-center justify-between border-b border-line p-4">
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <Mic className="text-brand-orange" size={20} />
          Grabaciones
        </h2>
        {onClose && (
          <button
            className={button}
            aria-label="Cerrar grabaciones"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {error && (
          <p role="alert" className="rounded-md bg-orange-50 p-3 text-sm">
            {error}
          </p>
        )}
        {snapshot?.warning && (
          <p role="status" className="text-sm">
            {snapshot.warning}
          </p>
        )}
        {settings && (
          <section
            className="space-y-4 rounded-lg border border-line p-4"
            aria-label="Controles de grabación"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" role="status">
                {busy === "pause"
                  ? "Pausando…"
                  : busy === "stop"
                    ? "Finalizando…"
                    : active
                      ? statusLabels[active.status]
                      : snapshot?.preview
                        ? "Vista previa · No se está grabando"
                        : "Preparada"}
              </span>
              <span className="font-mono text-xl tabular-nums">
                {recordingTime(active?.samples ?? 0)}
              </span>
            </div>
            <AudioInputs
              settings={settings}
              devices={devices}
              levels={snapshot?.levels ?? [0, 0]}
              disabled={!!busy}
              recording={active?.status === "recording"}
              onChange={(next) => void update(next)}
            />
            {!isTauriMobileRuntime() && active?.status!=="recording" && <button className="min-h-11 text-xs text-ink-secondary" onClick={()=>{void recordingRequest<RecordingDevice[]>("devices").then(setDevices).catch(()=>undefined);}}>Actualizar dispositivos</button>}
            <p className="flex items-center gap-2 text-xs text-ink-secondary">
              <FolderOpen size={15} />
              {(active?.destination ?? initialDestination)?.name ??
                "Elegir carpeta al parar"}
            </p>
            {!active && initialDestination && (
              <label className="block text-sm">
                Nombre del documento
                <input
                  className="mt-1 min-h-11 w-full rounded border border-line px-2"
                  value={startingName}
                  onChange={(e) => setStartingName(e.target.value)}
                />
              </label>
            )}
            {active?.error && (
              <p role="alert" className="text-sm">
                {active.error}
              </p>
            )}
            {active && (
              <button
                className="min-h-11 text-sm text-ink-secondary"
                disabled={!!busy}
                onClick={() =>
                  setConfirm({ session: active, action: "discard" })
                }
              >
                Descartar grabación…
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {!active ? (
                <>
                  <button
                    disabled={
                      !!busy ||
                      (!settings.microphone && !settings.systemAudio) ||
                      snapshot?.captureOwner === "dictation"
                    }
                    className={`${button} border-transparent bg-brand-orange text-white hover:bg-orange-600`}
                    onClick={() =>
                      void command("start", {
                        settings,
                        destination: initialDestination
                          ? { ...initialDestination, name: startingName }
                          : null,
                      })
                    }
                  >
                    <Mic size={16} />
                    Iniciar grabación
                  </button>
                  <button
                    disabled={!!busy}
                    className={button}
                    onClick={() =>
                      void command(
                        snapshot?.preview ? "preview-stop" : "preview",
                        { settings },
                      )
                    }
                  >
                    {snapshot?.preview ? "Terminar prueba" : "Probar niveles"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    disabled={
                      !!busy || (!settings.microphone && !settings.systemAudio)
                    }
                    className={button}
                    onClick={() =>
                      void command(
                        active.status === "recording" ? "pause" : "resume",
                        { id: active.id },
                      )
                    }
                  >
                    {active.status === "recording" ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )}{" "}
                    {active.status === "recording" ? "Pausar" : "Continuar"}
                  </button>
                  <button
                    disabled={!!busy}
                    className={`${button} bg-brand-orange text-white`}
                    onClick={() => void stop()}
                  >
                    <Square size={16} />
                    Parar
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-ink-secondary">
              El audio se guarda en este dispositivo. Al parar y elegir destino
              se enviará a OpenAI para transcribir. Sin identificación de
              hablantes.
            </p>
          </section>
        )}
        <button
          className={button}
          aria-expanded={list}
          onClick={() => setList(!list)}
        >
          {list ? "Ocultar historial" : "Ver grabaciones"} (
          {snapshot?.sessions.filter((s) => s.id !== active?.id).length ?? 0})
        </button>
        {list &&
          snapshot?.sessions
            .filter((s) => s.id !== active?.id)
            .map((s) => (
              <article
                key={s.id}
                className="space-y-3 rounded-lg border border-line p-4"
              >
                <div>
                  <h3 className="font-semibold">
                    {s.destination?.name ?? "Reunión sin destino"}
                  </h3>
                  <p className="text-xs text-ink-secondary">
                    {new Date(s.createdAt).toLocaleString()} ·{" "}
                    {recordingTime(s.samples)} ·{" "}
                    {(s.bytes / 1024 / 1024).toFixed(1)} MiB
                  </p>
                </div>
                <p className="text-sm" role="status">
                  {statusLabels[s.status]}
                  {s.status === "transcribing" &&
                    ` · Fragmento ${Math.min(s.chunks.filter((c) => c.status === "completed").length + 1, s.chunks.length)} de ${s.chunks.length}`}
                </p>
                {s.error && (
                  <p className="text-sm text-orange-800">{s.error}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!s.audioDeleted && (
                    <button className={button} onClick={() => setPlaying(s)}>
                      <Volume2 size={16} />
                      Escuchar
                    </button>
                  )}
                  {s.documentId ? (
                    <button
                      className={button}
                      onClick={() => void openDocument(s.documentId!)}
                    >
                      Abrir documento
                    </button>
                  ) : (
                    <>
                      {!["transcribing", "queued"].includes(s.status) && (
                        <button
                          className={button}
                          onClick={() => setDestination(s)}
                        >
                          Elegir carpeta
                        </button>
                      )}
                      {s.destination &&
                        !s.audioDeleted &&
                        !["transcribing", "queued"].includes(s.status) && (
                          <button
                            disabled={!!busy}
                            className={button}
                            onClick={() =>
                              s.chunks.some((c) => c.status === "unknown")
                                ? setConfirm({ session: s, action: "queue" })
                                : void command("queue", { id: s.id })
                            }
                          >
                            Transcribir / reintentar
                          </button>
                        )}
                      {["transcribing", "queued"].includes(s.status) && (
                        <button
                          className={button}
                          onClick={() =>
                            void command("cancel-job", { id: s.id })
                          }
                        >
                          Detener procesamiento
                        </button>
                      )}
                    </>
                  )}
                  {!s.audioDeleted && (
                    <>
                      <button
                        className={button}
                        aria-pressed={s.keep}
                        onClick={() =>
                          void command("keep", { id: s.id, keep: !s.keep })
                        }
                      >
                        {s.keep ? "Conservada" : "Conservar"}
                      </button>
                      <button
                        disabled={["transcribing", "queued"].includes(s.status)}
                        className={button}
                        aria-label="Eliminar audio"
                        onClick={() =>
                          setConfirm({ session: s, action: "delete-audio" })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
                {s.documentId && (
                  <p className="break-all text-xs">
                    Documento: {s.documentId.split("::").pop()}
                  </p>
                )}
                {s.cost && (
                  <details className="text-xs text-ink-secondary">
                    <summary>
                      Estimación:{" "}
                      {s.cost.estimatedCostEur === null
                        ? `${s.cost.estimatedCostUsd.toFixed(4)} USD · EUR no disponible`
                        : `${s.cost.estimatedCostEur.toFixed(4)} €`}
                    </summary>
                    <p>
                      {s.cost.estimatedCostUsd.toFixed(4)} USD · 1 EUR ={" "}
                      {s.cost.exchangeRate.usdPerEur ?? "—"} USD · Referencia{" "}
                      {s.cost.exchangeRate.date ?? "no disponible"}.{" "}
                      {s.cost.exchangeRate.date &&
                      Date.now() - Date.parse(s.cost.exchangeRate.date) >
                        7 * 86400000
                        ? "Referencia de más de siete días."
                        : ""}{" "}
                      Los reintentos de resultado desconocido pueden añadir
                      consumo.
                    </p>
                  </details>
                )}
                <p className="text-xs text-ink-secondary">
                  {s.audioDeleted
                    ? "Audio eliminado. El documento se conserva."
                    : s.keep ||
                        !s.completedAt ||
                        s.settings.retentionDays === null
                      ? "Sin borrado automático"
                      : `Borrado local a partir del ${new Date((s.completedAt + s.settings.retentionDays * 86400) * 1000).toLocaleString()}`}
                </p>
              </article>
            ))}
      </div>
      {destination && (
        <DestinationDialog
          session={destination}
          onCancel={() => setDestination(null)}
          onSave={async (d) => {
            const next = await command("destination", {
              id: destination.id,
              destination: d,
            });
            if (next) {
              await command("queue", { id: destination.id });
              setDestination(null);
            }
          }}
        />
      )}
      {playing && (
        <AudioPlayer session={playing} onClose={() => setPlaying(null)} />
      )}
      {confirm && (
        <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-black/25 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmar acción"
            className="space-y-4 rounded-lg bg-white p-5"
          >
            <p>
              {confirm.action === "queue"
                ? "El resultado del envío anterior no está confirmado. Reintentar puede repetir el consumo en OpenAI."
                : "Eliminar el audio local es irreversible. El documento Markdown se conservará."}
            </p>
            <div className="flex gap-2">
              <button
                autoFocus
                className={button}
                onClick={() => setConfirm(null)}
              >
                Cancelar
              </button>
              <button
                className={button}
                onClick={async () => {
                  await command(confirm.action, {
                    id: confirm.session.id,
                    confirmUnknown: true,
                    confirmed: true,
                  });
                  setConfirm(null);
                }}
              >
                Confirmar
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
export function AudioInputs({
  settings,
  devices,
  levels,
  disabled,
  recording,
  onChange,
}: {
  settings: RecordingSettings;
  devices: RecordingDevice[];
  levels: [number, number];
  disabled: boolean;
  recording: boolean;
  onChange: (s: RecordingSettings) => void;
}) {
  return (
    <div className="space-y-3">
      {([0, 1] as const)
        .filter((i) => i === 0 || !isTauriMobileRuntime())
        .map((index) => {
          const enabled =
            index === 0 ? settings.microphone : settings.systemAudio;
          const name = index === 0 ? "Micrófono" : "Audio de aplicaciones";
          const field = index === 0 ? "microphoneDevice" : "outputDevice";
          const level = Math.round(levels[index] * 100);
          return (
            <div key={index} className="rounded-md border border-line p-3">
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
                {name}
                <input
                  type="checkbox"
                  role="switch"
                  checked={enabled}
                  disabled={disabled}
                  className="h-5 w-5 accent-brand-orange"
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      [index === 0 ? "microphone" : "systemAudio"]:
                        e.target.checked,
                    })
                  }
                />
              </label>
              <select
                aria-label={`Dispositivo de ${name}`}
                value={settings[field] ?? ""}
                disabled={disabled || recording}
                className="min-h-11 w-full rounded border border-line bg-white px-2 text-sm"
                onChange={(e) =>
                  onChange({ ...settings, [field]: e.target.value || null })
                }
              >
                <option value="">Predeterminado del sistema</option>
                {devices
                  .filter(
                    (d) => d.kind === (index === 0 ? "microphone" : "system"),
                  )
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
              <div
                className="mt-2 flex items-center gap-2"
                role="meter"
                aria-label={`Nivel de ${name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={level}
              >
                <div aria-hidden="true" className="flex flex-1 gap-1">
                  {Array.from({ length: 16 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-3 flex-1 rounded-sm ${enabled && level > i * 6 ? "bg-brand-orange" : "bg-gray-200"}`}
                    />
                  ))}
                </div>
                <span className="min-w-16 text-xs text-ink-secondary">
                  {!enabled
                    ? "Desactivado"
                    : level
                      ? `${level} %`
                      : "Sin señal"}
                </span>
              </div>
            </div>
          );
        })}
    </div>
  );
}
function folders(
  nodes: DocumentTreeNode[],
  prefix = "",
): { id: string; label: string }[] {
  return nodes.flatMap((n) =>
    n.type === "folder"
      ? [
          { id: n.id, label: prefix + n.name },
          ...folders(n.children ?? [], prefix + n.name + " / "),
        ]
      : [],
  );
}
function DestinationDialog({
  session,
  onSave,
  onCancel,
}: {
  session: RecordingSession;
  onSave: (d: RecordingDestination) => Promise<void>;
  onCancel: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [project, setProject] = useState(session.destination?.projectId ?? "");
  const [folder, setFolder] = useState(session.destination?.folderId ?? "");
  const [name, setName] = useState(
    session.destination?.name ??
      `Reunión ${session.createdAt.slice(0, 16).replace(/:/g, "-")}.md`,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    let live = true;
    setTree([]);
    if (project)
      void getProjectTree(project)
        .then((t) => {
          if (live) setTree(t);
        })
        .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, [project]);
  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-black/25 p-4">
      <form
        className="max-h-[calc(100dvh-32px)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg bg-white p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Destino de la transcripción"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onSave({
              projectId: project,
              folderId: folder || null,
              name,
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <h3 className="font-semibold">Guardar transcripción en un proyecto</h3>
        <p className="text-sm">
          La grabación está guardada. Cancelar la deja pendiente.
        </p>
        {error && <p role="alert">{error}</p>}
        <label className="block text-sm">
          Proyecto
          <select
            autoFocus
            required
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setFolder("");
            }}
            className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2"
          >
            <option value="">Selecciona un proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!projects.length && (
          <p className="text-sm">
            El audio se conservará hasta que elijas un destino.
            <button
              type="button"
              className={button}
              onClick={async () => {
                await emit("recording-create-project");
                const main = await WebviewWindow.getByLabel("main");
                await main?.show();
                await main?.setFocus();
                onCancel();
              }}
            >
              Crear proyecto…
            </button>
          </p>
        )}
        <label className="block text-sm">
          Carpeta
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2"
          >
            <option value="">Raíz del proyecto</option>
            {folders(tree).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Nombre
          <input
            required
            maxLength={150}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 min-h-11 w-full rounded border border-line px-2"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={onCancel}>
            Cancelar
          </button>
          <button
            disabled={saving || !project}
            className={`${button} bg-brand-orange text-white`}
          >
            {saving ? "Guardando…" : "Transcribir y guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
function AudioPlayer({
  session,
  onClose,
}: {
  session: RecordingSession;
  onClose: () => void;
}) {
  const owner = useRef(crypto.randomUUID());
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const block = useRef(0);
  useEffect(() => {
    let live = true;
    let objectUrl = "";
    block.current = position;
    setElapsed(0);
    void recordingRequest("lease", { id: session.id, owner: owner.current })
      .then(() => recordingAudio(session.id, position, 24000 * 30))
      .then((data) => {
        if (!live) return;
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: "audio/wav" }),
        );
        setUrl(objectUrl);
      })
      .catch((e) => setError(String(e)));
    const timer = setInterval(
      () =>
        void recordingRequest("lease", {
          id: session.id,
          owner: owner.current,
        }).catch(() => undefined),
      20000,
    );
    return () => {
      live = false;
      clearInterval(timer);
      URL.revokeObjectURL(objectUrl);
    };
  }, [position, session.id]);
  useEffect(
    () => () => {
      void recordingRequest("release", {
        id: session.id,
        owner: owner.current,
      }).catch(() => undefined);
    },
    [session.id],
  );
  useEffect(() => {
    if (playing && url)
      void audio.current?.play().catch((e) => setError(String(e)));
  }, [url, playing]);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-black/25 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Escuchar grabación"
        className="max-h-[calc(100dvh-32px)] w-full space-y-4 overflow-y-auto rounded-lg bg-white p-5"
      >
        <h3 className="font-semibold">Audio local</h3>
        {error && <p role="alert">{error}</p>}
        <audio
          ref={audio}
          src={url}
          onTimeUpdate={(e) =>
            setElapsed(Math.floor(e.currentTarget.currentTime * 24000))
          }
          onEnded={() => {
            const next = block.current + 24000 * 30;
            if (next < session.samples) setPosition(next);
            else setPlaying(false);
          }}
        />
        <p>
          {recordingTime(position + elapsed)} / {recordingTime(session.samples)}
        </p>
        <input
          aria-label="Posición de reproducción"
          type="range"
          className="min-h-11 w-full accent-brand-orange"
          min={0}
          max={session.samples}
          step={24000}
          value={position + elapsed}
          onChange={(e) => setPosition(Number(e.target.value))}
        />
        <div className="flex gap-2">
          <button
            className={button}
            onClick={() => {
              if (playing) audio.current?.pause();
              setPlaying(!playing);
            }}
          >
            {playing ? "Pausar" : "Reproducir"}
          </button>
          <button autoFocus className={button} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </section>
    </div>
  );
}
