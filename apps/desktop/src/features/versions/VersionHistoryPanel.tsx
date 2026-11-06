import {HistoryRestoreDialog} from "../history/HistoryRestoreDialog";
import type {StateTransitionAuthority} from "../../types/stateMigrations";
import {HistoryCollections} from "./HistoryCollections";
import type {HistoryGroupFilter} from "../../types/historyGroups";
import { CheckCircle2, FileText, Flag, Loader2, RefreshCw, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getDocumentHistorySnapshot, getVersionContent, removeVersionMilestone, saveVersionMilestone } from "../../lib/api/versions";
import { getApiErrorMessage } from "../../lib/api/client";
import type {HistoryCapability,HistoryMilestone,MilestoneState} from "../../types/history";
import type { VersionRecord } from "../../types/domain";

export type VersionPreviewMode = "diff" | "content";

export type VersionPreview = {
  documentId: string;
  version: VersionRecord;
  markdown: string;
  mode: VersionPreviewMode;
  comparison?: {version:VersionRecord;markdown:string};
};

type VersionHistoryPanelProps = StateTransitionAuthority & {
  documentId: string;
  documentName: string;
  activePreviewVersionId?: string | null;
  onPreviewChange: (preview: VersionPreview | null) => void;
  onClose: () => void;
  onMilestoneChange?: (versionId:string,milestone:HistoryMilestone|null)=>void;
  onConfigureProject?:()=>void;
  onReviewRemoteVersion?:()=>void;
};

const HISTORY_PAGE_SIZE = 20;

