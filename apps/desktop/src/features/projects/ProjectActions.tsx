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
import { useEffect, useRef, useState } from "react";
import type { AppearanceConfig, AuthStatus } from "../../types/domain";

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
  language?: AppearanceConfig["language"];
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
  language = "es",
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
  const text = projectActionsCopy[language];
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  function handleAction(actionId: string) {
    if (actionId === "folder") onCreateFolder();
    if (actionId === "document") onCreateDocument();
    if (actionId === "expand") onExpandTree();
    if (actionId === "collapse") onCollapseTree();
    if (actionId === "settings") onConfigureProject();
  }

  const accountName = authStatus.user?.name || authStatus.user?.login || text.noGithubAccount;
  const accountInitials = getInitials(accountName);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeAccountMenu(event: MouseEvent) {
      if (accountMenuRef.current?.contains(event.target as Node)) return;
      setAccountMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    window.addEventListener("mousedown", closeAccountMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeAccountMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  function runAccountAction(action: () => void) {
    setAccountMenuOpen(false);
    action();
  }

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
      <div ref={accountMenuRef} className="relative border-t border-line px-3 py-1">
        <button
          className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left hover:bg-brand-hover"
          aria-expanded={accountMenuOpen}
          onClick={() => setAccountMenuOpen((isOpen) => !isOpen)}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-hover text-[11px] font-semibold text-brand-orange">
            {accountInitials}
          </span>
          <span className="truncate text-[11px] font-medium">{accountName}</span>
        </button>
        <div className={["absolute bottom-[38px] left-0 z-40 w-[228px] transition", accountMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"].join(" ")}>
          <div className="rounded-md border border-line bg-white p-1 shadow-menu">
            <div className="px-2 py-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-ink-primary">{accountName}</p>
                  <p className="text-[10px] text-ink-secondary">
                    {authStatus.isAuthenticated ? text.githubConnectedStatus : text.githubBlockedStatus}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
                  v{appVersion}
                </span>
              </div>
            </div>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runAccountAction(onLoginGithub)}
              disabled={authStatus.isAuthenticated}
            >
              <UserPlus size={14} />
              <span>{authStatus.isAuthenticated ? text.githubConnected : text.connectGithub}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={() => runAccountAction(onOpenAppSettings)}
            >
              <Settings size={14} />
              <span>{text.appSettings}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => runAccountAction(onLogout)}
              disabled={!authStatus.isAuthenticated}
            >
              <LogOut size={14} />
              <span>{text.logout}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCheckingForUpdates}
              onClick={() => runAccountAction(onCheckForUpdates)}
            >
              <RefreshCw size={14} className={isCheckingForUpdates ? "animate-spin" : ""} />
              <span>{isCheckingForUpdates ? text.checkingUpdates : text.checkUpdates}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={() => runAccountAction(onOpenReleaseNotes)}
            >
              <ScrollText size={14} />
              <span>{text.releaseNotes}</span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={() => runAccountAction(onOpenRecoverableDrafts)}
            >
              <FileClock size={14} />
              <span className="min-w-0 flex-1 truncate">{text.recoverableDrafts}</span>
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

const projectActionsCopy = {
  es: {
    noGithubAccount: "Sin cuenta GitHub",
    githubConnectedStatus: "Cuenta GitHub conectada",
    githubBlockedStatus: "Historial bloqueado sin GitHub",
    githubConnected: "GitHub conectado",
    connectGithub: "Conectar GitHub",
    appSettings: "Configuración de la app",
    logout: "Cerrar sesión",
    checkingUpdates: "Buscando actualizaciones",
    checkUpdates: "Buscar actualizaciones",
    releaseNotes: "Notas de release",
    recoverableDrafts: "Borradores recuperables",
  },
  en: {
    noGithubAccount: "No GitHub account",
    githubConnectedStatus: "GitHub account connected",
    githubBlockedStatus: "History locked without GitHub",
    githubConnected: "GitHub connected",
    connectGithub: "Connect GitHub",
    appSettings: "App settings",
    logout: "Sign out",
    checkingUpdates: "Checking for updates",
    checkUpdates: "Check for updates",
    releaseNotes: "Release notes",
    recoverableDrafts: "Recoverable drafts",
  },
};

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "G").concat(parts[1]?.[0] ?? "H").toUpperCase();
}
