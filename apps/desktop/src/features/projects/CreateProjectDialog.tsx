import { AlertTriangle, FolderPlus, FolderOpen, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { selectProjectFolder } from "../../lib/runtime/folders";
import type { Project } from "../../types/domain";
import { getProjectIcon, projectColors, projectIconOptions } from "./projectVisuals";

export type ProjectDialogInput = {
  name: string;
  icon: string;
  iconColor: string;
  folderPath: string;
};

type CreateProjectDialogProps = {
  open: boolean;
  mode?: "create" | "edit";
  project?: Project | null;
  onClose: () => void;
  onCreate: (project: ProjectDialogInput) => void;
  onUpdate?: (projectId: string, project: ProjectDialogInput) => void;
  onDelete?: (projectId: string) => void;
};

export function CreateProjectDialog({ open, mode = "create", project, onClose, onCreate, onUpdate, onDelete }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [iconColor, setIconColor] = useState("#F37021");
  const [folderPath, setFolderPath] = useState("");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const SelectedIcon = getProjectIcon(icon);
  const isEditing = mode === "edit";

  useEffect(() => {
    if (!open) return;
    setDeleteConfirmationOpen(false);

    if (isEditing && project) {
      setName(project.name);
      setIcon(project.icon);
      setIconColor(project.iconColor);
      setFolderPath(project.folderPath);
      return;
    }

    setName("");
    setIcon("folder");
    setIconColor("#F37021");
    setFolderPath("");
  }, [isEditing, open, project]);

  if (!open) return null;

  function handleSubmit() {
    const nextProject = {
      name: name.trim() || "Nuevo proyecto",
      icon,
      iconColor,
      folderPath: folderPath.trim(),
    };

    if (isEditing && project) {
      onUpdate?.(project.id, nextProject);
      return;
    }

    onCreate(nextProject);
  }

  async function handleSelectFolder() {
    const selectedPath = await selectProjectFolder(folderPath);
    if (selectedPath) {
      setFolderPath(selectedPath);
    }
  }

  function handleConfirmDelete() {
    if (!project) return;
    onDelete?.(project.id);
    setDeleteConfirmationOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20">
      <section className="w-[560px] rounded-lg border border-line bg-white shadow-menu">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-orange text-white">
              <FolderPlus size={17} />
            </span>
            <h2 className="text-[15px] font-semibold">
              {isEditing ? "Editar proyecto de documentación" : "Crear proyecto de documentación"}
            </h2>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-[12px] font-medium text-ink-secondary">
            Nombre del proyecto
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center" style={{ color: iconColor }}>
                <SelectedIcon size={17} />
              </span>
              <input
                className="h-10 w-full rounded-md border border-line py-0 pl-10 pr-3 text-[13px] text-ink-primary outline-none focus:border-brand-orange"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="ej. Documentación plataforma"
                autoFocus
              />
            </div>
          </label>
          <label className="block text-[12px] font-medium text-ink-secondary">
            Carpeta local
            <div className="mt-2 flex gap-2">
              <div className="min-w-0 flex-1" data-tooltip={folderPath || undefined}>
                <input
                  className="h-10 w-full min-w-0 cursor-default rounded-md border border-line bg-panel px-3 text-[13px] text-ink-primary outline-none"
                  value={folderPath}
                  readOnly
                  placeholder="Selecciona una ruta local completa"
                />
              </div>
              <button
                className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 text-[13px] text-ink-primary hover:bg-brand-hover"
                type="button"
                onClick={handleSelectFolder}
              >
                <FolderOpen size={15} />
                Seleccionar
              </button>
            </div>
          </label>
          <div className="text-[12px] font-medium text-ink-secondary">
            Icono
            <div className="mt-2 grid grid-cols-12 gap-2">
              {projectIconOptions.map((option) => {
                const OptionIcon = option.icon;
                const selected = option.id === icon;

                return (
                  <button
                    key={option.id}
                    className={[
                      "relative grid h-8 place-items-center rounded-md text-ink-secondary hover:text-brand-orange",
                      selected ? "text-brand-orange" : "",
                    ].join(" ")}
                    type="button"
                    data-tooltip={option.label}
                    aria-label={`Icono ${option.label}`}
                    onClick={() => setIcon(option.id)}
                  >
                    <OptionIcon size={19} strokeWidth={selected ? 2.25 : 1.9} style={selected ? { color: iconColor } : undefined} />
                    {selected ? <span className="absolute bottom-0 h-0.5 w-4 rounded-full" style={{ backgroundColor: iconColor }} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="text-[12px] font-medium text-ink-secondary">
            Color
            <div className="mt-2 grid grid-cols-12 gap-2">
              {projectColors.map((color) => (
                <button
                  key={color}
                  className="grid h-8 place-items-center rounded-full"
                  type="button"
                  onClick={() => setIconColor(color)}
                  aria-label={`Color ${color}`}
                >
                  <span
                    className={["block h-6 w-6 rounded-full", color === iconColor ? "ring-2 ring-ink-primary ring-offset-2" : ""].join(" ")}
                    style={{ backgroundColor: color }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          {isEditing && project && onDelete ? (
            <button
              className="flex h-9 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-red-700 hover:bg-red-50"
              type="button"
              onClick={() => setDeleteConfirmationOpen(true)}
            >
              <Trash2 size={15} />
              Eliminar proyecto
            </button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            <button className="h-9 rounded-md border border-line px-4 text-[13px] hover:bg-panel" onClick={onClose}>
              Cancelar
            </button>
            <button className="h-9 rounded-md bg-brand-orange px-4 text-[13px] font-semibold text-white hover:bg-brand-dark" onClick={handleSubmit}>
              {isEditing ? "Guardar cambios" : "Crear proyecto"}
            </button>
          </div>
        </footer>
      </section>
      {deleteConfirmationOpen && project ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/25">
          <section className="w-[440px] rounded-lg border border-line bg-white shadow-menu">
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
                <AlertTriangle size={17} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-ink-primary">Eliminar proyecto de KnowNext.ai</h3>
                <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
                  Se quitará este proyecto de la aplicación y se eliminarán sus enlaces a las carpetas de documentación. Los archivos y carpetas del disco no se borrarán ni se modificarán.
                </p>
              </div>
            </header>
            <footer className="flex justify-end gap-2 px-5 py-4">
              <button
                className="h-9 rounded-md border border-line px-4 text-[13px] hover:bg-panel"
                type="button"
                onClick={() => setDeleteConfirmationOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="h-9 rounded-md bg-red-700 px-4 text-[13px] font-semibold text-white hover:bg-red-800"
                type="button"
                onClick={handleConfirmDelete}
              >
                Eliminar proyecto
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
