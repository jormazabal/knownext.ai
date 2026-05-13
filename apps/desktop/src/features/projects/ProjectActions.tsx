import {
  BarChart3,
  ChevronRight,
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
import type { AiUsageSummaryResponse, AppearanceConfig, AuthStatus } from "../../types/domain";

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
  aiUsageSummary?: AiUsageSummaryResponse | null;
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
  aiUsageSummary = null,
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
          onClick={() => {
            setAccountMenuOpen((isOpen) => !isOpen);
          }}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-hover text-[11px] font-semibold text-brand-orange">
            {accountInitials}
          </span>
          <span className="truncate text-[11px] font-medium">{accountName}</span>
        </button>
        <div className={["absolute bottom-[38px] left-1/2 z-[80] w-[252px] -translate-x-1/2 transition", accountMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"].join(" ")}>
          <div className="rounded-md border border-line bg-white p-1 shadow-menu">
            <div className="px-2 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-hover text-[11px] font-semibold text-brand-orange">
                    {accountInitials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-ink-primary">{accountName}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-secondary">
                      {authStatus.isAuthenticated ? text.githubConnectedStatus : text.githubBlockedStatus}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
                  v{appVersion}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {authStatus.isAuthenticated ? (
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-line px-2 text-[10px] font-semibold text-ink-secondary hover:bg-red-50 hover:text-red-700"
                    onClick={() => runAccountAction(onLogout)}
                  >
                    <LogOut size={13} />
                    <span>{text.logout}</span>
                  </button>
                ) : (
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded bg-brand-orange px-2 text-[10px] font-semibold text-white hover:bg-brand-dark"
                    onClick={() => runAccountAction(onLoginGithub)}
                  >
                    <UserPlus size={13} />
                    <span>{text.connectGithub}</span>
                  </button>
                )}
              </div>
            </div>
            <div className="my-1 border-t border-line" />
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={() => runAccountAction(onOpenAppSettings)}
            >
              <Settings size={14} />
              <span>{text.appSettings}</span>
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
            <div className="group relative">
              <button
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
                aria-haspopup="dialog"
              >
                <BarChart3 size={14} />
                <span className="min-w-0 flex-1 truncate">{text.aiUsage}</span>
                <ChevronRight size={13} className="text-ink-secondary" />
              </button>
              <AiUsagePanel text={text} language={language} summary={aiUsageSummary} />
            </div>
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
              onClick={() => runAccountAction(onOpenReleaseNotes)}
            >
              <ScrollText size={14} />
              <span>{text.releaseNotes}</span>
            </button>
            <div className="my-1 border-t border-line" />
            <button
              className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCheckingForUpdates}
              onClick={() => runAccountAction(onCheckForUpdates)}
            >
              <RefreshCw size={14} className={isCheckingForUpdates ? "animate-spin" : ""} />
              <span>{isCheckingForUpdates ? text.checkingUpdates : text.checkUpdates}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiUsagePanel({ text, language, summary }: { text: ProjectActionsCopy; language: AppearanceConfig["language"]; summary: AiUsageSummaryResponse | null }) {
  const primaryUsage = summary?.models[0] ?? null;
  const additionalModels = summary?.models.slice(1) ?? [];
  const showMonthlyTotal = Boolean(summary && summary.models.length > 1);
  const monthLabel = formatUsageMonth(summary?.month, language);

  return (
    <div
      className={[
        "fixed bottom-[72px] left-[264px] z-[120] w-[292px] rounded-md border border-line bg-white p-3 shadow-menu transition",
        "pointer-events-none -translate-x-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100",
      ].join(" ")}
    >
      <div className="rounded bg-panel p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-ink-primary">{text.aiUsageTitle}</p>
            <p className="mt-0.5 text-[10px] text-ink-secondary">{monthLabel}</p>
          </div>
          {primaryUsage ? (
            <span className="shrink-0 rounded bg-white px-2 py-1 font-mono text-[9px] font-semibold text-brand-orange shadow-sm">
              {primaryUsage.model}
            </span>
          ) : null}
        </div>

        {primaryUsage ? (
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase text-ink-secondary">{text.aiUsageCost}</p>
              <p className="mt-1 font-mono text-[24px] font-semibold leading-none text-ink-primary">{formatCurrency(primaryUsage.estimatedCost, language)}</p>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-full border border-brand-orange/20 bg-white text-brand-orange">
              <BarChart3 size={19} />
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded border border-dashed border-line bg-white px-3 py-4">
            <p className="text-[11px] font-semibold text-ink-primary">{text.aiUsageEmptyTitle}</p>
            <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{text.aiUsageEmptyDetail}</p>
          </div>
        )}
      </div>

      {primaryUsage ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <AiUsageMetric label={text.aiUsageInteractions} value={formatInteger(primaryUsage.interactions, language)} />
          <AiUsageMetric label={text.aiUsageTokens} value={formatInteger(primaryUsage.totalTokens, language)} />
        </div>
      ) : null}

      {showMonthlyTotal ? (
        <div className="mt-3 rounded border border-line bg-white p-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold text-ink-secondary">{text.aiUsageTotalCost}</span>
            <span className="font-mono text-[12px] font-semibold text-brand-orange">{formatCurrency(summary?.totalEstimatedCost ?? 0, language)}</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {additionalModels.map((modelUsage) => (
              <div key={modelUsage.model} className="flex items-center justify-between gap-2 rounded bg-panel px-2 py-1.5">
                <span className="truncate font-mono text-[9px] font-semibold text-ink-primary">{modelUsage.model}</span>
                <span className="font-mono text-[9px] text-ink-secondary">{formatCurrency(modelUsage.estimatedCost, language)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AiUsageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-white px-2.5 py-2">
      <p className="text-[9px] font-semibold text-ink-secondary">{label}</p>
      <p className="mt-1 font-mono text-[13px] font-semibold text-ink-primary">{value}</p>
    </div>
  );
}

type ProjectActionsCopy = typeof projectActionsCopy.es;

const projectActionsCopy = {
  es: {
    noGithubAccount: "Sin cuenta GitHub",
    githubConnectedStatus: "Cuenta GitHub conectada",
    githubBlockedStatus: "Historial bloqueado sin GitHub",
    connectGithub: "Conectar GitHub",
    appSettings: "Configuración de la app",
    logout: "Cerrar sesión",
    checkingUpdates: "Buscando actualizaciones",
    checkUpdates: "Buscar actualizaciones",
    aiUsage: "Uso IA",
    aiUsageTitle: "Uso IA estimado",
    aiUsageModel: "Modelo",
    aiUsageTokens: "Tokens",
    aiUsageCost: "Coste",
    aiUsageInteractions: "Interacciones",
    aiUsageInteractionsShort: "Int.",
    aiUsageTotalCost: "Total mes",
    aiUsageEmptyTitle: "Sin uso registrado",
    aiUsageEmptyDetail: "Las estadísticas aparecerán cuando se complete una interacción real con IA.",
    releaseNotes: "Notas de release",
    recoverableDrafts: "Borradores recuperables",
  },
  en: {
    noGithubAccount: "No GitHub account",
    githubConnectedStatus: "GitHub account connected",
    githubBlockedStatus: "History locked without GitHub",
    connectGithub: "Connect GitHub",
    appSettings: "App settings",
    logout: "Sign out",
    checkingUpdates: "Checking for updates",
    checkUpdates: "Check for updates",
    aiUsage: "AI usage",
    aiUsageTitle: "Estimated AI usage",
    aiUsageModel: "Model",
    aiUsageTokens: "Tokens",
    aiUsageCost: "Cost",
    aiUsageInteractions: "Interactions",
    aiUsageInteractionsShort: "Int.",
    aiUsageTotalCost: "Month total",
    aiUsageEmptyTitle: "No usage recorded",
    aiUsageEmptyDetail: "Statistics will appear after a real AI interaction completes.",
    releaseNotes: "Release notes",
    recoverableDrafts: "Recoverable drafts",
  },
};

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "G").concat(parts[1]?.[0] ?? "H").toUpperCase();
}

function formatInteger(value: number, language: AppearanceConfig["language"]) {
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number, language: AppearanceConfig["language"]) {
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value);
}

function formatUsageMonth(month: string | undefined, language: AppearanceConfig["language"]) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return language === "es" ? "Mes actual" : "Current month";
  }
  const [year, monthIndex] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex - 1, 1));
}