export function VersionHistoryPanel({
  documentId,
  documentName,
  activePreviewVersionId,
  onPreviewChange,
  onClose,
  onMilestoneChange,
  onConfigureProject,
  onReviewRemoteVersion,
  onBeforeChange,
  onSettled,
}: VersionHistoryPanelProps) {
  const [historyRestoreOpen,setHistoryRestoreOpen]=useState(false);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [collectionFilter,setCollectionFilter]=useState<(HistoryGroupFilter&{documentId:string})|null>(null);
  const [contentByVersion, setContentByVersion] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [milestones,setMilestones]=useState<MilestoneState>({status:"missing",revision:null,error:null});
  const [historyFailed,setHistoryFailed]=useState(false);
  const [historyCapability,setHistoryCapability]=useState<HistoryCapability|null>(null);
  const [comparisonIds,setComparisonIds]=useState<string[]>([]);
  const [comparisonBusy,setComparisonBusy]=useState(false);
  const [editingVersion,setEditingVersion]=useState<VersionRecord|null>(null);
  const [milestoneTitle,setMilestoneTitle]=useState("");
  const [milestoneBusy,setMilestoneBusy]=useState(false);
  const listInFlight=useRef(false);
  const markerInFlight=useRef(false);
  const comparisonInFlight=useRef(false);
  const markerSequence=useRef(0);
  const documentRef = useRef(documentId);
  documentRef.current = documentId;
  const listSequence = useRef(0);
  const previewSequence = useRef(0);
  const previousPreview = useRef(activePreviewVersionId);
  const orderedVersions = useMemo(() => sortVersionsDescending(versions), [versions]);
  const activeCollection=collectionFilter?.documentId===documentId?collectionFilter:null;
  const filteredVersions=activeCollection?orderedVersions.filter(version=>activeCollection.versionIds.includes(version.id)):orderedVersions;
  const visibleVersions = filteredVersions.slice(0, visibleCount);
  const hasMoreVersions = filteredVersions.length > visibleVersions.length;
  const outsideComparisonCount=activeCollection?comparisonIds.filter(id=>!filteredVersions.some(version=>version.id===id)).length:0;
  const selectedVersionId = loadingVersionId ?? activePreviewVersionId ?? orderedVersions.find((version) => version.current)?.id ?? orderedVersions[0]?.id ?? null;

  useEffect(() => {
    onPreviewChange(null);
    setHistoryRestoreOpen(false);
    setVersions([]);
    setLoadingVersionId(null);
    setContentByVersion({});
    setVisibleCount(HISTORY_PAGE_SIZE);
    setCollectionFilter(null);
    setComparisonIds([]);setComparisonBusy(false);setEditingVersion(null);setMilestoneBusy(false);setHistoryFailed(false);
    setMilestones({status:"missing",revision:null,error:null});
    setHistoryCapability(null);
    listInFlight.current=false;markerInFlight.current=false;comparisonInFlight.current=false;
    void loadVersions();
    return () => { listSequence.current++; previewSequence.current++;markerSequence.current++; };
  }, [documentId]);

  useEffect(()=>{
    if(previousPreview.current&&!activePreviewVersionId){
      previewSequence.current++;
      comparisonInFlight.current=false;setComparisonBusy(false);setLoadingVersionId(null);
    }
    previousPreview.current=activePreviewVersionId;
  },[activePreviewVersionId]);

  async function loadVersions() {
    if(listInFlight.current)return;
    listInFlight.current=true;
    const sequence = ++listSequence.current;
    const current = () => listSequence.current === sequence && documentRef.current === documentId;
    setLoadingVersions(true);
    try {
      setMessage(null);
      const snapshot = await getDocumentHistorySnapshot(documentId);
      if (!current()) return;
      setVersions(snapshot.versions);setMilestones(snapshot.milestones);setHistoryCapability(snapshot.history??null);setHistoryFailed(false);
      setVisibleCount(HISTORY_PAGE_SIZE);
    } catch(error) {
      if (!current()) return;
      setHistoryFailed(true);
      setMessage(getApiErrorMessage(error,"No se pudo cargar el historial de este documento."));
    } finally {
      if (current()) {setLoadingVersions(false);listInFlight.current=false;}
    }
  }

  async function handleSelectVersion(version: VersionRecord) {
    if(comparisonInFlight.current)return;
    const sequence = ++previewSequence.current;
    const current = () => previewSequence.current === sequence && documentRef.current === documentId;
    setMessage(null);

    const cached = contentByVersion[version.id];
    if (cached !== undefined) {
      setLoadingVersionId(null);
      onPreviewChange({ documentId, version, markdown: cached, mode: "diff" });
      return;
    }

    setLoadingVersionId(version.id);
    try {
      const response = await getVersionContent(documentId, version.id);
      if (!current()) return;
      setContentByVersion((currentContent) => ({ ...currentContent, [version.id]: response.markdown }));
      onPreviewChange({ documentId, version, markdown: response.markdown, mode: "diff" });
    } catch {
      if (current()) setMessage("No se pudo cargar el contenido de esa versión.");
    } finally {
      if (current()) setLoadingVersionId(null);
    }
  }

  async function compareSelectedVersions(){
    if(comparisonInFlight.current||comparisonIds.length!==2)return;
    const sequence=++previewSequence.current;
    const current=()=>previewSequence.current===sequence&&documentRef.current===documentId;
    const selected=comparisonIds.map(id=>orderedVersions.find(version=>version.id===id));
    if(!selected[0]||!selected[1])return;
    comparisonInFlight.current=true;setComparisonBusy(true);setLoadingVersionId(null);setMessage(null);
    try{
      const [left,right]=await Promise.all(selected.map(async version=>contentByVersion[version!.id]??(await getVersionContent(documentId,version!.id)).markdown));
      if(!current())return;
      setContentByVersion(cache=>({...cache,[selected[0]!.id]:left,[selected[1]!.id]:right}));
      onPreviewChange({documentId,version:selected[0],markdown:left,mode:"diff",comparison:{version:selected[1],markdown:right}});
    }catch(error){if(current())setMessage(getApiErrorMessage(error,"No se pudieron comparar las versiones. El documento abierto se conserva."));}
    finally{if(current()){setComparisonBusy(false);comparisonInFlight.current=false;}}
  }

  async function changeMilestone(remove=false){
    if(!editingVersion||markerInFlight.current||milestones.status==="unavailable")return;
    const selected=editingVersion;const title=milestoneTitle.trim();
    if(!remove&&!title)return;
    markerInFlight.current=true;setMilestoneBusy(true);setMessage(null);
    const sequence=++markerSequence.current;
    const current=()=>markerSequence.current===sequence&&documentRef.current===documentId;
    try{
      const response=remove ? await removeVersionMilestone(documentId,selected.id,milestones.revision) : await saveVersionMilestone(documentId,selected.id,title,milestones.revision);
      if(!current())return;
      setVersions(items=>items.map(version=>version.id===selected.id?{...version,milestone:response.milestone}:version));
      setMilestones({status:response.revision?"ready":"missing",revision:response.revision,error:null});
      onMilestoneChange?.(selected.id,response.milestone);setEditingVersion(null);
    }catch(error){
      if(!current())return;
      setMessage(getApiErrorMessage(error,"No se pudo confirmar el nombre del hito. Se conserva el texto para reintentar."));
      // A lost acknowledgement is reconciled by reading, never by replaying.
      try{
        const observed=await getDocumentHistorySnapshot(documentId);if(!current())return;
        setVersions(observed.versions);setMilestones(observed.milestones);setHistoryCapability(observed.history??null);
        const marker=observed.versions.find(version=>version.id===selected.id)?.milestone??null;
        if(observed.milestones.status!=="unavailable"&&(remove ? !marker : marker?.title===title)){
          onMilestoneChange?.(selected.id,marker);setEditingVersion(null);
          setMessage(remove?"El nombre de hito ya está retirado. La versión se conserva.":"El nombre de hito está guardado.");
        }
      }catch{/* Preserve the original failure and the pending text. */}
    }finally{if(current()){markerInFlight.current=false;setMilestoneBusy(false);}}
  }

  const lastVersion = orderedVersions[0] ?? null;

  return (
    <aside className="flex w-full shrink-0 flex-col border-l border-line bg-white">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink-primary">Historial</h2>
            <p className="mt-1 truncate text-[11px] text-ink-secondary">{documentName}</p>
            <p className="mt-1 text-[11px] text-ink-secondary">
              {orderedVersions.length > 0
                ? `${orderedVersions.length} ${orderedVersions.length === 1 ? "versión" : "versiones"} · última ${formatRelativeOrDate(lastVersion)}`
                : loadingVersions ? "Consultando versiones…" : historyFailed ? "Consulta no disponible" : historyCapability?.status==="unavailable" ? "No disponible en este dispositivo" : historyCapability?.status==="disabled" ? "Sin creación automática de versiones" : "Sin versiones guardadas"}
            </p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar historial">
            <X size={17} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button className="min-h-11 rounded-md px-2 text-xs font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" disabled={historyCapability?.status==="unavailable"} onClick={()=>setHistoryRestoreOpen(true)}>Restaurar archivo histórico…</button>
          {orderedVersions.length>0&&<button className="min-h-11 rounded-md px-2 text-xs font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" disabled={!selectedVersionId||!!loadingVersionId||milestoneBusy||loadingVersions||milestones.status==="unavailable"} onClick={()=>{const selected=orderedVersions.find(version=>version.id===selectedVersionId);if(selected){setEditingVersion(selected);setMilestoneTitle(selected.milestone?.title??"");setMessage(null);}}}>Nombrar hito</button>}
          <button className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-md hover:bg-panel disabled:opacity-50" aria-label="Actualizar historial" disabled={loadingVersions||milestoneBusy||comparisonBusy} onClick={()=>void loadVersions()}><RefreshCw size={15}/></button>
        </div>
        {activeCollection&&<div className="mt-2 flex min-h-11 items-center gap-2 text-xs"><div className="min-w-0 flex-1"><p title={activeCollection.title} className="truncate font-medium">{activeCollection.title}</p><p className="text-[11px] text-ink-secondary">{filteredVersions.length}/{orderedVersions.length} versiones</p></div><button aria-label="Ver todo el historial" title="Ver todo el historial" className="grid min-h-11 min-w-11 place-items-center rounded text-brand-dark hover:bg-brand-hover" onClick={()=>{setCollectionFilter(null);setVisibleCount(HISTORY_PAGE_SIZE);}}><X size={14}/></button></div>}
        {editingVersion&&<form className="mt-2 space-y-2 rounded-md bg-panel p-3" onSubmit={event=>{event.preventDefault();void changeMilestone();}}>
          <p className="text-xs font-semibold">Hito de {editingVersion.hash}</p>
          <p className="text-xs leading-5 text-ink-secondary">Nombra esta versión guardada. El documento abierto y sus cambios se conservan.</p>
          <label className="block text-xs">Nombre del hito<input autoFocus maxLength={120} value={milestoneTitle} disabled={milestoneBusy} onChange={event=>setMilestoneTitle(event.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-line bg-white px-2"/></label>
          <div className="flex flex-wrap gap-1">
            <button className="min-h-11 rounded px-2 text-xs font-semibold text-brand-orange disabled:opacity-50" disabled={milestoneBusy||!milestoneTitle.trim()||milestones.status==="unavailable"}>{milestoneBusy?"Guardando…":"Guardar nombre"}</button>
            {editingVersion.milestone&&<button type="button" disabled={milestoneBusy||milestones.status==="unavailable"} className="min-h-11 rounded px-2 text-xs text-ink-secondary" onClick={()=>void changeMilestone(true)}>Quitar nombre</button>}
            <button type="button" disabled={milestoneBusy} className="min-h-11 rounded px-2 text-xs text-ink-secondary" onClick={()=>setEditingVersion(null)}>Cancelar</button>
          </div>
        </form>}
        {orderedVersions.length>0&&historyCapability?.reason&&<p className="mt-2 text-xs leading-5 text-ink-secondary">{historyCapability.reason}</p>}
        {milestones.error&&<p role="alert" className="mt-2 text-xs leading-5 text-orange-900">Los nombres de hitos no están disponibles. {milestones.error} Las versiones se conservan.</p>}
        {orderedVersions.length>=2&&<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-secondary">{comparisonIds.length}/2 elegidas</span>
          <button aria-label="Comparar versiones" className="min-h-11 rounded-md px-2 font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-50" disabled={comparisonIds.length!==2||comparisonBusy||milestoneBusy} onClick={()=>void compareSelectedVersions()}>{comparisonBusy?"Preparando…":"Comparar"}</button>
          {!!comparisonIds.length&&<button aria-label="Limpiar selección" title="Limpiar selección" className="grid min-h-11 min-w-11 place-items-center rounded text-ink-secondary hover:bg-panel" disabled={comparisonBusy} onClick={()=>setComparisonIds([])}><X size={14}/></button>}
        </div>}
        {outsideComparisonCount>0&&<p className="mt-1 text-[11px] leading-5 text-ink-secondary">{outsideComparisonCount} {outsideComparisonCount===1?"versión elegida":"versiones elegidas"} fuera de esta colección.</p>}
        {activePreviewVersionId && <button className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-brand-orange hover:bg-brand-hover" onClick={()=>{previewSequence.current++;comparisonInFlight.current=false;setComparisonBusy(false);setLoadingVersionId(null);onPreviewChange(null);}}><FileText size={15}/>Volver al documento abierto</button>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {onReviewRemoteVersion&&<details className="mb-2 text-xs"><summary className="min-h-11 cursor-pointer py-3 font-medium">Versión remota</summary><p className="leading-5 text-ink-secondary">Compara con la última versión remota disponible en este dispositivo. No consulta cambios nuevos ni resuelve la sincronización del proyecto.</p><button type="button" className="mt-1 min-h-11 w-full rounded-md px-2 text-left font-medium hover:bg-brand-hover" onClick={onReviewRemoteVersion}>Comparar con remoto conocido</button></details>}
        {orderedVersions.length>0&&<HistoryCollections key={documentId} documentId={documentId} versionId={selectedVersionId} versionLabel={orderedVersions.find(version=>version.id===selectedVersionId)?.milestone?.title??orderedVersions.find(version=>version.id===selectedVersionId)?.title??selectedVersionId?.slice(0,8)??""} selectedGroupId={activeCollection?.id??""} onFilter={filter=>{setCollectionFilter(filter?{...filter,documentId}:null);setVisibleCount(HISTORY_PAGE_SIZE);}}/>}
        {activeCollection&&!filteredVersions.length&&<p role="status" className="my-3 text-xs leading-5 text-ink-secondary">Esta colección no contiene versiones disponibles del documento actual. Todas las versiones siguen en el historial.</p>}

        {message ? (
          <div role="status" className="mb-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] leading-5 text-ink-secondary">
            {message}
          </div>
        ) : null}

        {loadingVersions && !orderedVersions.length ? (
          <PanelState icon={<Loader2 size={16} className="animate-spin" />} title="Cargando historial" />
        ) : historyFailed&&!orderedVersions.length ? <PanelState icon={<FileText size={16}/>} title="Historial no disponible" detail="El documento se conserva. Actualiza el historial para volver a consultarlo."/>  : orderedVersions.length === 0 && historyCapability && historyCapability.status!=="ready" ? (
          <div><PanelState icon={<FileText size={16}/>} title={historyCapability.status==="unavailable"?"Historial no disponible aquí":historyCapability.status==="disabled"?"Historial automático desactivado":"Historial local sin preparar"} detail={historyCapability.reason??"Tus archivos y borradores se conservan."}/>
          {historyCapability.canConfigure&&onConfigureProject&&<button className="min-h-11 w-full rounded px-3 text-xs font-semibold text-brand-orange hover:bg-brand-hover" onClick={onConfigureProject}>Revisar ajustes del proyecto</button>}</div>
        ) : orderedVersions.length === 0 ? (
          <PanelState
            icon={<FileText size={16} />}
            title="Este documento aún no tiene versiones"
            detail="Con el historial local activado, tus guardados aparecerán aquí. Funciona sin conexión."
          />
        ) : (
          <section className="space-y-2">
            {visibleVersions.map((version, index) => {
              const previousVersion = visibleVersions[index - 1] ?? null;
              const showDateSeparator = getVersionGroupKey(version) !== getVersionGroupKey(previousVersion);
              return (
                <Fragment key={version.id}>
                  {showDateSeparator ? <DateSeparator version={version} /> : null}
                  <div className="flex items-center gap-1">
                  <label className="grid min-h-11 min-w-11 shrink-0 place-items-center"><input type="checkbox" className="accent-brand-orange" aria-label={`Seleccionar para comparar ${version.milestone?.title??version.title}`} checked={comparisonIds.includes(version.id)} disabled={comparisonBusy||(!comparisonIds.includes(version.id)&&comparisonIds.length>=2)} onChange={event=>setComparisonIds(ids=>event.target.checked?[...ids,version.id]:ids.filter(id=>id!==version.id))}/></label>
                  <VersionRow
                    version={version}
                    selected={version.id === selectedVersionId}
                    loading={version.id === loadingVersionId}
                    onSelect={() => void handleSelectVersion(version)}
                  />
                  </div>
                </Fragment>
              );
            })}
            {hasMoreVersions ? (
              <button
                className="mt-2 min-h-11 w-full rounded-md border border-line bg-white text-[11px] font-semibold text-ink-secondary hover:bg-panel hover:text-ink-primary"
                onClick={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
              >
                Ver más
              </button>
            ) : null}
          </section>
        )}
      </div>
      {historyRestoreOpen&&<HistoryRestoreDialog key={documentId} projectId={documentId.split("::")[0]} documentId={documentId} versionId={selectedVersionId??undefined} onClose={()=>setHistoryRestoreOpen(false)} onBeforeChange={onBeforeChange} onSettled={outcome=>{onSettled?.(outcome);void loadVersions();}}/>}
    </aside>
  );
}

function VersionRow({
  version,
  selected,
  loading,
  onSelect,
}: {
  version: VersionRecord;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={[
        "group grid min-h-[60px] min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 py-2 text-left transition",
        selected ? "border-brand-orange bg-brand-hover" : "border-transparent hover:border-line hover:bg-panel",
      ].join(" ")}
      onClick={onSelect}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-ink-primary" title={version.milestone?.title??version.title}>{version.milestone?.title ?? (version.title || "Versión guardada")}</span>
        {version.milestone&&<span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-orange"><Flag size={11}/>Hito</span>}
        <span className="mt-1 block truncate text-[10px] text-ink-secondary" title={`${formatVersionLongDateTime(version)} · ${version.author}`}>{formatVersionLongDateTime(version)} · {version.author}</span>
        {version.current ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-brand-orange">
            <CheckCircle2 size={10} />
            Última versión
          </span>
        ) : null}
      </span>
      <span className="self-center font-mono text-[10px] text-ink-secondary">
        {loading ? <Loader2 size={12} className="animate-spin" /> : shortHash(version.hash)}
      </span>
    </button>
  );
}

function DateSeparator({ version }: { version: VersionRecord }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center justify-center py-1">
      <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-secondary shadow-subtle">
        {formatVersionGroupLabel(version)}
      </span>
    </div>
  );
}

function PanelState({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center text-ink-secondary">
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-md bg-panel text-ink-secondary">{icon}</div>
      <div className="text-[12px] font-semibold text-ink-primary">{title}</div>
      {detail ? <p className="mt-1 max-w-[260px] text-[11px] leading-5">{detail}</p> : null}
    </div>
  );
}

function formatRelativeOrDate(version: VersionRecord | null) {
  if (!version) return "";
  return version.relativeTime || formatShortDate(version);
}

export function formatVersionShortDate(version: VersionRecord) {
  return formatShortDate(version);
}

export function formatVersionFullDate(version: VersionRecord) {
  return formatFullDate(version);
}

function formatShortDate(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return version.relativeTime || "Sin fecha";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatVersionLongDateTime(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return version.relativeTime || "Sin fecha";
  const fullDate = new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${fullDate} · ${time}`;
}

function formatVersionGroupLabel(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return "Sin fecha";
  const today = startOfLocalDay(new Date());
  const versionDay = startOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - versionDay.getTime()) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  const currentWeekStart = startOfLocalWeek(today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  if (versionDay >= currentWeekStart) return "Esta semana";
  if (versionDay >= previousWeekStart && versionDay < currentWeekStart) return "Semana pasada";
  return formatVersionMonth(date);
}

function formatFullDate(version: VersionRecord) {
  const date = parseVersionDate(version);
  if (!date) return version.relativeTime || "fecha no disponible";
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseVersionDate(version: VersionRecord) {
  if (!version.createdAt) return null;
  const date = new Date(version.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getVersionGroupKey(version: VersionRecord | null) {
  const date = version ? parseVersionDate(version) : null;
  if (!date) return "unknown";
  const today = startOfLocalDay(new Date());
  const versionDay = startOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - versionDay.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  const currentWeekStart = startOfLocalWeek(today);
  const previousWeekStart = addDays(currentWeekStart, -7);
  if (versionDay >= currentWeekStart) return "this-week";
  if (versionDay >= previousWeekStart && versionDay < currentWeekStart) return "last-week";
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function sortVersionsDescending(versions: VersionRecord[]) {
  return [...versions].sort((left, right) => {
    const rightTime = parseVersionDate(right)?.getTime() ?? 0;
    const leftTime = parseVersionDate(left)?.getTime() ?? 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    if (right.current !== left.current) return right.current ? 1 : -1;
    return right.id.localeCompare(left.id);
  });
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(startOfLocalDay(date), mondayOffset);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + days);
  return nextDate;
}

function formatVersionMonth(date: Date) {
  const month = new Intl.DateTimeFormat("es", { month: "long" }).format(date);
  return `${month} ${date.getFullYear()}`;
}

function shortHash(hash: string) {
  return hash.length > 8 ? hash.slice(0, 8) : hash;
}
