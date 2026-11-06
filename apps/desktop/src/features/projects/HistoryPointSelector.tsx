import { useEffect, useRef, useState } from "react";
import { getHistoryPoints, selectHistoryPoint, type HistoryPoints } from "../../lib/api/portabilityWorkspace";
import { getApiErrorMessage } from "../../lib/api/client";
import type { StateTransitionAuthority } from "../../types/stateMigrations";
const button = "min-h-11 rounded px-3 font-medium hover:bg-panel disabled:opacity-50";
export function HistoryPointSelector({ projectId, onBeforeChange, onSettled }: {
    projectId: string;
} & StateTransitionAuthority) { const [open, setOpen] = useState(false), [value, setValue] = useState<HistoryPoints | null>(null), [choice, setChoice] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState(0), [notice, setNotice] = useState(false); const live = useRef(true), gate = useRef(false); useEffect(() => { live.current = true; return () => { live.current = false; }; }, []); useEffect(() => { if (!open)
    return; setValue(null); let current = true; setError(null); void getHistoryPoints(projectId).then(v => { if (current) {
    setValue(v);
    setChoice(v.selectedTip);
} }).catch(e => { if (current)
    setError(getApiErrorMessage(e, "No se pudieron consultar los puntos.")); }); return () => { current = false; }; }, [open, attempt, projectId]); async function apply() { if (!value || value.projectId !== projectId || gate.current)
    return; gate.current = true; setBusy(true); setError(null); let protectedState = false; try {
    await onBeforeChange?.();
    protectedState = !!onBeforeChange;
    const v = await selectHistoryPoint(value, choice);
    if (live.current) {
        setValue(v);
        setNotice(true);
    }
    onSettled?.({ confirmed: true, message: "Punto de consulta confirmado." });
    protectedState = false;
}
catch (e) {
    if (live.current) {
        setValue(null);
        setError(getApiErrorMessage(e, "Consulta el historial antes de repetir la selección."));
    }
}
finally {
    if (protectedState)
        onSettled?.({ confirmed: false, message: "Consulta el historial antes de repetir la selección." });
    gate.current = false;
    if (live.current)
        setBusy(false);
} } async function more() { if (!value || value.projectId !== projectId || gate.current)
    return; gate.current = true; setBusy(true); try {
    const next = await getHistoryPoints(projectId, value.offset + 50);
    if (next.revision !== value.revision)
        throw Error("El historial cambió; vuelve a consultar.");
    if (live.current)
        setValue({ ...next, points: [...value.points, ...next.points] });
}
catch (e) {
    if (live.current)
        setError(getApiErrorMessage(e, "No se pudo ampliar la lista."));
}
finally {
    gate.current = false;
    if (live.current)
        setBusy(false);
} } return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="my-3 rounded bg-panel p-3"><summary className="min-h-11 cursor-pointer font-medium">Punto de consulta del historial</summary><p className="my-2 text-ink-secondary">Consultar otras versiones no cambia archivos, índice ni punto de guardado. Una versión nueva vuelve a mostrar el historial actual; las fuentes incorporadas se conservan.</p>{error && <p role="alert">{error}</p>}{notice && <p role="status">Punto de consulta confirmado.</p>}{value && <><label className="flex min-h-11 items-center gap-2"><input className="accent-[#F37021]" type="radio" checked={choice === null} onChange={() => setChoice(null)} name="history-point"/>Seguir versiones actuales</label><div className="max-h-[26dvh] overflow-y-auto">{value.points.map(p => <label key={p.id} className="flex min-h-11 items-start gap-2 py-2"><input className="mt-1 accent-[#F37021]" type="radio" name="history-point" checked={choice === p.id} onChange={() => setChoice(p.id)}/><span>{p.title}<span className="block text-ink-secondary">{new Date(p.date).toLocaleDateString()} · {p.author}</span></span></label>)}</div>{value.hasMore && <button className={button} disabled={busy} onClick={() => void more()}>Más versiones</button>}{value.selectionExpired && <p>El punto local cambió. Se muestran las versiones actuales.</p>}<button className={button + " bg-brand-orange text-white"} disabled={busy || !onBeforeChange || !onSettled} onClick={() => void apply()}>Consultar estas versiones</button></>}<button className={button} disabled={busy} onClick={() => { setNotice(false); setAttempt(n => n + 1); }}>Actualizar puntos</button></details>; }
