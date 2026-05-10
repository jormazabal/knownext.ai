import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types/domain";
import { getProjectIcon } from "./projectVisuals";

type ProjectSelectorProps = {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: () => void;
};

export function ProjectSelector({ projects, activeProject, onSelectProject, onCreateProject }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const ActiveProjectIcon = getProjectIcon(activeProject?.icon);

  return (
    <div className="relative w-full">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-normal text-ink-primary">
        PROYECTO ACTUAL
      </div>
      <button
        className="flex h-8 w-full items-center justify-between rounded-md border border-line bg-white px-2.5 text-[11px] shadow-[0_1px_2px_rgba(17,24,39,0.03)]"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ActiveProjectIcon size={15} style={{ color: activeProject?.iconColor ?? "#F37021" }} />
          <span className="truncate">{activeProject?.name ?? "Proyecto Alpha"}</span>
        </span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[50px] z-30 w-full rounded-md border border-line bg-white py-1 text-[11px] shadow-menu">
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
              onCreateProject();
            }}
          >
            <Plus size={15} />
            Nuevo proyecto
          </button>
        </div>
      ) : null}
    </div>
  );
}
