import { Paperclip, History, Replace, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { AppearanceConfig, Project } from "../../types/domain";
import { getProjectIcon } from "./projectVisuals";

type ProjectSelectorProps = {
  projects: Project[];
  activeProject: Project | null;
  language?: AppearanceConfig["language"];
  headerAction?: ReactNode;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
  onImportPackage?: () => void;
  onExportPackage?: () => void;
  onOpenHistoryRestore?:()=>void;
  onOpenAssetCatalog?:()=>void;
  onOpenProjectReplace?:()=>void;
  onOpenAiChangeHistory?:()=>void;
  onRetiredProjects?: (returnFocus:()=>HTMLElement|null) => void;
};

const copy = {
  es: {
    firstProjectTitle: "Crea tu primer proyecto",
    firstProjectDescription: "Crea tu primer proyecto para empezar a trabajar con documentación Markdown en KnowNext.ai.",
    addFirstProject: "Añadir primer proyecto",
    currentProject: "PROYECTO ACTUAL",
    noActiveProject: "Sin proyecto activo",
    newProject: "Nuevo proyecto",
  },
  en: {
    firstProjectTitle: "Create your first project",
    firstProjectDescription: "Create your first project to start working with Markdown documentation in KnowNext.ai.",
    addFirstProject: "Add first project",
    currentProject: "CURRENT PROJECT",
    noActiveProject: "No active project",
    newProject: "New project",
  },
};

export function ProjectSelector({ projects, activeProject, language = "es", headerAction = null, onSelectProject, onCreateProject, onImportPackage, onExportPackage, onRetiredProjects,onOpenAssetCatalog,onOpenHistoryRestore,onOpenProjectReplace,onOpenAiChangeHistory }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const firstProjectButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectorButtonRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ActiveProjectIcon = getProjectIcon(activeProject?.icon);
  const text = copy[language];
  function openRetiredProjects(){setOpen(false);selectorButtonRef.current?.focus();onRetiredProjects?.(()=>selectorButtonRef.current??firstProjectButtonRef.current);}

  useEffect(() => {
    if (projects.length === 0) firstProjectButtonRef.current?.focus();
  }, [projects.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); selectorButtonRef.current?.focus(); } };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [open]);

  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-line bg-white px-3 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.03)]">
        <div className="text-[11px] font-semibold text-ink-primary">{text.firstProjectTitle}</div>
        <p className="mt-1 text-[11px] leading-4 text-ink-secondary">
          {text.firstProjectDescription}
        </p>
        <button
          ref={firstProjectButtonRef}
          className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-md bg-brand-orange px-3 text-[11px] font-semibold text-white outline-none transition hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
          onClick={onCreateProject}
        >
          <Plus size={15} />
          {text.addFirstProject}
        </button>
        {onImportPackage && <button type="button" onClick={onImportPackage} className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded px-2 text-xs text-brand-orange hover:bg-brand-hover"><ArrowDownToLine size={15}/>{language === "es" ? "Importar proyecto…" : "Import project…"}</button>}
        {onRetiredProjects && <button type="button" onClick={openRetiredProjects} className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded px-2 text-xs hover:bg-panel"><ArchiveRestore size={15}/>{language === "es" ? "Proyectos retirados…" : "Removed projects…"}</button>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="mb-1.5 flex h-8 items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-normal text-ink-primary">
          {text.currentProject}
        </div>
        {headerAction}
      </div>
      <button
        ref={selectorButtonRef}
        aria-expanded={open}
        className="flex h-8 w-full items-center justify-between rounded-md border border-line bg-white px-2.5 text-[11px] shadow-[0_1px_2px_rgba(17,24,39,0.03)]"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ActiveProjectIcon size={15} style={{ color: activeProject?.iconColor ?? "#F37021" }} />
          <span className="truncate">{activeProject?.name ?? text.noActiveProject}</span>
        </span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[50px] z-30 max-h-[calc(100dvh-180px)] w-full overflow-y-auto rounded-md border border-line bg-white py-1 text-[11px] shadow-menu">
          {projects.map((project) => {
            const ProjectIcon = getProjectIcon(project.icon);

            return (
              <button
                key={project.id}
                className="flex h-7 w-full items-center justify-between px-2.5 text-left hover:bg-brand-hover"
                onClick={() => {
                  onSelectProject(project);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProjectIcon size={14} className="shrink-0" style={{ color: project.iconColor }} />
                  <span className="truncate">{project.name}</span>
                </span>
                {project.id === activeProject?.id ? <Check size={14} /> : null}
              </button>
            );
          })}
          <div className="my-1 border-t border-line" />
          <button
            className="flex h-7 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover"
            onClick={() => {
              setOpen(false);
              selectorButtonRef.current?.focus();
              onCreateProject();
            }}
          >
            <Plus size={15} />
            {text.newProject}
          </button>
          {onImportPackage && <button type="button" onClick={() => { setOpen(false); selectorButtonRef.current?.focus(); onImportPackage(); }} className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover"><ArrowDownToLine size={15}/>{language === "es" ? "Importar proyecto…" : "Import project…"}</button>}
          {onExportPackage && activeProject && <button type="button" onClick={() => { setOpen(false); selectorButtonRef.current?.focus(); onExportPackage(); }} className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover"><ArrowUpFromLine size={15}/>{language === "es" ? "Exportar proyecto…" : "Export project…"}</button>}
          {activeProject&&onOpenHistoryRestore&&<button className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover" onClick={()=>{setOpen(false);selectorButtonRef.current?.focus();onOpenHistoryRestore();}}><ArchiveRestore size={15}/>{language==="es"?"Restaurar archivo histórico…":"Restore historical file…"}</button>}
          {activeProject&&onOpenAssetCatalog&&<button className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover" onClick={()=>{setOpen(false);selectorButtonRef.current?.focus();onOpenAssetCatalog();}}><Paperclip size={15}/>{language==="es"?"Recursos y enlaces…":"Resources and links…"}</button>}
          {activeProject&&onOpenProjectReplace&&<button className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover" onClick={()=>{setOpen(false);selectorButtonRef.current?.focus();onOpenProjectReplace();}}><Replace size={15}/>{language==="es"?"Reemplazar en documentos…":"Replace in documents…"}</button>}
          {activeProject&&onOpenAiChangeHistory&&<button className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover" onClick={()=>{setOpen(false);selectorButtonRef.current?.focus();onOpenAiChangeHistory();}}><History size={15}/>{language==="es"?"Cambios IA y reversión…":"AI changes and reversal…"}</button>}
          {onRetiredProjects && <button type="button" onClick={openRetiredProjects} className="flex min-h-11 w-full items-center gap-2 px-2.5 text-left hover:bg-brand-hover"><ArchiveRestore size={15}/>{language === "es" ? "Proyectos retirados…" : "Removed projects…"}</button>}
        </div>
      ) : null}
    </div>
  );
}
