import {
  BarChart3,
  ChevronRight,
  FileText,
  FileClock,
  ImageIcon,
  LogOut,
  Mic,
  Sparkles,
  RefreshCw,
  ScrollText,
  Settings,
  Telescope,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AiUsageCapabilitySummary, AiUsageModelSummary, AiUsageSummaryResponse, AppearanceConfig, AuthStatus } from "../../types/domain";

type ProjectActionsProps = {
  appVersion: string;
  language?: AppearanceConfig["language"];
  compact?: boolean;
  authStatus: AuthStatus;
  aiUsageSummary?: AiUsageSummaryResponse | null;
  orphanDraftCount: number;
  isCheckingForUpdates: boolean;
  onLoginGithub: () => void;
  onLogout: () => void;
  onOpenAppSettings: () => void;
  onOpenRecoverableDrafts: () => void;
  onCheckForUpdates: () => void;
  onOpenReleaseNotes: () => void;
};

export function ProjectActions({
  appVersion,
  language = "es",
  compact = false,
  authStatus,
  aiUsageSummary = null,
  orphanDraftCount,
  isCheckingForUpdates,
  onLoginGithub,
  onLogout,
  onOpenAppSettings,
  onOpenRecoverableDrafts,
  onCheckForUpdates,
  onOpenReleaseNotes,
}: ProjectActionsProps) {
  const text = projectActionsCopy[language];
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

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

  if (compact) {
    return (
      <div ref={accountMenuRef} className="relative z-[140]">
        <button
          className="grid h-8 w-8 place-items-center rounded-full bg-brand-hover text-[11px] font-semibold text-brand-orange hover:bg-brand-orange hover:text-white"
          data-tooltip={accountName}
          data-tooltip-placement="right"
          aria-label={accountName}
          aria-expanded={accountMenuOpen}
          onClick={() => {
            setAccountMenuOpen((isOpen) => !isOpen);
          }}
        >
          {accountInitials}
        </button>
        <AccountActionsMenu
          appVersion={appVersion}
          language={language}
          text={text}
          authStatus={authStatus}
          aiUsageSummary={aiUsageSummary}
          accountName={accountName}
          accountInitials={accountInitials}
          orphanDraftCount={orphanDraftCount}
          isCheckingForUpdates={isCheckingForUpdates}
          accountMenuOpen={accountMenuOpen}
          placement="right"
          onRunAction={runAccountAction}
          onCloseAccountMenu={() => setAccountMenuOpen(false)}
          onLoginGithub={onLoginGithub}
          onLogout={onLogout}
          onOpenAppSettings={onOpenAppSettings}
          onOpenRecoverableDrafts={onOpenRecoverableDrafts}
          onCheckForUpdates={onCheckForUpdates}
          onOpenReleaseNotes={onOpenReleaseNotes}
        />
      </div>
    );
  }

  return (
    <div className="relative z-[140] mt-auto border-t border-line">
      <div ref={accountMenuRef} className="relative px-3 py-1">
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
        <AccountActionsMenu
          appVersion={appVersion}
          language={language}
          text={text}
          authStatus={authStatus}
          aiUsageSummary={aiUsageSummary}
          accountName={accountName}
          accountInitials={accountInitials}
          orphanDraftCount={orphanDraftCount}
          isCheckingForUpdates={isCheckingForUpdates}
          accountMenuOpen={accountMenuOpen}
          placement="center"
          onRunAction={runAccountAction}
          onCloseAccountMenu={() => setAccountMenuOpen(false)}
          onLoginGithub={onLoginGithub}
          onLogout={onLogout}
          onOpenAppSettings={onOpenAppSettings}
          onOpenRecoverableDrafts={onOpenRecoverableDrafts}
          onCheckForUpdates={onCheckForUpdates}
          onOpenReleaseNotes={onOpenReleaseNotes}
        />
      </div>
    </div>
  );
}

