import { useEffect, useState } from "react";
import { CountdownCloseButton } from "../../components/ui/CountdownCloseButton";
import { AiEditProposalCard } from "./AiEditProposalCard";
import { AiPendingIntentActions } from "./AiPendingIntentActions";
import type { AiEditProposal, AiIntentActionType, AiPendingIntent } from "../../types/domain";

type AiResponseBubbleProps = {
  bubble: { id: string; answer: string } | null;
  pendingIntent?: AiPendingIntent | null;
  editProposal?: AiEditProposal | null;
  staleEditOperationIds?: string[];
  blockedEditOperationReasons?: Record<string, string>;
  appliedEditOperationIds?: string[];
  onIntentAction?: (action: AiIntentActionType, intentId: string) => void | Promise<void>;
  onApplyEditProposal?: (proposalId: string, operationIds?: string[]) => void | Promise<void>;
  onDiscardEditProposal?: (proposalId: string) => void;
  onClose: () => void;
  onOpenConversation: () => void;
};

export function AiResponseBubble({
  bubble,
  pendingIntent = null,
  editProposal = null,
  staleEditOperationIds = [],
  blockedEditOperationReasons = {},
  appliedEditOperationIds = [],
  onIntentAction,
  onApplyEditProposal,
  onDiscardEditProposal,
  onClose,
  onOpenConversation,
}: AiResponseBubbleProps) {
  const [visibleBubble, setVisibleBubble] = useState(bubble);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (bubble) {
      setVisibleBubble(bubble);
      setClosing(false);
      return;
    }

    if (!visibleBubble) return;
    setClosing(true);
    const timeout = window.setTimeout(() => {
      setVisibleBubble(null);
      setClosing(false);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [bubble, visibleBubble]);

  if (!visibleBubble) return null;

  const longAnswer = visibleBubble.answer.length > 520;
  const answer = longAnswer ? `${visibleBubble.answer.slice(0, 520).trim()}...` : visibleBubble.answer;

  return (
    <div
      className={[
        "pointer-events-auto absolute bottom-[92px] right-8 z-30 w-[min(460px,calc(100%-56px))] rounded-2xl border border-line bg-white p-3 shadow-menu transition duration-180 ease-out",
        closing ? "translate-y-2 opacity-0" : "animate-[ai-bubble-in_160ms_ease-out] translate-y-0 opacity-100",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-[11px] leading-5 text-ink-primary">{answer}</p>
          {longAnswer ? (
            <button className="mt-2 rounded-full px-2 py-1 text-[11px] font-semibold text-brand-orange hover:bg-brand-hover hover:text-brand-dark" onClick={onOpenConversation}>
              Abrir en IA
            </button>
          ) : null}
          {onIntentAction ? (
            <AiPendingIntentActions
              intent={pendingIntent}
              onAction={onIntentAction}
              onOpenConversation={onOpenConversation}
              showConversationAction
            />
          ) : null}
          {onApplyEditProposal && onDiscardEditProposal ? (
            <AiEditProposalCard
              proposal={editProposal}
              staleOperationIds={staleEditOperationIds}
              blockedOperationReasons={blockedEditOperationReasons}
              appliedOperationIds={appliedEditOperationIds}
              compact
              onApply={onApplyEditProposal}
              onDiscard={onDiscardEditProposal}
              onOpenConversation={onOpenConversation}
            />
          ) : null}
        </div>
        <CountdownCloseButton
          ariaLabel="Cerrar respuesta IA"
          className="text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
          durationMs={10_000}
          onClose={onClose}
          resetKey={visibleBubble.id}
        />
      </div>
    </div>
  );
}
