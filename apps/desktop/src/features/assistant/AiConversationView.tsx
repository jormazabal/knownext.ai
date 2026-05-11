import { Bot, CheckCircle2, FileText, FolderPlus, ShieldAlert, Sparkles, Trash2, User } from "lucide-react";
import type { AiConfigStatus, AiConversationEvent, Project } from "../../types/domain";

type AiConversationViewProps = {
  project: Project | null;
  config: AiConfigStatus;
  events: AiConversationEvent[];
};

export function AiConversationView({ project, config, events }: AiConversationViewProps) {
  const groupedEvents = groupEventsByDay(events);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-170px)] max-w-[820px] flex-col pb-20">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-orange" />
              <h2 className="text-[14px] font-semibold text-ink-primary">IA del proyecto</h2>
            </div>
            <p className="mt-1 truncate text-[11px] text-ink-secondary">{project?.name ?? "Sin proyecto activo"}</p>
          </div>
          <div className="flex shrink-0 gap-2 text-[10px]">
            <span className={["rounded px-2 py-1 font-semibold", config.openaiKeyConfigured ? "bg-brand-hover text-brand-orange" : "bg-panel text-ink-secondary"].join(" ")}>
              {config.openaiKeyConfigured ? "OpenAI configurado" : "Sin API key"}
            </span>
            <span className="rounded bg-panel px-2 py-1 text-ink-secondary">{config.rag.enabled ? "RAG activo" : "RAG inactivo"}</span>
          </div>
        </div>
      </header>

      {events.length === 0 ? (
        <div className="grid flex-1 place-items-center py-16">
          <div className="max-w-[360px] text-center">
            <Bot className="mx-auto text-brand-orange" size={26} />
            <p className="mt-3 text-[13px] font-semibold text-ink-primary">Sin conversación todavía</p>
            <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
              Usa el prompt inferior para preguntar, editar documentos o crear estructura documental.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 py-5">
          {groupedEvents.map((group) => (
            <section key={group.label}>
              <div className="mb-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[10px] font-semibold uppercase text-ink-secondary">{group.label}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-3">
                {group.events.map((event) => (
                  <AiEventBubble key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AiEventBubble({ event }: { event: AiConversationEvent }) {
  if (event.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-md bg-brand-orange px-3 py-2 text-[11px] leading-5 text-white">
          <div className="mb-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-white/85">
            <User size={12} />
            Tú
          </div>
          {event.content}
        </div>
      </div>
    );
  }

  if (event.role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[76%] rounded-md border border-line bg-white px-3 py-2 text-[11px] leading-5 text-ink-primary shadow-subtle">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-brand-orange">
            <Bot size={12} />
            IA
          </div>
          {event.content}
        </div>
      </div>
    );
  }

  const Icon = getEventIcon(event.type);
  return (
    <div className="flex justify-center">
      <div className="w-[min(560px,100%)] rounded-md border border-line bg-panel px-3 py-2 text-[11px] leading-5 text-ink-primary">
        <div className="flex items-start gap-2">
          <Icon size={14} className="mt-0.5 shrink-0 text-brand-orange" />
          <div className="min-w-0">
            <p className="font-semibold">{event.content}</p>
            {event.path ? <p className="mt-1 truncate font-mono text-[10px] text-ink-secondary">{event.path}</p> : null}
            {event.paths.length > 0 ? (
              <div className="mt-1 space-y-1">
                {event.paths.map((path) => (
                  <p key={path} className="truncate font-mono text-[10px] text-ink-secondary">{path}</p>
                ))}
              </div>
            ) : null}
            {event.summary ? <p className="mt-1 text-[10px] text-ink-secondary">{event.summary}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function getEventIcon(type: AiConversationEvent["type"]) {
  if (type === "folder_created") return FolderPlus;
  if (type === "document_created" || type === "document_modified") return FileText;
  if (type === "delete_requested" || type === "node_deleted") return Trash2;
  if (type === "permission_blocked" || type === "provider_error" || type === "provider_unavailable") return ShieldAlert;
  return CheckCircle2;
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
