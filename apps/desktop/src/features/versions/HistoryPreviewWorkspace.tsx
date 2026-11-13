import { ArrowLeft, ArrowLeftRight, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { ReadonlyMarkdownViewer } from "../editor/ReadonlyMarkdownViewer";
import { useElementSize } from "../documentPreview/useElementSize";
import { compareHistory, type DiffOperation, type SideBySideDiffRow } from "./historyDiff";
import { formatVersionFullDate, type VersionPreview, type VersionPreviewMode } from "./VersionHistoryPanel";
import "./HistoryPreviewWorkspace.css";

export function HistoryPreviewWorkspace({ preview, currentMarkdown, markdownZoomPercent, onModeChange, onRestore, onRestoreParts, onBackToCurrent, onSwap, resolveImageSource }: {
  preview: VersionPreview; currentMarkdown: string; markdownZoomPercent: number;
  onModeChange: (mode: VersionPreviewMode) => void; onRestore: () => void;
  onBackToCurrent: () => void; onSwap: () => void;
  onRestoreParts?:()=>void;
  resolveImageSource?:(source:string)=>string;
}) {
  const [presentation, setPresentation] = useState("auto");
  const [contentSide, setContentSide] = useState("left");
  const [ref, size] = useElementSize<HTMLDivElement>();
  const rightMarkdown = preview.comparison?.markdown ?? currentMarkdown;
  const leftLabel = `${preview.version.milestone?.title ?? preview.version.title ?? "Versión guardada"} · ${preview.version.hash}`;
  const rightLabel = preview.comparison ? `${preview.comparison.version.milestone?.title ?? preview.comparison.version.title ?? "Versión guardada"} · ${preview.comparison.version.hash}` : "Documento abierto · incluye cambios sin guardar";
  const diff = useMemo(() => preview.mode === "diff" ? compareHistory(preview.markdown, rightMarkdown) : null, [preview.markdown, rightMarkdown, preview.mode]);
  const unified = presentation === "unified" || (presentation === "auto" && size.width < 640);
  const button = "min-h-11 rounded-md px-3 text-xs font-semibold hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-orange";
  return <div ref={ref} className="knownext-history-workspace min-w-0 space-y-4" aria-label="Consulta del historial">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} onClick={onBackToCurrent}><ArrowLeft size={14} className="mr-2 inline"/>Volver al documento</button>
        <span className="ml-auto text-xs text-ink-secondary">Solo lectura · borrador conservado</span>
      </div>
      <h2 className="text-lg font-semibold text-ink-primary">{preview.comparison ? "Comparar versiones" : "Comparar con el documento abierto"}</h2>
      <div className="grid gap-2 text-xs leading-5 sm:grid-cols-2">
        <div className="min-w-0"><span className="font-semibold">A · {leftLabel}</span><p className="text-ink-secondary">{formatVersionFullDate(preview.version)}</p></div>
        <div className="min-w-0"><span className="font-semibold">B · {rightLabel}</span>{preview.comparison&&<p className="text-ink-secondary">{formatVersionFullDate(preview.comparison.version)}</p>}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
        <button className={button} aria-pressed={preview.mode==="diff"} onClick={()=>onModeChange("diff")}>Cambios</button>
        <button className={button} aria-pressed={preview.mode==="content"} onClick={()=>onModeChange("content")}>Contenido completo</button>
        {preview.comparison&&<button className={button} onClick={onSwap}><ArrowLeftRight size={14} className="mr-2 inline"/>Intercambiar A y B</button>}
        <button className={`${button} ml-auto text-brand-orange`} onClick={onRestore}><RotateCcw size={14} className="mr-2 inline"/>Restaurar A · {preview.version.hash}</button>
        {onRestoreParts&&<button className={`${button} text-brand-dark`} onClick={onRestoreParts}>Elegir partes de A</button>}
      </div>
    </header>
    {preview.mode==="content" ? <section>
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold">Contenido de<select className="min-h-11 max-w-full rounded-md border border-line bg-white px-2" value={contentSide} onChange={event=>setContentSide(event.target.value)}><option value="left">A · {leftLabel}</option><option value="right">B · {rightLabel}</option></select></label>
      <div className="mt-3" key={`${preview.documentId}-${contentSide}-${preview.version.id}-${preview.comparison?.version.id??"current"}`}><ReadonlyMarkdownViewer markdown={contentSide==="left"?preview.markdown:rightMarkdown} ariaLabel="Contenido de la versión seleccionada" emptyMessage="Esta versión no tiene contenido." zoomPercent={markdownZoomPercent} resolveImageSource={resolveImageSource}/></div>
    </section> : diff?.status==="limited" ? <section role="status" className="rounded-md bg-panel p-4 text-sm leading-6"><p>{diff.reason}</p><button className={`${button} mt-2 text-brand-orange`} onClick={()=>onModeChange("content")}>Consultar contenido completo</button></section> : diff?.status==="ready" ? <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>{diff.added===0&&diff.removed===0?"Sin diferencias de líneas.":`${diff.removed} líneas retiradas · ${diff.added} añadidas de A a B`}</p>
        <label className="flex items-center gap-2">Vista<select className="min-h-11 rounded border border-line bg-white px-2" value={presentation} onChange={event=>setPresentation(event.target.value)}><option value="auto">Adaptable</option><option value="unified">Unificada</option><option value="columns">Dos columnas</option></select></label>
      </div>
      {diff.unified.length>0&&<p className="mb-2 text-xs text-ink-secondary">− retirado en A · + añadido en B · se omite contexto sin cambios</p>}
      <div className="font-mono text-xs leading-6" aria-label="Diferencias de A a B">
        {unified ? diff.unified.map((line,index)=><UnifiedRow key={index} line={line}/>) : <div className="knownext-history-columns"><div className="grid grid-cols-2"><div className="bg-panel px-3 py-2 font-semibold">A · {preview.version.hash}</div><div className="bg-panel px-3 py-2 font-semibold">B · {preview.comparison?.version.hash??"Documento abierto"}</div>{diff.columns.map((row,index)=><ColumnRow key={index} row={row}/>)}</div></div>}
      </div>
    </section> : null}
  </div>;
}

