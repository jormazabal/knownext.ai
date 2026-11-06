import { RotateCcw } from "lucide-react";

export function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-orange-50 px-4 py-3 text-sm text-ink-primary">
    <span>{message}</span><button type="button" onClick={onRetry} className="flex min-h-11 items-center gap-2 rounded-md px-3 font-medium hover:bg-orange-100"><RotateCcw size={16}/>Volver a intentar</button>
  </div>;
}
