import { useState } from "react";
import { checkModelAccess } from "../../lib/api/recordings";
export function ModelAccessCheck({ model }: { model: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="my-2 text-xs text-ink-secondary">
      <button
        type="button"
        disabled={busy}
        className="min-h-11 text-brand-orange"
        onClick={async () => {
          setBusy(true);
          try {
            const result = await checkModelAccess(model);
            setMessage(
              `${result.accountVisible ? "Modelo visible en la cuenta" : "Modelo no visible o acceso denegado"} (HTTP ${result.httpStatus}). ${result.message}`,
            );
          } catch (e) {
            setMessage(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Comprobando…" : "Comprobar acceso al modelo"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