function ColumnRow({row}:{row:SideBySideDiffRow}) {
  if(row.type==="skip")return <><div className="bg-panel px-3 text-ink-secondary">…</div><div className="bg-panel px-3 text-ink-secondary">…</div></>;
  return <><Cell number={row.leftNumber} text={row.leftText} tone={row.type==="removed"||row.type==="changed"?"removed":"same"}/><Cell number={row.rightNumber} text={row.rightText} tone={row.type==="added"||row.type==="changed"?"added":"same"}/></>;
}
function UnifiedRow({line}:{line:DiffOperation}) {
  if(line.type==="skip")return <p className="bg-panel px-3 text-ink-secondary">… Contexto sin cambios</p>;
  return <Cell number={line.type==="removed"?line.leftNumber:line.rightNumber} text={line.text} tone={line.type}/>;
}
function Cell({number,text,tone}:{number?:number;text?:string;tone:"same"|"added"|"removed"}) {
  return <div className={`knownext-history-line grid min-w-0 grid-cols-[30px_14px_1fr] gap-1 px-2 py-0.5 ${tone==="added"?"bg-green-50 text-green-900":tone==="removed"?"bg-red-50 text-red-900":"text-ink-secondary"}`}>
    <span className="select-none text-right text-[10px]">{number}</span><span aria-label={tone==="added"?"Añadido":tone==="removed"?"Retirado":undefined}>{tone==="added"?"+":tone==="removed"?"−":" "}</span><span className="min-w-0 whitespace-pre-wrap">{text??" "}</span>
  </div>;
}
