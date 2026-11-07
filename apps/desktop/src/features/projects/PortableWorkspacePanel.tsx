import { useRef, useState } from "react";
import { workspaceFamilies, reviewWorkspace, applyWorkspace, type WorkspaceReview } from "../../lib/api/portabilityWorkspace";
import { getApiErrorMessage } from "../../lib/api/client";
import type { StateTransitionAuthority } from "../../types/stateMigrations";
const names: Record<string, string> = { groups: "Colecciones de versiones", milestones: "Hitos", favorites: "Favoritos", exportStyle: "Estilo de exportación", exportProfiles: "Perfiles de exportación" };
export function PortableWorkspacePanel({ projectId, onBeforeChange, onSettled }: {
    projectId: string;
} & StateTransitionAuthority) { const [selected, setSelected] = useState<string[]>([]), [review, setReview] = useState<WorkspaceReview | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState(""); const gate = useRef(false); const button = "min-h-11 rounded px-3 font-medium hover:bg-panel disabled:opacity-50"; async function run(apply: boolean) { if (gate.current)
    return; gate.current = true; setBusy(true); setError(null); let protectedState = false; try {
    if (apply && review) {
        if (!onBeforeChange || !onSettled)
            return;
        await onBeforeChange();
        protectedState = true;
        await applyWorkspace(review);
        setNotice("Datos del trabajo incorporados. Los documentos y las copias de origen permanecen.");
        setReview(null);
        setConfirmed(false);
        onSettled({ confirmed: true, message: "Datos del trabajo incorporados." });
        protectedState = false;
    }
    else {
        setReview(await reviewWorkspace(projectId, selected));
        setConfirmed(false);
    }
}
catch (e) {
    setReview(null);
    setConfirmed(false);
    setError(getApiErrorMessage(e, "El resultado requiere otra revisión; no se ha repetido la incorporación."));
}
finally {
    if (protectedState)
        onSettled?.({ confirmed: false, message: "La incorporación puede ser parcial; consulta las familias antes de repetir." });
    gate.current = false;
    setBusy(false);
} } return <details className="my-3 rounded bg-panel p-3"><summary className="min-h-11 cursor-pointer font-medium">Colecciones y datos del trabajo portable</summary><p className="my-2 text-ink-secondary">Elige qué incorporar. Las anotaciones existentes se conservan; las colecciones con el mismo nombre reciben otro nombre. El estilo elegido sustituye el actual. Conversación, contexto, resultados e investigaciones permanecen como copias en Archivo KnowNext, sin activar sesiones ni envíos.</p><fieldset disabled={busy}>{workspaceFamilies.map(id => <label className="flex min-h-11 items-center gap-2" key={id}><input className="accent-[#F37021]" type="checkbox" checked={selected.includes(id)} onChange={e => { setSelected(a => e.target.checked ? [...a, id] : a.filter(x => x !== id)); setReview(null); setConfirmed(false); }}/>{names[id]}</label>)}</fieldset>{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}{review && <><ul>{review.items.map(row => <li key={row.id}>{names[row.id]} · {row.changed ? "Se incorporará" : "Ya coincide"}</li>)}</ul><label className="flex min-h-11 items-start gap-2"><input className="mt-1 accent-[#F37021]" type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>Confirmo las familias y la conservación del resto del trabajo</span></label></>}<div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !selected.length} onClick={() => void run(false)}>Revisar datos del trabajo</button>{review && <button className={button + " bg-brand-orange text-white"} disabled={busy || !confirmed || !onBeforeChange || !onSettled} onClick={() => void run(true)}>Incorporar datos revisados</button>}</div></details>; }
