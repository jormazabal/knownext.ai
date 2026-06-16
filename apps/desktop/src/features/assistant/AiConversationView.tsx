import { Bot, Check, CheckCircle2, Circle, Clock3, Copy, Euro, FileText, FolderPlus, Globe2, ListChecks, ShieldCheck, ShieldAlert, Sparkles, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AiEditProposalCard } from "./AiEditProposalCard";
import { AiPendingIntentActions } from "./AiPendingIntentActions";
import type { AiAgenticTask, AiConfigStatus, AiConversationEvent, AiEditProposal, AiIndexStatusResponse, AiIntentActionType, AiPendingIntent, Project } from "../../types/domain";

const INITIAL_VISIBLE_EVENTS = 40;
const VISIBLE_EVENTS_INCREMENT = 20;

type AiConversationViewProps = {
  project: Project | null;
  config: AiConfigStatus;
  indexStatus: AiIndexStatusResponse | null;
  events: AiConversationEvent[];
  pendingIntent: AiPendingIntent | null;
  editProposal?: AiEditProposal | null;
  staleEditOperationIds?: string[];
  blockedEditOperationReasons?: Record<string, string>;
  appliedEditOperationIds?: string[];
  onIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onApplyEditProposal?: (proposalId: string, operationIds?: string[]) => void | Promise<void>;
  onDiscardEditProposal?: (proposalId: string) => void;
  onOpenDocument?: (documentId: string, name: string) => void;
};

