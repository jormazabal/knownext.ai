import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, Star, X } from "lucide-react";
import { ModalFrame } from "../../components/ui/ModalFrame";
import { getApiErrorMessage } from "../../lib/api/client";
import { searchSavedProjectContent } from "../../lib/api/localSearch";
import { searchDocumentTreeByName } from "./documentNameSearch";
import type { DocumentTreeNode, Project } from "../../types/domain";
import { useProjectFavorites } from "./useProjectFavorites";
import type { WorkspaceNodeFocus, LocalSearchResponse } from "../../types/localSearch";

export type WorkspaceCommand = { id: string; label: string; detail?: string; run: () => void };
type PaletteChoice = WorkspaceCommand & { excerpt?:string; path?:string; nodeId?:string; unavailable?:boolean };
export function WorkspaceCommandPalette({ tree, projectId, projects, recentIds, commands, onSelectProject, onSelectNode, onClose, language="es" }: {
  language?:"es"|"en"; tree: DocumentTreeNode[]; projectId: string | null; projects: Project[]; recentIds: string[]; commands: WorkspaceCommand[];
  onSelectProject: (project: Project) => void; onSelectNode: (id: string, type: DocumentTreeNode["type"], name: string, focus?:WorkspaceNodeFocus) => void; onClose: () => void;
}) {
  const english=language==="en",t=(es:string,en:string)=>english?en:es;
  const modes=[["commands",t("Archivos y acciones","Files and actions")],["favorites",t("Favoritos","Favorites")],["content",t("Contenido guardado","Saved content")]] as const;
  const [query,setQuery] = useState(""); const [mode,setMode] = useState<"commands"|"content"|"favorites">("commands");
  const [index,setIndex] = useState(0); const [search,setSearch] = useState<LocalSearchResponse|null>(null);
  const [loading,setLoading] = useState(false); const [error,setError] = useState("");
  const favorites = useProjectFavorites(projectId,language);
  const revision = useRef(0); const input = useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{revision.current++;},[]);
  const choices = useMemo<PaletteChoice[]>(()=>{
    const term=query.trim().toLocaleLowerCase();
    const favoriteChoices=(favorites.inventory?.entries??[]).filter(entry=>!term||`${entry.name} ${entry.path}`.toLocaleLowerCase().includes(term)).map(entry=>({id:`favorite-${entry.id}`,nodeId:entry.nodeId,path:entry.path,label:entry.name,detail:`${entry.path}${entry.available?t(' · Favorito',' · Favorite'):t(' · No disponible',' · Unavailable')}`,unavailable:!entry.available,run:()=>onSelectNode(entry.nodeId,entry.kind,entry.name)}));
    if(mode==="favorites")return favoriteChoices;
    if (mode === "content") return (search?.results ?? []).map((result,i)=>({id:`result-${i}`,label:result.name,detail:`${result.path}${result.pageNumber?` · ${t("página","page")} ${result.pageNumber}`:""} · ${t("línea","line")} ${result.line}`,excerpt:result.excerpt,path:result.path,nodeId:result.documentId,run:()=>result.pageId?onSelectNode(result.documentId,result.kind??"document",result.name,{kind:"handwritten-page",pageId:result.pageId}):result.kind==="attachment"&&result.pageNumber&&result.path.toLowerCase().endsWith(".pdf")?onSelectNode(result.documentId,"attachment",result.name,{kind:"pdf-page",pageNumber:result.pageNumber}):onSelectNode(result.documentId,result.kind??"document",result.name)}));
    const flatten = (nodes: DocumentTreeNode[], parents: string[] = []): Array<{node:DocumentTreeNode;path:string}> => nodes.flatMap(node=>[{node,path:node.path || [...parents,node.name].join("/")},...flatten(node.children ?? [],[...parents,node.name])]);
    const nodes = flatten(tree);
    const files = query.trim() ? searchDocumentTreeByName(tree,query,24,true).map(result=>({node:{...result,path:result.path.join("/")},path:result.path.join("/")})) : recentIds.flatMap(id=>nodes.filter(item=>item.node.id===id)).slice(0,8);
    const favoriteNodes=new Set(!term?favoriteChoices.slice(0,4).map(choice=>choice.nodeId):[]);
    return [
      ...commands.filter(command=>!term || `${command.label} ${command.detail ?? ""}`.toLocaleLowerCase().includes(term)),
      ...(!term?favoriteChoices.slice(0,4):[]),
      ...files.filter(({node})=>!favoriteNodes.has(node.id)).map(({node,path})=>({id:node.id,nodeId:node.id,path:node.type!=="folder"?path:undefined,label:node.name,detail:path,run:()=>onSelectNode(node.id,node.type,node.name)})),
      ...projects.filter(project=>project.id!==projectId && term && project.name.toLocaleLowerCase().includes(term)).slice(0,8).map(project=>({id:project.id,label:project.name,detail:t("Cambiar de proyecto","Switch project"),run:()=>onSelectProject(project)})),
    ].slice(0,40);
  },[tree,query,mode,search,recentIds,commands,projects,projectId,onSelectNode,onSelectProject,favorites.inventory,language]);
  useEffect(()=>{setIndex(current=>Math.min(current,Math.max(0,choices.length-1)));},[choices.length]);
  const selected=choices[index];
  const selectedFavorite=favorites.inventory?.entries.find(entry=>entry.nodeId===selected?.nodeId);
  useEffect(()=>{document.getElementById(`workspace-command-${index}`)?.scrollIntoView?.({block:'nearest'});},[index]);
  async function findContent() {
    if (!projectId || query.trim().length < 2) return;
    const version=++revision.current;setLoading(true);setError("");setSearch(null);setIndex(0);
    try {const response=await searchSavedProjectContent(projectId,query);if(version===revision.current)setSearch(response);}
    catch(failure){if(version===revision.current)setError(getApiErrorMessage(failure,t("No se ha podido buscar en los documentos.","Could not search the saved documents.")));}
    finally{if(version===revision.current)setLoading(false);}
  }
  function choose(choice: WorkspaceCommand | undefined) {if(!choice||("unavailable" in choice&&choice.unavailable))return;onClose();choice.run();}
  function changeMode(value:typeof mode){revision.current++;setLoading(false);setMode(value);setIndex(0);setError("");input.current?.focus();}
  return <ModalFrame className="!z-[180]" label={t('Acceso rápido','Quick access')} onClose={onClose}>
    <section className="flex max-h-[min(680px,calc(100dvh-24px))] w-full max-w-[660px] flex-col overflow-hidden rounded-xl bg-white shadow-menu">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4"><h2 className="font-semibold">{t('Acceso rápido','Quick access')}</h2><button aria-label={t('Cerrar acceso rápido','Close quick access')} className="grid h-11 w-11 place-items-center" onClick={onClose}><X size={18}/></button></header>
      <div className="hidden shrink-0 flex-wrap gap-1 px-4 py-2 text-sm sm:flex">
        {modes.map(([value,label])=><button key={value} aria-pressed={mode===value} disabled={value!=='commands'&&!projectId} className={`min-h-11 rounded px-3 ${mode===value?'bg-brand-hover font-semibold':'text-ink-secondary'}`} onClick={()=>changeMode(value)}>{label}</button>)}
      </div>
      <div className="shrink-0 px-5 py-2 sm:hidden"><select aria-label={t('Tipo de búsqueda','Search type')} value={mode} onChange={event=>changeMode(event.target.value as typeof mode)} className="min-h-11 w-full rounded bg-panel px-2 text-sm">{modes.map(([value,label])=><option key={value} value={value} disabled={value!=='commands'&&!projectId}>{label}</option>)}</select></div>
      <div className="workspace-command-search shrink-0 mx-5 mb-3 flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand-orange"><Search size={18}/>
        <input ref={input} data-autofocus role="combobox" aria-label={t('Buscar archivos, acciones o contenido','Search files, actions or content')} aria-expanded={choices.length>0} aria-controls="workspace-command-results" aria-activedescendant={choices[index] ? `workspace-command-${index}` : undefined} autoComplete="off" maxLength={200} placeholder={mode==='content'?t('Buscar texto guardado…','Search saved text…'):mode==='favorites'?t('Nombre o ruta del favorito…','Favorite name or path…'):t('Nombre, ruta, proyecto o acción…','Name, path, project or action…')} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={event=>{revision.current++;setLoading(false);setQuery(event.target.value);setSearch(null);setIndex(0);setError("");}} onKeyDown={event=>{
          if(event.nativeEvent.isComposing)return;
          if(event.key==='ArrowDown'){event.preventDefault();setIndex(current=>Math.min(current+1,Math.max(0,choices.length-1)));}
          else if(event.key==='ArrowUp'){event.preventDefault();setIndex(current=>Math.max(0,current-1));}
          else if(event.key==='Enter'){event.preventDefault();if(mode==='content'&&!search)void findContent();else choose(choices[index]);}
        }}/>
        {mode==='content'&&<button disabled={loading||query.trim().length<2} className="min-h-11 rounded px-2 text-sm font-medium disabled:opacity-40" onClick={()=>void findContent()}>{t('Buscar','Search')}</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {mode==='content'&&!search&&<p className="mb-2 px-2 text-xs text-ink-secondary">{t('Busca texto guardado en Markdown, TXT, CSV, Word, Excel, PDF con texto extraíble y transcripciones de notas. No incluye borradores sin guardar ni trazos sin transcripción.',"Search saved Markdown, TXT, CSV, Word, Excel, PDF with extractable text and note transcripts. Unsaved drafts and untranscribed strokes are excluded.")}</p>}
        {mode==='favorites'&&<div className="mb-2 flex items-center gap-2 px-2 text-xs text-ink-secondary"><p className="min-w-0 flex-1">{favorites.inventory?`${favorites.inventory.entries.length}/${favorites.inventory.maximumEntries} ${t("favoritos · Solo este dispositivo","favorites · This device only")}`:favorites.busy?t('Consultando favoritos…','Reading favorites…'):t('Favoritos no disponibles','Favorites unavailable')}</p><button aria-label={t('Actualizar favoritos','Refresh favorites')} disabled={favorites.busy} onClick={()=>void favorites.refresh()} className="grid min-h-11 min-w-11 place-items-center rounded hover:bg-panel disabled:opacity-40"><RefreshCw size={15}/></button></div>}
        {mode==='favorites'&&favorites.error&&<p role="alert" className="mb-2 px-2 text-xs leading-5 text-red-800">{favorites.error}</p>}
        {favorites.notice&&<p role="status" className="mb-2 px-2 text-xs leading-5 text-ink-secondary">{favorites.notice}</p>}
        {mode!=='favorites'&&selected?.path&&favorites.error&&<p role="alert" className="mb-2 px-2 text-xs leading-5 text-red-800">{favorites.error}</p>}
        {loading&&<p role="status" className="p-3 text-sm">{t('Buscando en el proyecto…','Searching the project…')}</p>}
        {error&&<p role="alert" className="p-3 text-sm text-red-700">{error}</p>}
        {search&&<p role="status" className="px-2 py-2 text-xs">{search.results.length} {search.results.length===1?t("resultado","result"):t("resultados","results")} · {search.scannedDocuments} {search.scannedDocuments===1?t("documento consultado","document searched"):t("documentos consultados","documents searched")}{search.limited?t(' · límite alcanzado: la búsqueda puede ser parcial',' · limit reached: results may be partial'):''}</p>}
        <ul id="workspace-command-results" role="listbox" aria-label={t('Resultados de acceso rápido','Quick access results')} className="space-y-1">{choices.map((choice,i)=><li key={choice.id} role="presentation"><button id={`workspace-command-${i}`} role="option" aria-selected={index===i} aria-disabled={choice.unavailable||undefined} tabIndex={-1} className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left ${index===i?'bg-brand-hover':'hover:bg-panel'}`} onMouseMove={()=>setIndex(i)} onClick={()=>choose(choice)}>
          <span className="block truncate text-sm font-medium">{choice.label}</span>{choice.detail&&<span className="block break-words [overflow-wrap:anywhere] text-xs text-ink-secondary">{choice.detail}</span>}{choice.unavailable&&<span className="mt-1 block text-xs text-ink-secondary">{t('El archivo puede haberse movido o estar desconectado. El marcador se conserva.','The file may have moved or be disconnected. The bookmark is preserved.')}</span>}{choice.excerpt&&<span className="mt-1 block break-words text-sm">{String(choice.excerpt)}</span>}
        </button></li>)}</ul>
        {mode==='content'&&search&&<details className="mt-2 px-2 text-xs text-ink-secondary"><summary className="min-h-11 cursor-pointer py-3">{t("Alcance y actualización","Scope and freshness")}{search.warnings.length?` · ${search.warnings.length} ${search.warnings.length===1?t('aviso','warning'):t('avisos','warnings')}`:''}</summary><p>{t('Markdown, TXT, CSV, Word, Excel, PDF con texto extraíble y transcripciones guardadas. No incluye borradores sin guardar ni trazos sin transcripción. No se ejecuta OCR sobre PDF escaneados.',"Markdown, TXT, CSV, Word, Excel, PDF with extractable text and saved transcripts. Excludes unsaved drafts and untranscribed strokes. Scanned PDFs are not processed with OCR.")}</p>{!!search.notesWithoutText&&<p className="py-2">{search.notesWithoutText} {search.notesWithoutText===1?t("nota","note"):t("notas","notes")} {t("sin transcripción guardada; no se han deducido palabras de sus trazos.","without a saved transcript; words have not been inferred from strokes.")}</p>}{!!search.attachmentsWithoutText&&<p className="py-2">{search.attachmentsWithoutText} {search.attachmentsWithoutText===1?t("adjunto sin texto local utilizable","attachment without usable local text"):t("adjuntos sin texto local utilizable","attachments without usable local text")}.</p>}{search.index&&<p className="py-2">{t("Actualización local:","Local refresh:")} {search.index.updatedDocuments} {search.index.updatedDocuments===1?t("archivo actualizado","file refreshed"):t("archivos actualizados","files refreshed")} · {search.index.reusedDocuments} {t("sin cambios. El contenido se verifica en cada consulta.","unchanged. Content is verified on every search.")}</p>}{!!search.warnings.length&&<ul className="py-2">{search.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}</details>}
        {!loading&&mode==='commands'&&!choices.length&&<p className="p-3 text-sm text-ink-secondary">{t('No hay coincidencias.','No matches.')}</p>}
        {mode==='favorites'&&!favorites.busy&&favorites.inventory&&!choices.length&&<p className="p-3 text-sm text-ink-secondary">{query?t('No hay favoritos con ese nombre o ruta.','No favorites match this name or path.'):t('Busca un archivo o elige uno reciente y usa Añadir a favoritos.','Search or choose a recent file, then use Add to favorites.')}</p>}
      </div>
      {selected?.path&&<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-5 py-2">
        <p className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-xs text-ink-secondary">{selected.detail}</p>
        <button type="button" aria-pressed={!!selectedFavorite} disabled={favorites.busy||!favorites.inventory||(!selectedFavorite&&selected.unavailable)} onClick={async()=>{await favorites.toggle(selected.path!,selectedFavorite);input.current?.focus({preventScroll:true});}} className="inline-flex min-h-11 items-center gap-2 rounded px-2 text-xs font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-40"><Star size={15} fill={selectedFavorite?'currentColor':'none'}/>{selectedFavorite?t('Quitar de favoritos','Remove favorite'):t('Añadir a favoritos','Add to favorites')}</button>
      </div>}
      <footer className="shrink-0 px-5 py-3 text-xs text-ink-secondary">{t('↑ ↓ recorrer · Intro abrir · Esc cerrar · Ctrl/Cmd Shift P acceso rápido','↑ ↓ navigate · Enter open · Esc close · Ctrl/Cmd Shift P quick access')}</footer>
    </section>
  </ModalFrame>;
}
