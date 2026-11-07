import { useState } from "react";
import { checkModelAccess } from "../../lib/api/recordings";
export function ModelAccessCheck({ model,language="es" }: { model: string;language?:"es"|"en" }) {
  const t=(es:string,en:string)=>language==="en"?en:es;
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
              `${result.accountVisible ? t("Modelo visible en la cuenta","Model visible in the account") : t("Modelo no visible o acceso denegado","Model unavailable or access denied")} (HTTP ${result.httpStatus}). ${result.message}`,
            );
          } catch (e) {
            setMessage(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("Comprobando…","Checking…") : t("Comprobar acceso al modelo","Check model access")}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