export function AiConversationView({
  project,
  config,
  indexStatus,
  events,
  pendingIntent,
  editProposal = null,
  staleEditOperationIds = [],
  blockedEditOperationReasons = {},
  appliedEditOperationIds = [],
  onIntentAction,
  onApplyEditProposal,
  onDiscardEditProposal,
  onOpenDocument,
}: AiConversationViewProps) {
  const [visibleEventCount, setVisibleEventCount] = useState(INITIAL_VISIBLE_EVENTS);
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const visibleEvents = useMemo(() => events.slice(Math.max(0, events.length - visibleEventCount)), [events, visibleEventCount]);
  const hiddenEventCount = Math.max(0, events.length - visibleEvents.length);
  const groupedEvents = useMemo(() => groupEventsByPeriod(visibleEvents), [visibleEvents]);
  const ragLabel = getRagLabel(config, indexStatus);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const pendingShowMoreScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const pendingActionEventId = getPendingActionEventId(events, pendingIntent, editProposal);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  useEffect(() => {
    setVisibleEventCount(INITIAL_VISIBLE_EVENTS);
  }, [project?.id]);

  useLayoutEffect(() => {
    const pendingScroll = pendingShowMoreScrollRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!pendingScroll || !scrollContainer) return;
    scrollContainer.scrollTop = pendingScroll.scrollTop + (scrollContainer.scrollHeight - pendingScroll.scrollHeight);
    pendingShowMoreScrollRef.current = null;
  }, [visibleEventCount]);

  const handleShowMore = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      pendingShowMoreScrollRef.current = {
        scrollHeight: scrollContainer.scrollHeight,
        scrollTop: scrollContainer.scrollTop,
      };
    }
    setVisibleEventCount((currentCount) => Math.min(events.length, currentCount + VISIBLE_EVENTS_INCREMENT));
  }, [events.length]);

  const handleCopyEvent = useCallback(async (event: AiConversationEvent) => {
    try {
      await copyTextToClipboard(event.content);
      setCopiedEventId(event.id);
      window.setTimeout(() => setCopiedEventId((currentId) => (currentId === event.id ? null : currentId)), 1400);
    } catch {
      setCopiedEventId(null);
    }
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="shrink-0 border-b border-line bg-white/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-hover text-brand-orange">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-ink-primary">IA documental</h2>
                <p className="truncate text-[11px] text-ink-secondary">{project?.name ? `Proyecto ${project.name}` : "Sin proyecto activo"}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
            <StatusPill active={config.openaiKeyConfigured}>{config.openaiKeyConfigured ? "OpenAI" : "Sin API key"}</StatusPill>
            <StatusPill active={ragLabel.tone === "ready"}>{ragLabel.label}</StatusPill>
          </div>
        </div>
      </header>

      <div ref={scrollContainerRef} data-testid="ai-conversation-scroll" className="min-h-0 flex-1 overflow-y-auto px-6 pb-32 pt-5 [scrollbar-gutter:stable]">
        <div className="mx-auto flex min-h-full max-w-[900px] flex-col">
          {events.length === 0 ? (
            <div className="grid flex-1 place-items-center pb-10">
              <div className="max-w-[360px] text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-orange-200 bg-brand-hover text-brand-orange shadow-subtle">
                  <Bot size={21} />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink-primary">Sin conversación todavía</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
                  Escribe desde el prompt inferior para consultar, redactar o preparar cambios sobre la documentación.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {hiddenEventCount > 0 ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-medium text-ink-secondary shadow-subtle transition hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange"
                    onClick={handleShowMore}
                  >
                    Mostrar más
                  </button>
                </div>
              ) : null}
              {groupedEvents.map((group) => (
                <section key={group.label}>
                  <div className="sticky top-2 z-20 mb-4 flex justify-center pointer-events-none">
                    <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-ink-secondary shadow-subtle">{group.label}</span>
                  </div>
                  <div className="space-y-3">
                    {group.events.map((event) => (
                      <AiEventBubble
                        key={event.id}
                        event={event}
                        pendingIntent={event.id === pendingActionEventId ? pendingIntent : null}
                        editProposal={event.id === pendingActionEventId ? editProposal : null}
                        staleEditOperationIds={staleEditOperationIds}
                        blockedEditOperationReasons={blockedEditOperationReasons}
                        appliedEditOperationIds={appliedEditOperationIds}
                        copied={copiedEventId === event.id}
                        onIntentAction={onIntentAction}
                        onApplyEditProposal={onApplyEditProposal}
                        onDiscardEditProposal={onDiscardEditProposal}
                        onOpenDocument={onOpenDocument}
                        onCopy={handleCopyEvent}
                      />
                    ))}
                  </div>
                </section>
              ))}
              <div ref={endRef} />
            </div>
          )}
          {events.length === 0 ? <div ref={endRef} /> : null}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ active, children }: { active: boolean; children: string }) {
  return (
    <span className={["rounded-full border px-2.5 py-1 font-medium", active ? "border-orange-200 bg-brand-hover text-brand-orange" : "border-line bg-panel text-ink-secondary"].join(" ")}>
      {children}
    </span>
  );
}

