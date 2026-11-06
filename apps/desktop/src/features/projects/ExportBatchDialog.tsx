import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getProjectTree } from "../../lib/api/projects";
import { getDocument } from "../../lib/api/documents";
import { getApiErrorMessage } from "../../lib/api/client";
import { getExportProfiles, changeExportProfiles, prepareExportBatch, getExportBatch, getExportBatches, deliverExportBatch, discardExportBatch, type ExportProfiles, type ExportBatch } from "../../lib/api/portabilityWorkspace";
import type { DocumentTreeNode } from "../../types/domain";
import type { StateTransitionAuthority, StateTransitionOutcome } from "../../types/stateMigrations";
const button = "min-h-11 max-w-full whitespace-normal rounded px-3 text-xs font-medium hover:bg-panel disabled:opacity-50";
function flatten(nodes: DocumentTreeNode[]) { const pending = [...nodes], result: DocumentTreeNode[] = []; let count = 0; while (pending.length) {
    const n = pending.shift()!;
    if (++count > 10000)
        throw Error("La lista supera10000 elementos; usa una selección menor.");
    if (n.type === "folder")
        pending.unshift(...(n.children ?? []));
    else if (/\.(?:md|markdown|knote)$/i.test(n.path ?? n.name))
        result.push(n);
} return result; }
export function ExportBatchDialog({ projectId, projectName, onClose, onBeforeChange, onSettled }: {
    projectId: string;
    projectName: string;
    onClose: () => void;
} & StateTransitionAuthority) {
    const [documents, setDocuments] = useState<DocumentTreeNode[]>([]), [profiles, setProfiles] = useState<ExportProfiles | null>(null), [jobs, setJobs] = useState<ExportBatch[]>([]), [selected, setSelected] = useState<string[]>([]), [format, setFormat] = useState("pdf"), [profile, setProfile] = useState(""), [name, setName] = useState(""), [cover, setCover] = useState(false), [contents, setContents] = useState(false), [job, setJob] = useState<ExportBatch | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [ack, setAck] = useState(false), [removeAck, setRemoveAck] = useState(false), [uncertain, setUncertain] = useState(false), [attempt, setAttempt] = useState(0);
    const gate = useRef(false), live = useRef(true);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    useEffect(() => { let current = true; setError(null); void Promise.all([getProjectTree(projectId), getExportProfiles(), getExportBatches(projectId)]).then(([tree, p, j]) => { if (current) {
        setDocuments(flatten(tree));
        setProfiles(p);
        setJobs(j);
    } }).catch(e => { if (current)
        setError(getApiErrorMessage(e, "No se pudieron cargar documentos, perfiles o preparaciones.")); }); return () => { current = false; }; }, [projectId, attempt]);
    async function run(task: () => Promise<void>) { if (gate.current)
        return; gate.current = true; setBusy(true); setError(null); try {
        await task();
    }
    catch (e) {
        if (live.current)
            setError(getApiErrorMessage(e, "El resultado no está confirmado. Consulta antes de repetir."));
    }
    finally {
        gate.current = false;
        if (live.current)
            setBusy(false);
    } }
    async function prepare() { let protectedState = false; let outcome: StateTransitionOutcome = { confirmed: false, message: "La preparación no está confirmada; consulta los lotes conservados." }; try {
        if (onBeforeChange) {
            await onBeforeChange();
            protectedState = true;
        }
        const inputs = [];
        for (const id of selected) {
            if (id.toLowerCase().endsWith(".knote")) {
                inputs.push({ id });
                continue;
            }
            const doc = await getDocument(id);
            const { prepareMermaidDiagramAssets } = await import("../editor/mermaidDiagrams");
            inputs.push({ id, markdown: doc.markdown, diagramAssets: format === "md" ? undefined : await prepareMermaidDiagramAssets(doc.markdown, "medium") });
        }
        const next = await prepareExportBatch(projectId, inputs, format, profile || null);
        outcome = { confirmed: true, message: "Lote preparado y revisado. Los documentos permanecen." };
        if (live.current) {
            setJob(next);
            setAck(false);
            setRemoveAck(false);
            setUncertain(false);
            setJobs(old => [next, ...old.filter(j => j.id !== next.id)]);
        }
    }
    finally {
        if (protectedState)
            onSettled?.(outcome);
    } }
    async function deliver() { if (!job || !ack)
        return; setUncertain(true); const next = await deliverExportBatch(job); if (live.current) {
        setJob(next);
        setUncertain(next.phase === "picking" || next.phase === "uncertain");
        setAck(false);
    } }
    async function check() { if (!job)
        return; const next = await getExportBatch(job.id); if (live.current) {
        setJob(next);
        setAck(false);
        setUncertain(next.phase === "picking" || next.phase === "uncertain");
    } }
    async function capture() { if (!profiles || !name.trim())
        return; const next = await changeExportProfiles(profiles, { action: "capture", id: "export-profile-" + crypto.randomUUID(), name: name.trim(), cover, contents }); if (live.current) {
        setProfiles(next);
        setName("");
        setProfile(next.profiles[next.profiles.length - 1]?.id ?? "");
    } }
    async function removeProfile() { if (!profiles || !profile)
        return; const next = await changeExportProfiles(profiles, { action: "remove", id: profile }); if (live.current) {
        setProfiles(next);
        setProfile("");
    } }
    async function discard() { if (!job || !removeAck)
        return; const next = await discardExportBatch(job); if (live.current) {
        setJob(next);
        setUncertain(false);
        setRemoveAck(false);
        setJobs(a => a.filter(j => j.id !== next.id));
    } }
    const canDeliver = job && ["prepared", "cancelled"].includes(job.phase) && !uncertain;
    return <ModalFrame label="Exportar documentos" onClose={() => { if (!busy)
        onClose(); }}><section aria-busy={busy} className="flex max-h-[calc(100dvh-24px)] w-full max-w-[680px] flex-col overflow-hidden rounded-lg bg-white shadow-menu"><header className="flex shrink-0 items-center justify-between gap-2 px-5 py-2"><h2 className="text-base font-semibold">Exportar documentos</h2><button className={button + " min-w-11"} disabled={busy} onClick={onClose} aria-label="Cerrar exportación de documentos">✕</button></header><div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 text-xs leading-5 [overflow-wrap:anywhere]"><p className="font-medium">{projectName}</p><p className="mt-2 text-ink-secondary">Un ZIP con los documentos y recursos revisados. Se incluyen contenidos guardados y borradores confirmados al preparar; una edición posterior no modifica ese lote. La preparación local se conserva hasta que la quites.</p>
 {!job && <><fieldset disabled={busy}><legend className="mt-3 font-medium">Documentos · {selected.length}/32</legend><div className="max-h-[25dvh] overflow-y-auto">{documents.map(doc => <label key={doc.id} className="flex min-h-11 items-center gap-2"><input className="accent-[#F37021]" type="checkbox" checked={selected.includes(doc.id)} disabled={busy || selected.length >= 32 && !selected.includes(doc.id)} onChange={e => setSelected(a => e.target.checked ? [...a, doc.id] : a.filter(id => id !== doc.id))}/><span>{doc.path ?? doc.name}</span></label>)}</div><div className="my-3 grid gap-3 sm:grid-cols-2"><label>Formato<select className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2" value={format} onChange={e => setFormat(e.target.value)}><option value="pdf">PDF · documentos y notas</option><option value="docx">Word · documentos Markdown</option><option value="md">Markdown y sus imágenes locales</option></select></label><label>Perfil<select value={profile} onChange={e => setProfile(e.target.value)} className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2"><option value="">Estilo actual</option>{profiles?.profiles.map(p => <option key={p.id} value={p.id}>{p.name}{p.cover ? " · portada" : ""}{p.contents ? " · índice" : ""}</option>)}</select></label></div></fieldset>
 <details className="my-3 rounded bg-panel p-3"><summary className="min-h-11 cursor-pointer font-medium">Guardar o retirar un perfil</summary><p className="mb-2 text-ink-secondary">Guarda el estilo actual con estas opciones. El índice enumera títulos; no inventa números de página. Las opciones de portada e índice se aplican a documentos Markdown.</p><label>Nombre<input className="mt-1 min-h-11 w-full rounded border border-line bg-white px-2" value={name} maxLength={100} disabled={busy} onChange={e => setName(e.target.value)}/></label><label className="flex min-h-11 items-center gap-2"><input disabled={busy} checked={cover} onChange={e => setCover(e.target.checked)} type="checkbox"/>Portada separada</label><label className="flex min-h-11 items-center gap-2"><input disabled={busy} checked={contents} onChange={e => setContents(e.target.checked)} type="checkbox"/>Índice de títulos</label><div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !name.trim() || !profiles} onClick={() => void run(capture)}>Guardar perfil actual</button><button className={button} disabled={busy || !profile || !profiles} onClick={() => void run(removeProfile)}>Retirar perfil seleccionado</button></div></details>
 {!!jobs.length && <details className="my-3"><summary className="min-h-11 cursor-pointer font-medium">Preparaciones conservadas ({jobs.length})</summary>{jobs.map(j => <button key={j.id} className={button + " block w-full text-left"} disabled={busy} onClick={() => { setJob(j); setAck(false); setRemoveAck(false); setUncertain(["picking", "uncertain"].includes(j.phase)); }}>{new Date(j.checkedAt).toLocaleString()} · {j.documents.length} documentos · {({ prepared: "Preparado", picking: "Destino pendiente", saved: "Entregado", cancelled: "Destino cancelado", uncertain: "Resultado pendiente", discarded: "Preparación retirada" })[j.phase]}</button>)}</details>}</>}
 {job && <><h3 className="mt-3 font-medium">Lote revisado · {job.documents.length} documentos</h3><p>{job.format.toUpperCase()} · {job.profileName ?? "Estilo actual"} · {(job.archiveBytes / 1024 ** 2).toFixed(1)} MiB</p><ul className="my-3 max-h-[25dvh] overflow-y-auto">{job.documents.map(d => <li key={d.filename} className="py-1">{d.filename}</li>)}</ul><p role="status">{job.phase === "saved" ? "Entrega confirmada." : job.phase === "discarded" ? "Preparación retirada. Los originales permanecen." : uncertain ? "Resultado pendiente. Comprueba el estado; no se repetirá la entrega." : job.phase === "cancelled" ? "Destino cancelado. El lote revisado sigue disponible." : "Preparación disponible; todavía no se ha entregado."}</p>{canDeliver && <label className="my-2 flex min-h-11 items-start gap-2"><input className="accent-[#F37021] mt-1" type="checkbox" checked={ack} disabled={busy} onChange={e => setAck(e.target.checked)}/><span>Entregar este lote revisado en un archivo nuevo</span></label>}
 {job.phase !== "discarded" && <details className="my-3 rounded bg-panel p-3"><summary className="min-h-11 cursor-pointer">Quitar esta preparación local</summary><label className="flex min-h-11 items-start gap-2"><input className="accent-[#F37021] mt-1" type="checkbox" checked={removeAck} disabled={busy} onChange={e => setRemoveAck(e.target.checked)}/><span>Retirar solo el ZIP local preparado; conservar documentos y entregas externas</span></label><button className={button} disabled={busy || !removeAck || job.phase === "picking"} onClick={() => void run(discard)}>Quitar preparación revisada</button></details>}</>}
 {busy && <p role="status" className="my-2">Preparando, comprobando o esperando destino…</p>}{error && <p role="alert" className="my-2 text-red-700">{error}</p>}
 </div><footer className="flex shrink-0 flex-wrap justify-end gap-2 px-5 py-3">{!job && <button className={button + " mr-auto"} disabled={busy} onClick={() => setAttempt(n => n + 1)}>Actualizar listas</button>}{job && <button className={button + " mr-auto"} disabled={busy} onClick={() => { setJob(null); setAck(false); setUncertain(false); setAttempt(n => n + 1); }}>Volver a documentos</button>}<button className={button} disabled={busy} onClick={onClose}>Volver</button>{!job && <button className={button + " bg-brand-orange text-white"} disabled={busy || !selected.length} onClick={() => void run(prepare)}>Preparar lote</button>}{job && <button className={button} disabled={busy} onClick={() => void run(check)}>Comprobar lote</button>}{canDeliver && <button className={button + " bg-brand-orange text-white"} disabled={busy || !ack} onClick={() => void run(deliver)}>Elegir destino y exportar</button>}</footer></section></ModalFrame>;
}
