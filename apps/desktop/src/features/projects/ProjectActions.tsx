import {
  ChevronDown,
  ChevronUp,
  FileClock,
  FilePlus2,
  FolderPlus,
  LogOut,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  UserPlus,
} from "lucide-react";
import type { AuthStatus } from "../../types/domain";

const actions = [
  { id: "search", label: "Buscar", icon: Search },
  { id: "folder", label: "Crear carpeta", icon: FolderPlus },
  { id: "document", label: "Crear documento", icon: FilePlus2 },
  { id: "expand", label: "Expandir árbol", icon: ChevronDown },
  { id: "collapse", label: "Contraer árbol", icon: ChevronUp },
  { id: "settings", label: "Configurar proyecto", icon: Settings },
];

type ProjectActionsProps = {
  appVersion: string;
  authStatus: AuthStatus;
  hasActiveProject: boolean;
  orphanDraftCount: number;
  isCheckingForUpdates: boolean;
  onLoginGithub: () => void;
  onLogout: () => void;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onConfigureProject: () => void;
  onOpenAppSettings: () => void;
  onOpenRecoverableDrafts: () => void;
  onCheckForUpdates: () => void;
  onOpenReleaseNotes: () => void;
};

export function ProjectActions({
  appVersion,
  authStatus,
  hasActiveProject,
  orphanDraftCount,
  isCheckingForUpdates,
  onLoginGithub,
  onLogout,
  onCreateFolder,
  onCreateDocument,
  onExpandTree,
  onCollapseTree,
  onConfigureProject,
  onOpenAppSettings,
  onOpenRecoverableDrafts,
  onCheckForUpdates,
  onOpenReleaseNotes,
}: ProjectActionsProps) {
  function handleAction(actionId: string) {
    if (actionId === "folder") onCreateFolder();
    if (actionId === "document") onCreateDocument();
    if (actionId === "expand") onExpandTree();
    if (actionId === "collapse") onCollapseTree();
    if (actionId === "settings") onConfigureProject();
  }

  const accountName = authStatus.user?.name || authStatus.user?.login || "Sin cuenta GitHub";
  const accountInitials = getInitials(accountName);

  return (
    <div className="mt-auto border-t border-line">
      <div className="flex h-9 items-center justify-between px-3">
        {actions.map((action) => (
          <button
            key={action.label}
            className="grid h-6 w-6 place-items-center rounded-md hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            data-tooltip={action.label}
            aria-label={action.label}
            disabled={!hasActiveProject && action.id !== "search"}
            onClick={() => handleAction(action.id)}
          >
            <action.icon size={15} />
          </button>
        ))}
      </div>
      <div className="group relative border-t border-line px-3 py-1">
        <button className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left hover:bg-brand-hover">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-hover text-[11px] font-semibold text-brand-orange">
            {accountInitials}
          </span>
          <span className="truncate text-[11px] font-medium">{accountName}</span>
        </button>
        <div className="pointer-events-none absolute bottom-[38px] left-0 z-40 w-[228px] opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="rounded-md border border-line bg-white p-1 shadow-menu">
            <div className="px-2 py-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-ink-primary">{accountName}</p>
                  <p className="text-[10px] text-ink-secondary">
                    {authStatus.isAuthenticated ? "Cuenta GitHub conectada" : "Historial bloqueado sin GitHub"}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
                  v{appVersion}
                </span>
              </div>
            </div>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onLoginGithub}
              disabled={authStatus.isAuthenticated}
            >
              <UserPlus size={14} />
              <span>{authStatus.isAuthenticated ? "GitHub conectado" : "Conectar GitHub"}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={onOpenAppSettings}
            >
              <Settings size={14} />
              <span>Configuración de la app</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onLogout}
              disabled={!authStatus.isAuthenticated}
            >
              <LogOut size={14} />
              <span>Cerrar sesión</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCheckingForUpdates}
              onClick={onCheckForUpdates}
            >
              <RefreshCw size={14} className={isCheckingForUpdates ? "animate-spin" : ""} />
              <span>{isCheckingForUpdates ? "Buscando actualizaciones" : "Buscar actualizaciones"}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={onOpenReleaseNotes}
            >
              <ScrollText size={14} />
              <span>Notas de release</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={onOpenRecoverableDrafts}
            >
              <FileClock size={14} />
              <span className="min-w-0 flex-1 truncate">Borradores recuperables</span>
              {orphanDraftCount > 0 ? (
                <span className="rounded bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {orphanDraftCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "G").concat(parts[1]?.[0] ?? "H").toUpperCase();
}
