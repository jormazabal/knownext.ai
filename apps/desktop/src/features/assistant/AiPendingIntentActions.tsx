import { Check, Globe2, MessageSquareText, Sparkles, X } from "lucide-react";
import type { AiIntentActionType, AiPendingIntent } from "../../types/domain";

type AiPendingIntentActionsProps = {
  intent: AiPendingIntent | null;
  onAction: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onOpenConversation?: () => void;
  showConversationAction?: boolean;
};

export function AiPendingIntentActions({ intent, onAction, onOpenConversation, showConversationAction = false }: AiPendingIntentActionsProps) {
  if (!intent || intent.status === "completed" || intent.status === "cancelled") return null;

  const requiresWebPermission = intent.status === "awaiting_web_permission" && !intent.webResearchAllowed;
  const canApply = intent.status === "ready" || intent.status === "awaiting_decision" || intent.status === "running";

  return (
    <div className="mt-3 border-t border-orange-100 pt-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-hover text-brand-orange">
          <Sparkles size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.02em] text-brand-orange">Acción pendiente</span>
            <span className="rounded-full bg-brand-hover px-2 py-0.5 text-[10px] font-medium text-brand-orange">
              {describeAction(intent.proposedAction)}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-ink-primary">{intent.targetPath || "Proyecto"}</p>
          {requiresWebPermission ? (
            <p className="mt-0.5 text-[10px] leading-4 text-ink-secondary">Necesita permiso para buscar en internet antes de continuar.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        {requiresWebPermission ? (
          <ActionButton tone="primary" icon={Globe2} label="Permitir búsqueda" onClick={() => void onAction("allow_web_research", intent.id)} />
        ) : (
          <ActionButton tone="primary" icon={Check} label="Aplicar" disabled={!canApply} onClick={() => void onAction("apply", intent.id)} />
        )}
        {showConversationAction && onOpenConversation ? (
          <ActionButton tone="secondary" icon={MessageSquareText} label="Ver en IA" onClick={onOpenConversation} />
        ) : null}
        <ActionButton tone="secondary" icon={X} label="Cancelar" onClick={() => void onAction("cancel", intent.id)} />
      </div>
    </div>
  );
}

type ActionButtonProps = {
  icon: typeof Check;
  label: string;
  tone: "primary" | "secondary";
  disabled?: boolean;
  onClick: () => void;
};

function ActionButton({ icon: Icon, label, tone, disabled = false, onClick }: ActionButtonProps) {
  return (
    <button
      className={[
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition",
        tone === "primary" ? "bg-brand-orange text-white hover:bg-brand-dark" : "border border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function describeAction(action: AiPendingIntent["proposedAction"]) {
  switch (action) {
    case "replace_document":
      return "Reemplazar";
    case "edit_document":
      return "Editar";
    case "create_document":
      return "Crear";
    case "research_then_write":
      return "Investigar y redactar";
    case "project_operation":
    default:
      return "Proyecto";
  }
}