function AccountActionsMenu({
  appVersion,
  language,
  text,
  authStatus,
  aiUsageSummary,
  accountName,
  accountInitials,
  orphanDraftCount,
  isCheckingForUpdates,
  accountMenuOpen,
  placement,
  onRunAction,
  onCloseAccountMenu,
  onLoginGithub,
  onLogout,
  onOpenAppSettings,
  onOpenRecoverableDrafts,
  onCheckForUpdates,
  onOpenReleaseNotes,
}: {
  appVersion: string;
  language: AppearanceConfig["language"];
  text: ProjectActionsCopy;
  authStatus: AuthStatus;
  aiUsageSummary: AiUsageSummaryResponse | null;
  accountName: string;
  accountInitials: string;
  orphanDraftCount: number;
  isCheckingForUpdates: boolean;
  accountMenuOpen: boolean;
  placement: "center" | "right";
  onRunAction: (action: () => void) => void;
  onCloseAccountMenu: () => void;
  onLoginGithub: () => void;
  onLogout: () => void;
  onOpenAppSettings: () => void;
  onOpenRecoverableDrafts: () => void;
  onCheckForUpdates: () => void;
  onOpenReleaseNotes: () => void;
}) {
  const [usagePanelOpen, setUsagePanelOpen] = useState(false);
  const [usagePanelPinned, setUsagePanelPinned] = useState(false);
  const usageOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usagePanelVisible = usagePanelOpen || usagePanelPinned;

  useEffect(() => {
    return () => {
      if (usageOpenTimerRef.current) window.clearTimeout(usageOpenTimerRef.current);
      if (usageCloseTimerRef.current) window.clearTimeout(usageCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (accountMenuOpen) return;
    setUsagePanelOpen(false);
    setUsagePanelPinned(false);
    cancelUsageTimers();
  }, [accountMenuOpen]);

  function cancelUsageTimers() {
    if (usageOpenTimerRef.current) {
      window.clearTimeout(usageOpenTimerRef.current);
      usageOpenTimerRef.current = null;
    }
    if (usageCloseTimerRef.current) {
      window.clearTimeout(usageCloseTimerRef.current);
      usageCloseTimerRef.current = null;
    }
  }

  function scheduleUsageOpen() {
    if (usagePanelVisible) return;
    cancelUsageTimers();
    usageOpenTimerRef.current = window.setTimeout(() => {
      setUsagePanelOpen(true);
      usageOpenTimerRef.current = null;
    }, 180);
  }

  function scheduleUsageClose() {
    if (usagePanelPinned) return;
    if (usageOpenTimerRef.current) {
      window.clearTimeout(usageOpenTimerRef.current);
      usageOpenTimerRef.current = null;
    }
    if (!usagePanelOpen) return;
    usageCloseTimerRef.current = window.setTimeout(() => {
      setUsagePanelOpen(false);
      usageCloseTimerRef.current = null;
    }, 140);
  }

  function pinUsagePanel() {
    cancelUsageTimers();
    setUsagePanelOpen(true);
    setUsagePanelPinned(true);
  }

  function closeUsagePanelAndMenu() {
    cancelUsageTimers();
    setUsagePanelOpen(false);
    setUsagePanelPinned(false);
    onCloseAccountMenu();
  }

  return (
    <div
      className={[
        "absolute bottom-[38px] z-[140] w-[252px] transition",
        placement === "right" ? "left-10" : "left-1/2 -translate-x-1/2",
        accountMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
    >
      <div className="relative" onMouseEnter={cancelUsageTimers} onMouseLeave={scheduleUsageClose}>
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
                onClick={() => onRunAction(onLogout)}
              >
                <LogOut size={13} />
                <span>{text.logout}</span>
              </button>
            ) : (
              <button
                className="inline-flex h-7 items-center gap-1.5 rounded bg-brand-orange px-2 text-[10px] font-semibold text-white hover:bg-brand-dark"
                onClick={() => onRunAction(onLoginGithub)}
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
          onClick={() => onRunAction(onOpenAppSettings)}
        >
          <Settings size={14} />
          <span>{text.appSettings}</span>
        </button>
        <button
          className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
          onClick={() => onRunAction(onOpenRecoverableDrafts)}
        >
          <FileClock size={14} />
          <span className="min-w-0 flex-1 truncate">{text.recoverableDrafts}</span>
          {orphanDraftCount > 0 ? (
            <span className="rounded bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {orphanDraftCount}
            </span>
          ) : null}
        </button>
        <div className="relative" onMouseEnter={scheduleUsageOpen} onMouseLeave={scheduleUsageClose}>
          <button
            className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover ${usagePanelVisible ? "bg-brand-hover" : ""}`}
            aria-haspopup="dialog"
            onFocus={scheduleUsageOpen}
          >
            <BarChart3 size={14} />
            <span className="min-w-0 flex-1 truncate">{text.aiUsage}</span>
            <ChevronRight size={13} className="text-ink-secondary" />
          </button>
        </div>
        <button
          className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
          onClick={() => onRunAction(onOpenReleaseNotes)}
        >
          <ScrollText size={14} />
          <span>{text.releaseNotes}</span>
        </button>
        <div className="my-1 border-t border-line" />
        <button
          className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isCheckingForUpdates}
          onClick={() => onRunAction(onCheckForUpdates)}
        >
          <RefreshCw size={14} className={isCheckingForUpdates ? "animate-spin" : ""} />
          <span>{isCheckingForUpdates ? text.checkingUpdates : text.checkUpdates}</span>
        </button>
      </div>
      {usagePanelVisible ? (
        <AiUsagePanel
          text={text}
          language={language}
          summary={aiUsageSummary}
          onClose={closeUsagePanelAndMenu}
          onPin={pinUsagePanel}
          onHoverEnter={cancelUsageTimers}
          onHoverLeave={scheduleUsageClose}
        />
      ) : null}
      </div>
    </div>
  );
}

function AiUsagePanel({
  text,
  language,
  summary,
  onClose,
  onPin,
  onHoverEnter,
  onHoverLeave,
}: {
  text: ProjectActionsCopy;
  language: AppearanceConfig["language"];
  summary: AiUsageSummaryResponse | null;
  onClose: () => void;
  onPin: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const [view, setView] = useState<"capability" | "model">("capability");
  const monthLabel = formatUsageMonth(summary?.month, language);
  const capabilityRows = getCapabilityUsageRows(summary);
  const modelRows = summary?.models ?? [];
  const activeRows = view === "capability" ? capabilityRows : modelRows;
  const totals = getUsageTotals(summary);
  const hasUsage = totals.interactions > 0 || totals.totalTokens > 0 || totals.estimatedCost > 0;

  return (
    <div
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onMouseDown={(event) => {
        event.stopPropagation();
        onPin();
      }}
      className={[
        "absolute bottom-0 left-[calc(100%-1px)] z-[150] w-[360px] rounded-md border border-line bg-white p-3 shadow-menu",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded border border-brand-orange/20 bg-brand-hover text-brand-orange">
          <BarChart3 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-ink-primary">{text.aiUsageTitle}</p>
          <p className="mt-0.5 text-[10px] font-medium text-ink-secondary">{monthLabel}</p>
        </div>
        <button
          type="button"
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-secondary hover:bg-panel hover:text-ink-primary"
          aria-label={text.aiUsageClose}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 rounded border border-line bg-panel p-0.5">
        <button
          type="button"
          className={`h-7 rounded text-[10px] font-semibold transition ${view === "capability" ? "bg-white text-brand-orange shadow-sm" : "text-ink-secondary hover:text-ink-primary"}`}
          onClick={() => setView("capability")}
        >
          {text.aiUsageByCapability}
        </button>
        <button
          type="button"
          className={`h-7 rounded text-[10px] font-semibold transition ${view === "model" ? "bg-white text-brand-orange shadow-sm" : "text-ink-secondary hover:text-ink-primary"}`}
          onClick={() => setView("model")}
        >
          {text.aiUsageByModel}
        </button>
      </div>

      {hasUsage ? (
        <div className="mt-3 space-y-1.5">
          {activeRows.length > 0 ? (
            activeRows.map((row) => (
              <AiUsageRow
                key={"capability" in row ? row.capability : row.model}
                label={"capability" in row ? getCapabilityLabel(row, text) : row.model}
                icon={"capability" in row ? getCapabilityIcon(row.capability) : null}
                interactions={row.interactions}
                tokens={row.totalTokens}
                cost={row.estimatedCost}
                language={language}
                text={text}
              />
            ))
          ) : (
            <div className="rounded border border-dashed border-line bg-panel px-3 py-3">
              <p className="text-[11px] font-semibold text-ink-primary">{text.aiUsageNoModelsTitle}</p>
              <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{text.aiUsageNoModelsDetail}</p>
            </div>
          )}
          <AiUsageRow
            label={text.aiUsageTotal}
            icon={<BarChart3 size={13} />}
            interactions={totals.interactions}
            tokens={totals.totalTokens}
            cost={totals.estimatedCost}
            language={language}
            text={text}
            total
          />
        </div>
      ) : (
        <div className="mt-3 rounded border border-dashed border-line bg-panel px-3 py-4">
          <p className="text-[11px] font-semibold text-ink-primary">{text.aiUsageEmptyTitle}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{text.aiUsageEmptyDetail}</p>
        </div>
      )}
    </div>
  );
}

function AiUsageRow({
  label,
  icon,
  interactions,
  tokens,
  cost,
  language,
  text,
  total = false,
}: {
  label: string;
  icon?: React.ReactNode;
  interactions: number;
  tokens: number;
  cost: number;
  language: AppearanceConfig["language"];
  text: ProjectActionsCopy;
  total?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1.55fr)_52px_68px_72px] items-center gap-2 rounded border px-2.5 py-2 ${total ? "border-brand-orange/30 bg-brand-hover" : "border-line bg-white"}`}>
      <div className={`flex min-w-0 items-center gap-2 ${total ? "text-brand-orange" : "text-ink-primary"}`}>
        {icon ? <span className={`grid h-4 w-4 shrink-0 place-items-center ${total ? "text-brand-orange" : "text-ink-secondary"}`}>{icon}</span> : null}
        <p className="truncate text-[11px] font-semibold">{label}</p>
      </div>
      <AiUsageCell label={text.aiUsageInteractionsShort} value={formatInteger(interactions, language)} alignRight />
      <AiUsageCell label={text.aiUsageTokens} value={formatCompactInteger(tokens, language)} alignRight />
      <AiUsageCell label={text.aiUsageCost} value={formatCurrency(cost, language)} alignRight />
    </div>
  );
}

function AiUsageCell({ label, value, alignRight = false }: { label: string; value: string; alignRight?: boolean }) {
  return (
    <div className={alignRight ? "text-right" : ""}>
      <p className="text-[8px] font-semibold uppercase leading-none text-ink-secondary">{label}</p>
      <p className="mt-1 truncate font-mono text-[10px] font-semibold leading-none text-ink-primary">{value}</p>
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
    aiUsageTitle: "Uso IA",
    aiUsageByCapability: "Por capacidad",
    aiUsageByModel: "Por modelo",
    aiUsageClose: "Cerrar uso IA",
    aiUsageModel: "Modelo",
    aiUsageTokens: "Tokens",
    aiUsageCost: "Coste",
    aiUsageInteractions: "Interacciones",
    aiUsageInteractionsShort: "Int.",
    aiUsageTotal: "Total",
    aiUsageTotalCost: "Total mes",
    aiUsageNoModelsTitle: "Sin modelos en uso",
    aiUsageNoModelsDetail: "Este mes hay uso registrado, pero todavía no hay detalle por modelo.",
    aiUsageDocumentAi: "IA documental",
    aiUsageImages: "Imágenes",
    aiUsageVision: "Visión",
    aiUsageAudio: "Audio",
    aiUsageAgentic: "Tareas agénticas",
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
    aiUsageTitle: "AI usage",
    aiUsageByCapability: "By capability",
    aiUsageByModel: "By model",
    aiUsageClose: "Close AI usage",
    aiUsageModel: "Model",
    aiUsageTokens: "Tokens",
    aiUsageCost: "Cost",
    aiUsageInteractions: "Interactions",
    aiUsageInteractionsShort: "Int.",
    aiUsageTotal: "Total",
    aiUsageTotalCost: "Month total",
    aiUsageNoModelsTitle: "No models used",
    aiUsageNoModelsDetail: "This month has usage, but model-level detail is not available yet.",
    aiUsageDocumentAi: "Document AI",
    aiUsageImages: "Images",
    aiUsageVision: "Vision",
    aiUsageAudio: "Audio",
    aiUsageAgentic: "Agentic tasks",
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

function formatCompactInteger(value: number, language: AppearanceConfig["language"]) {
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
    notation: value >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(value);
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
  const formatted = new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", { month: "long" }).format(new Date(year, monthIndex - 1, 1));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getCapabilityUsageRows(summary: AiUsageSummaryResponse | null): AiUsageCapabilitySummary[] {
  if (summary?.capabilities?.length) {
    return summary.capabilities;
  }
  const totals = getUsageTotals(summary);
  return [
    emptyCapabilityUsage("document_ai", "IA documental", totals),
    emptyCapabilityUsage("image_generation", "Imágenes"),
    emptyCapabilityUsage("vision", "Visión"),
    emptyCapabilityUsage("audio", "Audio"),
    emptyCapabilityUsage("agentic_tasks", "Tareas agénticas"),
  ];
}

function emptyCapabilityUsage(
  capability: AiUsageCapabilitySummary["capability"],
  label: string,
  values: Partial<Pick<AiUsageCapabilitySummary, "interactions" | "totalTokens" | "estimatedCost">> = {},
): AiUsageCapabilitySummary {
  return {
    capability,
    label,
    interactions: values.interactions ?? 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    embeddingTokens: 0,
    totalTokens: values.totalTokens ?? 0,
    estimatedCost: values.estimatedCost ?? 0,
    currency: "EUR",
    usageSource: "unknown",
  };
}

function getUsageTotals(summary: AiUsageSummaryResponse | null) {
  const models = summary?.models ?? [];
  return {
    interactions: models.reduce((total, model) => total + model.interactions, 0),
    totalTokens: models.reduce((total, model) => total + model.totalTokens, 0),
    estimatedCost: summary?.totalEstimatedCost ?? models.reduce((total, model) => total + model.estimatedCost, 0),
  };
}

function getCapabilityLabel(row: AiUsageCapabilitySummary, text: ProjectActionsCopy) {
  const labels: Record<AiUsageCapabilitySummary["capability"], string> = {
    document_ai: text.aiUsageDocumentAi,
    image_generation: text.aiUsageImages,
    vision: text.aiUsageVision,
    audio: text.aiUsageAudio,
    agentic_tasks: text.aiUsageAgentic,
  };
  return labels[row.capability] ?? row.label;
}

function getCapabilityIcon(capability: AiUsageCapabilitySummary["capability"]) {
  const icons: Record<AiUsageCapabilitySummary["capability"], React.ReactNode> = {
    document_ai: <FileText size={13} />,
    image_generation: <ImageIcon size={13} />,
    vision: <Telescope size={13} />,
    audio: <Mic size={13} />,
    agentic_tasks: <Sparkles size={13} />,
  };
  return icons[capability];
}
