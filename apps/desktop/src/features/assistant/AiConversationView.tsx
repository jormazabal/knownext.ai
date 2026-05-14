import { Bot, CheckCircle2, Circle, Clock3, Euro, FileText, FolderPlus, Globe2, ListChecks, ShieldCheck, ShieldAlert, Sparkles, Trash2, User } from "lucide-react";
import { useEffect, useRef } from "react";
import { AiPendingIntentActions } from "./AiPendingIntentActions";
import type { AiAgenticTask, AiConfigStatus, AiConversationEvent, AiIndexStatusResponse, AiIntentActionType, AiPendingIntent, Project } from "../../types/domain";

type AiConversationViewProps = {
  project: Project | null;
  config: AiConfigStatus;
  indexStatus: AiIndexStatusResponse | null;
  events: AiConversationEvent[];
  pendingIntent: AiPendingIntent | null;
  onIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
};

export function AiConversationView({ project, config, indexStatus, events, pendingIntent, onIntentAction }: AiConversationViewProps) {
  const groupedEvents = groupEventsByDay(events);
  const ragLabel = getRagLabel(config, indexStatus);
  const endRef = useRef<HTMLDivElement | null>(null);
  const pendingActionEventId = getPendingActionEventId(events, pendingIntent);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

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

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-32 pt-5 [scrollbar-gutter:stable]">
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
              {groupedEvents.map((group) => (
                <section key={group.label}>
                  <div className="mb-4 flex justify-center">
                    <span className="rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-ink-secondary shadow-subtle">{group.label}</span>
                  </div>
                  <div className="space-y-3">
                    {group.events.map((event) => (
                      <AiEventBubble
                        key={event.id}
                        event={event}
                        pendingIntent={event.id === pendingActionEventId ? pendingIntent : null}
                        onIntentAction={onIntentAction}
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
  onIntentAction,
}: {
  event: AiConversationEvent;
  pendingIntent: AiPendingIntent | null;
  onIntentAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
}) {
  if (event.role === "user") {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[70%] rounded-[22px] rounded-br-lg bg-brand-orange px-4 py-2.5 text-[12px] leading-5 text-white shadow-[0_10px_24px_rgb(var(--accent)/0.22)]">
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
        <div className="max-w-[78%] rounded-[22px] rounded-bl-lg border border-line bg-white px-4 py-2.5 text-[12px] leading-5 text-ink-primary shadow-subtle">
          {event.content ? <p className="whitespace-pre-wrap">{event.content}</p> : null}
          {event.task ? <AiTaskCard task={event.task} /> : null}
          <AiPendingIntentActions intent={pendingIntent} onAction={onIntentAction} />
        </div>
      </div>
    );
  }

  const Icon = getEventIcon(event.type);
  return (
    <div className="flex justify-center">
      <div className="w-[min(620px,100%)] rounded-[18px] border border-line bg-panel/80 px-3 py-2 text-[11px] leading-5 text-ink-primary">
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
    </div>
  );
}

function shouldRenderEventPath(event: AiConversationEvent) {
  return Boolean(event.path && !event.content.includes(event.path));
}

function getPendingActionEventId(events: AiConversationEvent[], pendingIntent: AiPendingIntent | null) {
  if (!pendingIntent || pendingIntent.status === "completed" || pendingIntent.status === "cancelled") return null;
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
          <span>{task.webResearchAllowed ? "Investigación web permitida para esta tarea" : "Necesita permiso de investigación web"}</span>
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

function groupEventsByDay(events: AiConversationEvent[]) {
  const formatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const groups = new Map<string, AiConversationEvent[]>();

  for (const event of events) {
    const date = new Date(event.createdAt);
    const label = sameDay(date, today) ? "Hoy" : sameDay(date, yesterday) ? "Ayer" : formatter.format(date);
    groups.set(label, [...(groups.get(label) ?? []), event]);
  }

  return Array.from(groups.entries()).map(([label, groupEvents]) => ({ label, events: groupEvents }));
}

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}
