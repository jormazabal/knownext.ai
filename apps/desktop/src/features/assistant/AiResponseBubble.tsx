import { X } from "lucide-react";
import { useEffect, useState } from "react";

type AiResponseBubbleProps = {
  bubble: { id: string; answer: string } | null;
  onClose: () => void;
  onOpenConversation: () => void;
};

export function AiResponseBubble({ bubble, onClose, onOpenConversation }: AiResponseBubbleProps) {
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
        "pointer-events-auto absolute bottom-[92px] right-8 z-30 w-[min(460px,calc(100%-56px))] rounded-md border border-line bg-white p-3 shadow-menu transition duration-180 ease-out",
        closing ? "translate-y-2 opacity-0" : "animate-[ai-bubble-in_160ms_ease-out] translate-y-0 opacity-100",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-[11px] leading-5 text-ink-primary">{answer}</p>
          {longAnswer ? (
            <button className="mt-2 text-[11px] font-semibold text-brand-orange hover:text-brand-dark" onClick={onOpenConversation}>
              Abrir en IA
            </button>
          ) : null}
        </div>
        <button
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
          aria-label="Cerrar respuesta IA"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
