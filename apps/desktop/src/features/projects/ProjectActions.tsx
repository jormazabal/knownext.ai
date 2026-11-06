import {AiBudgetControls} from "./AiBudgetControls";
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
import { useEffect, useRef, useState, type RefObject } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { createPortal } from "react-dom";
import type { AiUsageCapabilitySummary, AiUsageModelSummary, AiUsageSummaryResponse, AppearanceConfig, AuthStatus } from "../../types/domain";
import {useAiUsageScope} from "./useAiUsageScope";
import {AiUsageLedgerControls} from "./AiUsageLedgerControls";

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
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const narrowActionsMode = useNarrowActionsMode();

  const accountName = authStatus.user?.name || authStatus.user?.login || text.noGithubAccount;
  const accountInitials = getInitials(accountName);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function closeAccountMenu(event: MouseEvent) {
      if (accountMenuRef.current?.contains(event.target as Node)) return;
      setAccountMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.isComposing) {
        setAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
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
          className="grid h-8 w-8 place-items-center rounded-full bg-brand-hover [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 max-[760px]:h-11 max-[760px]:w-11 text-[11px] font-semibold text-brand-orange hover:bg-brand-orange hover:text-white"
          data-tooltip={accountName}
          data-tooltip-placement="right"
          ref={accountButtonRef}
          aria-label={accountName}
          aria-haspopup={narrowActionsMode ? "dialog" : "menu"}
          onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setAccountMenuOpen(true); } }}
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
          triggerRef={accountButtonRef}
          placement="right"
          narrowMode={narrowActionsMode}
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
    <div className="relative z-[140] mt-auto flex h-10 max-[760px]:h-12 [@media(pointer:coarse)]:h-12 shrink-0 items-center border-t border-line bg-white px-3 text-[11px] text-ink-secondary">
      <div ref={accountMenuRef} className="relative w-full min-w-0">
        <button
          className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1 text-left hover:bg-brand-hover [@media(pointer:coarse)]:h-11 max-[760px]:h-11"
          ref={accountButtonRef}
          aria-haspopup={narrowActionsMode ? "dialog" : "menu"}
          onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setAccountMenuOpen(true); } }}
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
          triggerRef={accountButtonRef}
          placement="center"
          narrowMode={narrowActionsMode}
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
  triggerRef,
  placement,
  narrowMode,
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
  triggerRef: RefObject<HTMLButtonElement | null>;
  placement: "center" | "right";
  narrowMode: boolean;
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
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const usageOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);
  const focusUsage = useRef(false);
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
    setUsageDialogOpen(false);
    cancelUsageTimers();
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen || narrowMode) return;
    const menu = desktopMenuRef.current;
    menu?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      if (menu?.contains(document.activeElement) || document.activeElement === document.body) {
        queueMicrotask(() => {
          if (!document.activeElement?.closest('[role="dialog"],[role="alertdialog"]')) triggerRef.current?.focus({ preventScroll: true });
        });
      }
    };
  }, [accountMenuOpen, narrowMode]);

  useEffect(() => {
    if (usagePanelVisible && focusUsage.current) {
      focusUsage.current = false;
      desktopMenuRef.current?.querySelector<HTMLElement>('[data-ai-usage-panel] button')?.focus();
    }
  }, [usagePanelVisible]);

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
    setUsageDialogOpen(false);
    onCloseAccountMenu();
  }

  function openUsageDialog() {
    cancelUsageTimers();
    if (narrowMode) setUsageDialogOpen(true);
    else {
      focusUsage.current = true;
      pinUsagePanel();
      desktopMenuRef.current?.querySelector<HTMLElement>('[data-ai-usage-panel] button')?.focus();
    }
  }

  // Closed actions must also leave the focus order and accessibility tree.
  if (!accountMenuOpen) return null;
  if (narrowMode) {

    if (usageDialogOpen) {
      return renderProjectActionsPortal(
        <AiUsagePanel
          variant="dialog"
          fallbackFocus={() => triggerRef.current}
          text={text}
          language={language}
          summary={aiUsageSummary}
          onClose={closeUsagePanelAndMenu}
          onPin={() => {}}
          onHoverEnter={() => {}}
          onHoverLeave={() => {}}
        />,
      );
    }

    return renderProjectActionsPortal(
      <ModalFrame label={text.accountOptionsTitle} onClose={onCloseAccountMenu} fallbackFocus={() => triggerRef.current} className="!z-[160] !items-end">
        <div className="absolute inset-0" aria-hidden="true" onMouseDown={onCloseAccountMenu} />
        <section
          className="relative flex max-h-[min(560px,calc(100dvh-32px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <h2 id="account-actions-title" className="text-[13px] font-semibold text-ink-primary">{text.accountOptionsTitle}</h2>
            <button className="grid h-11 w-11 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label={text.accountOptionsClose} onClick={onCloseAccountMenu}>
              <X size={16} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <AccountActionsMenuContent
              className="rounded-md border border-line bg-white p-1"
              appVersion={appVersion}
              text={text}
              authStatus={authStatus}
              accountName={accountName}
              accountInitials={accountInitials}
              orphanDraftCount={orphanDraftCount}
              isCheckingForUpdates={isCheckingForUpdates}
              usagePanelVisible={false}
              narrowMode
              onRunAction={onRunAction}
              onLoginGithub={onLoginGithub}
              onLogout={onLogout}
              onOpenAppSettings={onOpenAppSettings}
              onOpenRecoverableDrafts={onOpenRecoverableDrafts}
              onCheckForUpdates={onCheckForUpdates}
              onOpenReleaseNotes={onOpenReleaseNotes}
              onOpenAiUsage={openUsageDialog}
              onScheduleUsageOpen={scheduleUsageOpen}
              onScheduleUsageClose={scheduleUsageClose}
            />
          </div>
        </section>
      </ModalFrame>,
    );
  }

  return (
    <div
      ref={desktopMenuRef}
      onKeyDown={event => {
        // The flyout has forms: arrow keys there retain their normal meaning.
        if (!(event.target as HTMLElement).closest('[role="menu"]')) return;
        const items = Array.from(desktopMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        } else if (event.key === "ArrowRight" && (event.target as HTMLElement).getAttribute("aria-haspopup") === "dialog") {
          event.preventDefault(); openUsageDialog();
        } else if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault(); event.stopPropagation();
          if (event.key === "Tab") {
            const candidates = Array.from(document.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'))
              .filter(el => !desktopMenuRef.current?.contains(el) && !el.closest('[hidden],[inert]') && el.tabIndex >= 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden");
            const index = candidates.indexOf(triggerRef.current!);
            (candidates[index + (event.shiftKey ? -1 : 1)] ?? triggerRef.current)?.focus();
          } else triggerRef.current?.focus();
          onCloseAccountMenu();
        }
      }}
      className={[
        "absolute bottom-[38px] z-[140] w-[252px] transition",
        placement === "right" ? "left-10" : "left-1/2 -translate-x-1/2",
        accountMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
    >
      <div className="relative" onMouseEnter={cancelUsageTimers} onMouseLeave={scheduleUsageClose}>
      <AccountActionsMenuContent
        className="rounded-md border border-line bg-white p-1 shadow-menu"
        appVersion={appVersion}
        text={text}
        authStatus={authStatus}
        accountName={accountName}
        accountInitials={accountInitials}
        orphanDraftCount={orphanDraftCount}
        isCheckingForUpdates={isCheckingForUpdates}
        usagePanelVisible={usagePanelVisible}
        narrowMode={false}
        onRunAction={onRunAction}
        onLoginGithub={onLoginGithub}
        onLogout={onLogout}
        onOpenAppSettings={onOpenAppSettings}
        onOpenRecoverableDrafts={onOpenRecoverableDrafts}
        onCheckForUpdates={onCheckForUpdates}
        onOpenReleaseNotes={onOpenReleaseNotes}
        onOpenAiUsage={openUsageDialog}
        onScheduleUsageOpen={scheduleUsageOpen}
        onScheduleUsageClose={scheduleUsageClose}
      />
      {usagePanelVisible ? (
        <AiUsagePanel
          variant="flyout"
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

function AccountActionsMenuContent({
  className,
  appVersion,
  text,
  authStatus,
  accountName,
  accountInitials,
  orphanDraftCount,
  isCheckingForUpdates,
  usagePanelVisible,
  narrowMode,
  onRunAction,
  onLoginGithub,
  onLogout,
  onOpenAppSettings,
  onOpenRecoverableDrafts,
  onCheckForUpdates,
  onOpenReleaseNotes,
  onOpenAiUsage,
  onScheduleUsageOpen,
  onScheduleUsageClose,
}: {
  className: string;
  appVersion: string;
  text: ProjectActionsCopy;
  authStatus: AuthStatus;
  accountName: string;
  accountInitials: string;
  orphanDraftCount: number;
  isCheckingForUpdates: boolean;
  usagePanelVisible: boolean;
  narrowMode: boolean;
  onRunAction: (action: () => void) => void;
  onLoginGithub: () => void;
  onLogout: () => void;
  onOpenAppSettings: () => void;
  onOpenRecoverableDrafts: () => void;
  onCheckForUpdates: () => void;
  onOpenReleaseNotes: () => void;
  onOpenAiUsage: () => void;
  onScheduleUsageOpen: () => void;
  onScheduleUsageClose: () => void;
}) {
  return (
    <div className={className} role={narrowMode ? undefined : "menu"} aria-label={narrowMode ? undefined : text.accountOptionsTitle}>
      <div className="px-2 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-hover text-[11px] font-semibold text-brand-orange">
              {accountInitials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-ink-primary">{accountName}</p>
              {authStatus.user && <p className="mt-0.5 text-[10px] leading-4 text-ink-secondary">
                {authStatus.isAuthenticated ? text.githubConnectedStatus : text.githubBlockedStatus}
              </p>}
            </div>
          </div>
          <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
            v{appVersion}
          </span>
        </div>
        {(authStatus.storageError||authStatus.credentialStorageError)&&<p role="alert" className="mt-2 break-words text-xs leading-5 text-red-700">{authStatus.storageError||authStatus.credentialStorageError}</p>}
        <div className="mt-2 flex items-center gap-2">
          {authStatus.isAuthenticated ? (
            <button
        role={narrowMode ? undefined : "menuitem"}
              className="inline-flex min-h-11 items-center gap-1.5 rounded border border-line px-2 text-[10px] font-semibold text-ink-secondary hover:bg-red-50 hover:text-red-700"
              onClick={() => onRunAction(onLogout)}
            >
              <LogOut size={13} />
              <span>{text.logout}</span>
            </button>
          ) : (
            <button
        role={narrowMode ? undefined : "menuitem"}
              className="inline-flex min-h-11 items-center gap-1.5 rounded bg-brand-orange px-2 text-[10px] font-semibold text-white hover:bg-brand-dark"
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
        role={narrowMode ? undefined : "menuitem"}
        className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
        onClick={() => onRunAction(onOpenAppSettings)}
      >
        <Settings size={14} />
        <span>{text.appSettings}</span>
      </button>
      <button
        role={narrowMode ? undefined : "menuitem"}
        className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
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
      <div className="relative" onMouseEnter={narrowMode ? undefined : onScheduleUsageOpen} onMouseLeave={narrowMode ? undefined : onScheduleUsageClose}>
        <button
        role={narrowMode ? undefined : "menuitem"}
          className={`flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover ${usagePanelVisible ? "bg-brand-hover" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={usagePanelVisible}
          onClick={onOpenAiUsage}
          onFocus={narrowMode ? undefined : onScheduleUsageOpen}
        >
          <BarChart3 size={14} />
          <span className="min-w-0 flex-1 truncate">{text.aiUsage}</span>
          <ChevronRight size={13} className="text-ink-secondary" />
        </button>
      </div>
      <button
        role={narrowMode ? undefined : "menuitem"}
        className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover"
        onClick={() => onRunAction(onOpenReleaseNotes)}
      >
        <ScrollText size={14} />
        <span>{text.releaseNotes}</span>
      </button>
      <div className="my-1 border-t border-line" />
      <button
        role={narrowMode ? undefined : "menuitem"}
        className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isCheckingForUpdates}
        onClick={() => onRunAction(onCheckForUpdates)}
      >
        <RefreshCw size={14} className={isCheckingForUpdates ? "animate-spin" : ""} />
        <span>{isCheckingForUpdates ? text.checkingUpdates : text.checkUpdates}</span>
      </button>
    </div>
  );
}

function AiUsagePanel({
  variant = "flyout",
  fallbackFocus,
  text,
  language,
  summary:initialSummary,
  onClose,
  onPin,
  onHoverEnter,
  onHoverLeave,
}: {
  variant?: "flyout" | "dialog";
  fallbackFocus?: () => HTMLElement | null;
  text: ProjectActionsCopy;
  language: AppearanceConfig["language"];
  summary: AiUsageSummaryResponse | null;
  onClose: () => void;
  onPin: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const [view, setView] = useState<"capability" | "model">("capability");
  const scope=useAiUsageScope(initialSummary);
  const summary=scope.summary;
  const english=language==="en";
  const monthLabel = formatUsageMonth(scope.query.month, language);
  const capabilityRows = getCapabilityUsageRows(summary);
  const modelRows = summary?.models ?? [];
  const activeRows = view === "capability" ? capabilityRows : modelRows;
  const totals = getUsageTotals(summary);
  const hasUsage = totals.interactions > 0 || totals.totalTokens > 0 || totals.estimatedCost > 0;
  const unpriced=(summary?.legacyEntries??0)+(summary?.unpricedEntries??0);

  const header = (
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded border border-brand-orange/20 bg-brand-hover text-brand-orange">
          <BarChart3 size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p id={variant === "dialog" ? "ai-usage-dialog-title" : undefined} className="text-[12px] font-semibold text-ink-primary">{text.aiUsageTitle}</p>
          <p className="mt-0.5 text-[10px] font-medium text-ink-secondary">{monthLabel}{summary?.periodTimeZone&&<span> · UTC</span>}</p>
        </div>
        <button
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center rounded text-ink-secondary hover:bg-panel hover:text-ink-primary"
          aria-label={text.aiUsageClose}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
  );
  const content = (
    <>
      <div className="mt-3 space-y-2 text-xs">
        <label className="block">{english?"Project scope":"Alcance del proyecto"}<select value={scope.query.projectId} onChange={event=>void scope.load({...scope.query,projectId:event.target.value})} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"><option value="">{english?"All projects":"Todos los proyectos"}</option>{scope.projects.map(project=><option key={project.id} value={project.id}>{project.name}{project.state==="retired"?(english?" · removed":" · retirado"):project.state==="unavailable"?` · ${project.id}`:""}</option>)}{scope.query.projectId&&!scope.projects.some(project=>project.id===scope.query.projectId)&&<option value={scope.query.projectId}>{english?"Selected project":"Proyecto seleccionado"}</option>}</select></label>
        <div className="flex items-end gap-2"><label className="min-w-0 flex-1">{english?"Usage month (UTC)":"Mes de consumo (UTC)"}<input type="month" value={scope.query.month} onChange={event=>void scope.load({...scope.query,month:event.target.value})} className="mt-1 min-h-11 w-full min-w-0 rounded border border-line bg-white px-2"/></label><button type="button" onClick={()=>void scope.load()} disabled={scope.loading} className="min-h-11 shrink-0 rounded px-2 text-brand-dark hover:bg-brand-hover disabled:opacity-50">{english?"Refresh":"Actualizar"}</button></div>
      </div>
      {scope.loading&&<p role="status" className="mt-2 text-xs">{english?"Reading the selected scope…":"Consultando el alcance elegido…"}</p>}
      {scope.error&&<p role="alert" className="mt-2 text-xs leading-5 text-red-700">{scope.error}</p>}
      <AiBudgetControls key={`${scope.query.month}:${scope.query.projectId}`} month={scope.query.month} projectId={scope.query.projectId}/>
      {summary?.coverage&&<p className="mt-2 text-[11px] leading-5 text-ink-secondary">{summary.coverage==="local-period-aggregates"?(english?"Local period totals with recent detail; not the provider's complete bill.":"Totales locales por periodo y detalle reciente; no equivale a toda la facturación del proveedor."):(english?"Local estimate from retained records; not the provider's complete bill.":"Estimación de los registros locales conservados; no equivale a toda la facturación del proveedor.")}</p>}
      {summary?.legacyWindowOnly&&<p className="mt-2 text-xs leading-5 text-ink-secondary">{english?"Earlier history is limited to records available at conversion.":"El histórico anterior se limita a los registros disponibles al convertir."}</p>}
      {unpriced>0&&<p role="status" className="mt-2 text-xs leading-5">{english?`${unpriced} ${unpriced===1?"record has":"records have"} no available EUR amount. Totals include only available amounts.`:`${unpriced} ${unpriced===1?"registro":"registros"} sin importe EUR disponible. El total recoge solo los importes disponibles.`}</p>}
      {!!summary?.unscopedEntries&&<p className="mt-2 text-xs leading-5 text-ink-secondary">{english?`${summary.unscopedEntries} retained ${summary.unscopedEntries===1?"record has":"records have"} no attributable period.`:`${summary.unscopedEntries} ${summary.unscopedEntries===1?"registro conservado no tiene":"registros conservados no tienen"} periodo atribuible.`}</p>}

      <div className="mt-3 grid grid-cols-2 rounded border border-line bg-panel p-0.5">
        <button
          type="button"
          className={`min-h-11 rounded text-[10px] font-semibold transition ${view === "capability" ? "bg-white text-brand-orange shadow-sm" : "text-ink-secondary hover:text-ink-primary"}`}
          onClick={() => setView("capability")}
        >
          {text.aiUsageByCapability}
        </button>
        <button
          type="button"
          className={`min-h-11 rounded text-[10px] font-semibold transition ${view === "model" ? "bg-white text-brand-orange shadow-sm" : "text-ink-secondary hover:text-ink-primary"}`}
          onClick={() => setView("model")}
        >
          {text.aiUsageByModel}
        </button>
      </div>

      {summary?.costNote && <details className="my-2 text-xs leading-5 text-ink-secondary"><summary className="flex min-h-11 cursor-pointer items-center">{english?"Data scope and quality":"Alcance y calidad de los datos"}</summary><p>{summary.costNote}</p><p>Registros heredados: {summary.legacyEntries ?? 0} · Sin importe EUR disponible: {summary.unpricedEntries ?? 0}</p><p>Sin periodo atribuible: {summary.unscopedEntries??0} · Detalle reciente: {summary.retainedEntries??"—"}/{summary.entryLimit??5000}</p>{summary.recordedEntries!==undefined&&<p>Registros contabilizados por periodo: {summary.recordedEntries}</p>}<p>Estimación USD disponible: ${(summary.totalEstimatedCostUsd ?? 0).toFixed(4)}</p>{summary.projectNamesComplete===false&&<p>Lista de proyectos parcial; no se consideran vacías las asociaciones no consultadas.</p>}{summary.exchangeRate?.usdPerEur ? <p>Cambio aplicado por trabajo. Última referencia: 1 EUR = {summary.exchangeRate.usdPerEur} USD · {summary.exchangeRate.date} {summary.exchangeRate.source && <a href={summary.exchangeRate.source} target="_blank" rel="noreferrer">BCE</a>}</p> : <p>{english?"No current exchange reference is available. Already recorded EUR amounts keep their applied rate.":"No hay referencia actual disponible. Los importes EUR ya registrados conservan el cambio que se les aplicó."}</p>}<AiUsageLedgerControls english={english} onChanged={()=>scope.load()}/></details>}
      {summary?.exchangeRateWarning&&<p role="alert" className="my-3 rounded bg-orange-50 p-3 text-xs leading-5 text-brand-dark">{summary.exchangeRateWarning} {language==="en"?"No conversion has been assumed; the saved reference is preserved.":"No se presupone conversión; la referencia guardada se conserva."}</p>}
      {!summary ? (scope.loading?null:<div role="status" className="mt-3 rounded bg-panel px-3 py-4"><p className="text-xs font-semibold">{text.aiUsageUnavailableTitle}</p><p className="mt-1 text-xs leading-5 text-ink-secondary">{text.aiUsageUnavailableDetail}</p></div>) : hasUsage ? (
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
                unpricedEntries={row.unpricedEntries}
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
            unpricedEntries={unpriced}
            language={language}
            text={text}
            total
          />
        </div>
      ) : (
        <div className="mt-3 rounded border border-dashed border-line bg-panel px-3 py-4">
          <p className="text-[11px] font-semibold text-ink-primary">{summary.unscopedEntries?(english?"No records attributable to this scope":"Sin registros atribuibles a este alcance"):text.aiUsageEmptyTitle}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{summary.coverage?(english?"No retained local records match the selected project and month.":"No hay registros locales conservados para el proyecto y el mes elegidos."):text.aiUsageEmptyDetail}</p>
        </div>
      )}
    </>
  );

  if (variant === "dialog") {
    return (
      <ModalFrame label={text.aiUsageTitle} onClose={onClose} fallbackFocus={fallbackFocus} className="!z-[170] !items-end">
        <div className="absolute inset-0" aria-hidden="true" onMouseDown={onClose} />
        <section
          className="relative flex max-h-[min(560px,calc(100dvh-32px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="shrink-0 px-3 pt-3">{header}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{content}</div>
        </section>
      </ModalFrame>
    );
  }

  return (
    <div
      data-ai-usage-panel
      role="region"
      aria-label={text.aiUsageTitle}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onFocusCapture={onPin}
      onMouseDown={(event) => {
        event.stopPropagation();
        onPin();
      }}
      className={[
        "absolute bottom-0 left-[calc(100%-1px)] z-[150] flex max-h-[calc(100dvh-80px)] w-[360px] flex-col rounded-md border border-line bg-white shadow-menu",
      ].join(" ")}
    >
      <div className="shrink-0 px-3 pt-3">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{content}</div>
    </div>
  );
}

function AiUsageRow({
  label,
  icon,
  interactions,
  tokens,
  cost,
  unpricedEntries=0,
  language,
  text,
  total = false,
}: {
  label: string;
  icon?: React.ReactNode;
  interactions: number;
  tokens: number;
  cost: number;
  unpricedEntries?:number;
  language: AppearanceConfig["language"];
  text: ProjectActionsCopy;
  total?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1.55fr)_52px_68px_72px] max-[760px]:grid-cols-[minmax(0,1fr)_60px_70px] items-center gap-2 rounded border px-2.5 py-2 ${total ? "border-brand-orange/30 bg-brand-hover" : "border-line bg-white"}`}>
      <div className={`flex min-w-0 items-center gap-2 ${total ? "text-brand-orange" : "text-ink-primary"}`}>
        {icon ? <span className={`grid h-4 w-4 shrink-0 place-items-center ${total ? "text-brand-orange" : "text-ink-secondary"}`}>{icon}</span> : null}
        <div className="min-w-0"><p className="break-words text-[11px] font-semibold [overflow-wrap:anywhere]">{label}</p><p className="min-[761px]:hidden mt-1 text-[10px] text-ink-secondary"><span>{formatInteger(interactions,language)}</span> {text.aiUsageInteractionsShort}</p></div>
      </div>
      <div className="max-[760px]:hidden"><AiUsageCell label={text.aiUsageInteractionsShort} value={formatInteger(interactions, language)} alignRight /></div>
      <AiUsageCell label={text.aiUsageTokens} value={formatCompactInteger(tokens, language)} alignRight />
      <AiUsageCell label={unpricedEntries>0?(language==="en"?"EUR available":"EUR disponible"):text.aiUsageCost} value={unpricedEntries>=interactions&&unpricedEntries>0?"—":formatCurrency(cost, language)} alignRight />
    </div>
  );
}

function AiUsageCell({ label, value, alignRight = false }: { label: string; value: string; alignRight?: boolean }) {
  return (
    <div className={alignRight ? "text-right" : ""}>
      <p className="text-[9px] font-semibold uppercase leading-none text-ink-secondary">{label}</p>
      <p className="mt-1 truncate font-mono text-[12px] font-semibold leading-none text-ink-primary">{value}</p>
    </div>
  );
}

type ProjectActionsCopy = typeof projectActionsCopy.es;

const projectActionsCopy = {
  es: {
    noGithubAccount: "Sin cuenta GitHub",
    githubConnectedStatus: "Cuenta GitHub conectada",
    githubBlockedStatus: "GitHub pausado",
    accountOptionsTitle: "Opciones de cuenta",
    accountOptionsClose: "Cerrar opciones de cuenta",
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
    aiUsageAgentic: "Investigación",
    aiUsageUnavailableTitle: "Resumen no disponible",
    aiUsageUnavailableDetail: "No se ha podido consultar el consumo. La ausencia de datos no indica que el coste sea cero.",
    aiUsageEmptyTitle: "Sin uso registrado",
    aiUsageEmptyDetail: "Las estadísticas aparecerán cuando se complete una interacción real con IA.",
    releaseNotes: "Notas de release",
    recoverableDrafts: "Borradores recuperables",
  },
  en: {
    noGithubAccount: "No GitHub account",
    githubConnectedStatus: "GitHub account connected",
    githubBlockedStatus: "GitHub paused",
    accountOptionsTitle: "Account options",
    accountOptionsClose: "Close account options",
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
    aiUsageUnavailableTitle: "Summary unavailable",
    aiUsageUnavailableDetail: "Usage could not be read. Missing data does not mean zero cost.",
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
    emptyCapabilityUsage("agentic_tasks", "Investigación"),
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
    interactions: summary?.totalInteractions??models.reduce((total, model) => total + model.interactions, 0),
    totalTokens: summary?.totalTokens??models.reduce((total, model) => total + model.totalTokens, 0),
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

function renderProjectActionsPortal(content: React.ReactNode) {
  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

function useNarrowActionsMode() {
  const [narrow, setNarrow] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 760px)").matches
      : false
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return narrow;
}
