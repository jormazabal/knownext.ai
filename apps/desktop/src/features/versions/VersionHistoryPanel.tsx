import { GitCompareArrows, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getDocumentVersions } from "../../lib/api/versions";
import type { VersionRecord } from "../../types/domain";

type VersionHistoryPanelProps = {
  documentId: string;
  onClose: () => void;
};

export function VersionHistoryPanel({ documentId, onClose }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionRecord[]>([]);

  useEffect(() => {
    void getDocumentVersions(documentId).then(setVersions);
  }, [documentId]);

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-line bg-white">
      <div className="flex items-start justify-between px-6 pb-4 pt-6">
        <div>
          <h2 className="text-[16px] font-semibold">Historial de versiones</h2>
          <p className="mt-3 max-w-[250px] text-[12px] leading-5 text-ink-secondary">
            Todas las versiones provienen de commits en el repositorio.
          </p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar historial">
          <X size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        <div className="relative">
          <div className="absolute left-[10px] top-3 h-[calc(100%-28px)] border-l border-line" />
          <div className="space-y-3">
            {versions.map((version) => (
              <VersionItem key={version.id} version={version} />
            ))}
          </div>
        </div>
      </div>

      <div className="m-5 rounded-md border border-line bg-white p-4 text-[12px] text-ink-secondary">
        <div className="mb-3">Selecciona una versión para ver los cambios</div>
        <button className="flex items-center gap-2 hover:text-brand-orange">
          <GitCompareArrows size={15} />
          Comparar con la versión actual
        </button>
      </div>
    </aside>
  );
}

function VersionItem({ version }: { version: VersionRecord }) {
  return (
    <button
      className={[
        "relative block w-full rounded-md py-4 pl-9 pr-4 text-left",
        version.current ? "bg-brand-hover" : "hover:bg-panel",
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-[4px] top-5 z-10 h-3 w-3 rounded-full border bg-white",
          version.current ? "border-brand-orange" : "border-ink-secondary",
        ].join(" ")}
      />
      <div className="flex items-center gap-3">
        <span className="font-mono text-[12px] font-semibold">{version.hash}</span>
        {version.current ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-primary">Actual</span>
        ) : null}
      </div>
      <div className="mt-3 text-[12px] leading-4">{version.title}</div>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-secondary">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-orange text-[9px] font-semibold text-white">
          {version.authorInitials}
        </span>
        <span>{version.author}</span>
        <span className="ml-auto">{version.relativeTime}</span>
      </div>
    </button>
  );
}
