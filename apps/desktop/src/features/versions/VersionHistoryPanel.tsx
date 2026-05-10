import { Download, GitCommitHorizontal, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getDocumentVersions } from "../../lib/api/versions";
import type { CreateVersionResponse, SyncMode, VersionRecord } from "../../types/domain";

type VersionHistoryPanelProps = {
  documentId: string;
  syncMode: SyncMode;
  isSyncing: boolean;
  onPullProject: () => void;
  onPushProject: () => void;
  onCreateVersion: (title: string) => Promise<CreateVersionResponse | null>;
  onClose: () => void;
};

export function VersionHistoryPanel({
  documentId,
  syncMode,
  isSyncing,
  onPullProject,
  onPushProject,
  onCreateVersion,
  onClose,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    void loadVersions();
  }, [documentId]);

  async function loadVersions() {
    try {
      setMessage(null);
      setVersions(await getDocumentVersions(documentId));
    } catch {
      setVersions([]);
      setMessage("No se pudo cargar el historial versionado.");
    }
  }

  async function handleCreateVersion() {
    setIsCreating(true);
    try {
      const response = await onCreateVersion("Actualiza documento");
      if (!response) {
        setMessage("Guarda o resuelve los cambios pendientes antes de crear una versión.");
        return;
      }
      setVersions((currentVersions) => [
        { ...response.version, current: true },
        ...currentVersions.map((version) => ({ ...version, current: false })),
      ]);
      setMessage("Versión creada correctamente.");
    } catch {
      setMessage("No hay cambios nuevos o el proveedor de versionado no está disponible.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-line bg-white">
      <div className="flex items-start justify-between px-4 pb-3 pt-4">
        <div>
          <h2 className="text-[16px] font-semibold">Historial de versiones</h2>
          <p className="mt-2 max-w-[250px] text-[11px] leading-5 text-ink-secondary">
            Las versiones se crean desde el proveedor configurado para este proyecto.
          </p>
        </div>
        <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar historial">
          <X size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {message ? (
          <div className="mb-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] text-ink-secondary">
            {message}
          </div>
        ) : null}
        <div className="relative">
          <div className="absolute left-[10px] top-3 h-[calc(100%-28px)] border-l border-line" />
          <div className="space-y-2">
            {versions.map((version) => (
              <VersionItem key={version.id} version={version} />
            ))}
          </div>
        </div>
      </div>

      <div className="m-4 rounded-md border border-line bg-white p-3 text-[11px] text-ink-secondary">
        <div className="mb-2">Crea una versión explícita cuando el documento esté listo</div>
        <button className="mb-2 flex items-center gap-2 hover:text-brand-orange disabled:opacity-50" disabled={isCreating} onClick={handleCreateVersion}>
          <GitCommitHorizontal size={15} />
          {isCreating ? "Creando versión" : "Crear versión"}
        </button>
        {syncMode === "manual-github" ? (
          <div className="mb-2 flex gap-3">
            <button className="flex items-center gap-2 hover:text-brand-orange disabled:opacity-50" disabled={isSyncing} onClick={onPullProject}>
              <Download size={15} />
              Traer cambios
            </button>
            <button className="flex items-center gap-2 hover:text-brand-orange disabled:opacity-50" disabled={isSyncing} onClick={onPushProject}>
              <Upload size={15} />
              Subir cambios
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function VersionItem({ version }: { version: VersionRecord }) {
  return (
    <button
      className={[
        "relative block w-full rounded-md py-3 pl-8 pr-3 text-left",
        version.current ? "bg-brand-hover" : "hover:bg-panel",
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-[4px] top-4 z-10 h-3 w-3 rounded-full border bg-white",
          version.current ? "border-brand-orange" : "border-ink-secondary",
        ].join(" ")}
      />
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] font-semibold">{version.hash}</span>
        {version.current ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-primary">Actual</span>
        ) : null}
      </div>
      <div className="mt-2 text-[11px] leading-4">{version.title}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-secondary">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-orange text-[9px] font-semibold text-white">
          {version.authorInitials}
        </span>
        <span>{version.author}</span>
        <span className="ml-auto">{version.relativeTime}</span>
      </div>
    </button>
  );
}