function AiEventBubble({
  event,
  pendingIntent,
  editProposal,
  staleEditOperationIds,
  blockedEditOperationReasons,
  appliedEditOperationIds,
  copied,
  onIntentAction,
  onApplyEditProposal,
  onDiscardEditProposal,
  onOpenDocument,
  onCopy,
}: {
  event: AiConversationEvent;
  pendingIntent: AiPendingIntent | null;
  editProposal: AiEditProposal | null;
  staleEditOperationIds: string[];
  blockedEditOperationReasons: Record<string, string>;
  appliedEditOperationIds: string[];
  copied: boolean;
  onIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onApplyEditProposal?: (proposalId: string, operationIds?: string[]) => void | Promise<void>;
  onDiscardEditProposal?: (proposalId: string) => void;
  onOpenDocument?: (documentId: string, name: string) => void;
  onCopy: (event: AiConversationEvent) => void | Promise<void>;
}) {
  const documentLink = getEventDocumentLink(event);
  const createdAtLabel = formatEventTimestamp(event.createdAt);

  if (event.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="flex max-w-[70%] flex-col items-stretch">
          <div className="rounded-[22px] rounded-br-lg bg-brand-orange px-4 py-2.5 text-[12px] leading-5 text-white shadow-[0_10px_24px_rgb(var(--accent)/0.22)]">
            <p className="whitespace-pre-wrap">{event.content}</p>
            {event.sourcesUsed?.length ? (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-white/20 pt-2">
                {event.sourcesUsed.slice(0, 4).map((source) => (
                  <span key={source.id} className="max-w-full truncate rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-medium text-white/90">
                    {source.name}
                  </span>
                ))}
                {event.sourcesUsed.length > 4 ? (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-medium text-white/90">+{event.sourcesUsed.length - 4}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <AiBubbleFooter
            link={documentLink}
            createdAt={event.createdAt}
            createdAtLabel={createdAtLabel}
            copied={copied}
            onOpenDocument={onOpenDocument}
            onCopy={() => onCopy(event)}
          />
        </div>
        <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-orange text-white shadow-[0_8px_20px_rgb(var(--accent)/0.22)]">
          <User size={14} />
        </span>
      </div>
    );
  }

  if (event.role === "assistant") {
    return (
      <div className="flex justify-start gap-2.5">
        <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-orange-200 bg-brand-hover text-brand-orange">
          <Bot size={14} />
        </span>
        <div className="flex max-w-[78%] flex-col items-stretch">
          <div className="rounded-[22px] rounded-bl-lg border border-line bg-white px-4 py-2.5 text-[12px] leading-5 text-ink-primary shadow-subtle">
            {event.content ? <p className="whitespace-pre-wrap">{event.content}</p> : null}
            {event.task ? <AiTaskCard task={event.task} /> : null}
            <AiPendingIntentActions intent={pendingIntent} onAction={onIntentAction} />
            {onApplyEditProposal && onDiscardEditProposal ? (
              <AiEditProposalCard
                proposal={editProposal}
                staleOperationIds={staleEditOperationIds}
                blockedOperationReasons={blockedEditOperationReasons}
                appliedOperationIds={appliedEditOperationIds}
                onApply={onApplyEditProposal}
                onDiscard={onDiscardEditProposal}
              />
            ) : null}
          </div>
          <AiBubbleFooter
            link={documentLink}
            createdAt={event.createdAt}
            createdAtLabel={createdAtLabel}
            copied={copied}
            onOpenDocument={onOpenDocument}
            onCopy={() => onCopy(event)}
          />
        </div>
      </div>
    );
  }

  const Icon = getEventIcon(event.type);
  return (
    <div className="flex justify-center">
      <div className="flex w-[min(620px,100%)] flex-col items-stretch">
        <div className="rounded-[18px] border border-line bg-panel/80 px-3 py-2 text-[11px] leading-5 text-ink-primary">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-brand-orange shadow-subtle">
              <Icon size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{event.content}</p>
              {shouldRenderEventPath(event) ? <p className="mt-1 truncate font-mono text-[10px] text-ink-secondary">{event.path}</p> : null}
              {event.paths.length > 0 ? (
                <div className="mt-1 grid gap-1">
                  {event.paths.map((path) => (
                    <p key={path} className="truncate font-mono text-[10px] text-ink-secondary">{path}</p>
                  ))}
                </div>
              ) : null}
              {event.summary ? <p className="mt-1 text-[10px] text-ink-secondary">{event.summary}</p> : null}
              {event.task ? <AiTaskCard task={event.task} compact /> : null}
            </div>
          </div>
        </div>
        <AiBubbleFooter
          link={documentLink}
          createdAt={event.createdAt}
          createdAtLabel={createdAtLabel}
          copied={copied}
          onOpenDocument={onOpenDocument}
          onCopy={() => onCopy(event)}
        />
      </div>
    </div>
  );
}

type EventDocumentLink = {
  documentId: string;
  path: string;
  name: string;
  folder: string;
  label: string;
};

function AiBubbleFooter({
  link,
  createdAt,
  createdAtLabel,
  copied,
  onOpenDocument,
  onCopy,
}: {
  link: EventDocumentLink | null;
  createdAt: string;
  createdAtLabel: string;
  copied: boolean;
  onOpenDocument?: (documentId: string, name: string) => void;
  onCopy: () => void | Promise<void>;
}) {
  return (
    <div className="mt-1 flex items-center gap-2 px-1 pb-0.5 text-[10px] leading-4 text-ink-secondary">
      <div className="min-w-0 flex-1">
        {link && onOpenDocument ? (
          <button
            type="button"
            className="inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 font-medium transition hover:bg-brand-hover hover:text-brand-orange"
            title={link.path}
            aria-label={`Abrir documento ${link.label}`}
            onClick={() => onOpenDocument(link.documentId, link.name)}
          >
            <FileText size={11} className="shrink-0" />
            <span className="min-w-0 truncate">{link.label}</span>
          </button>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 text-right">
        <time dateTime={createdAt} className="whitespace-nowrap">{createdAtLabel}</time>
        <button
          type="button"
          className="grid h-5 w-5 place-items-center rounded transition hover:bg-brand-hover hover:text-brand-orange"
          data-tooltip={copied ? "Copiado" : "Copiar mensaje"}
          aria-label={copied ? "Mensaje copiado" : "Copiar mensaje"}
          onClick={onCopy}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

function getEventDocumentLink(event: AiConversationEvent): EventDocumentLink | null {
  if (!event.documentId || !event.path) return null;
  const normalizedPath = event.path.replace(/\\/g, "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  const name = parts.length > 0 ? parts[parts.length - 1] : normalizedPath;
  const folder = parts.slice(0, -1).join(" / ");
  return {
    documentId: event.documentId,
    path: normalizedPath,
    name,
    folder,
    label: folder ? `${folder} / ${name}` : name,
  };
}

function shouldRenderEventPath(event: AiConversationEvent) {
  return Boolean(event.path && !event.content.includes(event.path));
}

function getPendingActionEventId(events: AiConversationEvent[], pendingIntent: AiPendingIntent | null, editProposal: AiEditProposal | null) {
  const hasPendingIntent = Boolean(pendingIntent && pendingIntent.status !== "completed" && pendingIntent.status !== "cancelled");
  const hasEditProposal = Boolean(editProposal && editProposal.status === "proposed");
  if (!hasPendingIntent && !hasEditProposal) return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].role === "assistant") return events[index].id;
  }
  return null;
}

function AiTaskCard({ task, compact = false }: { task: AiAgenticTask; compact?: boolean }) {
  const steps = task.steps.length > 0 ? task.steps : [{ id: "step-plan", title: "Preparar el plan de trabajo", status: "pending" as const, detail: null }];
  return (
    <div className={["mt-3 border-t border-orange-100 pt-3", compact ? "max-w-[520px]" : ""].join(" ")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-brand-orange">
            <ListChecks size={13} />
            <span>Tarea guiada</span>
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-ink-primary">{task.title}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold text-ink-secondary shadow-subtle">
          {depthLabel(task.depth)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-secondary">
        <TaskMetric icon={Clock3} label="Pasos" value={`${Math.min(steps.length, task.maxSteps)}/${task.maxSteps}`} />
        <TaskMetric icon={FileText} label="Docs" value={`${task.maxDocuments}`} />
        <TaskMetric icon={Euro} label="Límite" value={`${task.maxEstimatedCostEur.toFixed(2)} €`} />
      </div>

      <div className="mt-3 space-y-2">
        {steps.slice(0, task.maxSteps).map((step, index) => (
          <div key={step.id || `${step.title}-${index}`} className="flex gap-2">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-brand-orange shadow-subtle">
              {step.status === "completed" ? <CheckCircle2 size={12} /> : <Circle size={10} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium leading-4 text-ink-primary">{step.title}</span>
              {step.detail ? <span className="mt-0.5 block text-[9px] leading-4 text-ink-secondary">{step.detail}</span> : null}
            </span>
          </div>
        ))}
      </div>

      {task.requiresWebResearch ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[10px] text-ink-secondary shadow-subtle">
          <Globe2 size={13} className={task.webResearchAllowed ? "text-brand-orange" : "text-ink-secondary"} />
          <span>{task.webResearchAllowed ? "Búsqueda web disponible para esta tarea" : "Necesita OpenAI configurado para usar búsqueda web"}</span>
        </div>
      ) : null}

      {task.needsUserConfirmation ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-orange-100 bg-white px-2.5 py-2 text-[10px] font-medium text-ink-secondary shadow-subtle">
          <ShieldCheck size={13} className="text-brand-orange" />
          <span>Checkpoint requerido antes de crear o modificar documentos</span>
        </div>
      ) : null}

      {task.sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {task.sources.slice(0, 4).map((source) => (
            <span key={`${source.title}-${source.url ?? source.path ?? ""}`} className="max-w-full truncate rounded-full bg-white px-2 py-1 text-[9px] font-medium text-ink-secondary shadow-subtle">
              {source.title}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskMetric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-white px-2 py-1 shadow-subtle">
      <Icon size={11} className="shrink-0 text-brand-orange" />
      <span className="font-medium">
        {label}: <span className="font-semibold text-ink-primary">{value}</span>
      </span>
    </span>
  );
}

function depthLabel(depth: AiAgenticTask["depth"]) {
  if (depth === "quick") return "Rápida";
  if (depth === "deep") return "Profunda";
  if (depth === "bounded_autonomous") return "Autónoma limitada";
  return "Guiada";
}

function getEventIcon(type: AiConversationEvent["type"]) {
  if (type === "folder_created") return FolderPlus;
  if (type === "document_created" || type === "document_modified") return FileText;
  if (type === "delete_requested" || type === "node_deleted") return Trash2;
  if (type === "permission_blocked" || type === "provider_error" || type === "provider_unavailable") return ShieldAlert;
  if (type === "task_planned" || type === "task_checkpoint") return ListChecks;
  return CheckCircle2;
}

function getRagLabel(config: AiConfigStatus, indexStatus: AiIndexStatusResponse | null) {
  if (!config.rag.enabled) return { label: "RAG inactivo", tone: "idle" as const };
  if (indexStatus?.status === "updated" && indexStatus.vectorStoreId) return { label: "RAG listo", tone: "ready" as const };
  if (indexStatus?.status === "indexing") return { label: "RAG indexando", tone: "idle" as const };
  if (indexStatus?.status === "error") return { label: "RAG con error", tone: "idle" as const };
  return { label: "RAG pendiente", tone: "idle" as const };
}

function groupEventsByPeriod(events: AiConversationEvent[]) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const groups = new Map<string, AiConversationEvent[]>();

  for (const event of events) {
    const date = new Date(event.createdAt);
    const label = eventPeriodLabel(date, today, yesterday);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }

  return Array.from(groups.entries()).map(([label, groupEvents]) => ({ label, events: groupEvents }));
}

function eventPeriodLabel(date: Date, today: Date, yesterday: Date) {
  if (sameDay(date, today)) return "Hoy";
  if (sameDay(date, yesterday)) return "Ayer";
  const startOfThisWeek = startOfWeek(today);
  const startOfPreviousWeek = new Date(startOfThisWeek);
  startOfPreviousWeek.setDate(startOfThisWeek.getDate() - 7);
  if (date >= startOfThisWeek) return "Esta semana";
  if (date >= startOfPreviousWeek && date < startOfThisWeek) return "Semana pasada";
  const month = new Intl.DateTimeFormat("es", { month: "long" }).format(date);
  return `${capitalizeFirst(month)} ${date.getFullYear()}`;
}

function formatEventTimestamp(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (sameDay(date, today)) return time;
  if (sameDay(date, yesterday)) return `Ayer · ${time}`;
  const day = new Intl.DateTimeFormat("es", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
  return `${day} · ${time}`;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function capitalizeFirst(value: string) {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
