import {FileText} from "lucide-react";

export function PreviewStatusState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-orange-100 bg-brand-hover text-brand-orange">
          <FileText size={18} />
        </div>
        <p className="mt-3 text-[13px] font-semibold text-ink-primary">{title}</p>
        <p className="mt-1 max-w-[360px] text-[11px] leading-5 text-ink-secondary">{message}</p>
        {actionLabel && onAction ? (
          <button className="mt-4 h-8 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white hover:bg-brand-dark" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
