import { AlertTriangle, FolderPlus, FolderOpen, Github, GitBranch, HardDrive, Lock, RefreshCw, Trash2, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { selectProjectFolder } from "../../lib/runtime/folders";
import type { AuthStatus, GithubRepositorySummary, Project, ProjectCapabilities, ProjectCreationMode, ProjectPayload, VersioningMode } from "../../types/domain";
import { getProjectIcon, projectColors, projectIconOptions } from "./projectVisuals";

export type ProjectDialogInput = ProjectPayload;

type CreateProjectDialogProps = {
  open: boolean;
  mode?: "create" | "edit";
  project?: Project | null;
  onClose: () => void;
  onCreate: (project: ProjectDialogInput) => void;
  onUpdate?: (projectId: string, project: ProjectDialogInput) => void;
  onDelete?: (projectId: string) => void;
  authStatus?: AuthStatus;
  capabilities?: ProjectCapabilities | null;
  githubRepositories?: GithubRepositorySummary[];
  githubRepositoriesLoading?: boolean;
  onLoginGithub?: () => void;
  onRefreshGithubRepositories?: () => void;
};

const anonymousAuth: AuthStatus = { isAuthenticated: false, provider: null, user: null, scopes: [] };
const defaultCapabilities: ProjectCapabilities = {
  canCreateLocalProject: true,
  canOpenLocalFolder: true,
  canUseLocalGit: false,
  canConnectGithub: false,
  canUseGithubApi: false,
  requiresGithubLoginForVersioning: true,
};

export function CreateProjectDialog({
  open,
  mode = "create",
  project,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  authStatus = anonymousAuth,
  capabilities = defaultCapabilities,
  githubRepositories = [],
  githubRepositoriesLoading = false,
  onLoginGithub,
  onRefreshGithubRepositories,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [iconColor, setIconColor] = useState("#F37021");
  const [folderPath, setFolderPath] = useState("");
  const [creationMode, setCreationMode] = useState<ProjectCreationMode>("open-local");
  const [versioningMode, setVersioningMode] = useState<VersioningMode>("none");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const SelectedIcon = getProjectIcon(icon);
  const isEditing = mode === "edit";
  const selectedGithubRepository = githubRepositories.find((repository) => repository.owner === githubOwner && repository.repo === githubRepo);
  const canSubmit = versioningMode === "github-api"
    ? Boolean(githubOwner.trim() && githubRepo.trim())
    : Boolean(folderPath.trim());

  useEffect(() => {
    if (!open) return;
    setDeleteConfirmationOpen(false);

    if (isEditing && project) {
      setName(project.name);
      setIcon(project.icon);
      setIconColor(project.iconColor);
      setFolderPath(project.folderPath);
      setCreationMode(project.versioningMode === "github-api" ? "github-repository" : "open-local");
      setVersioningMode(project.versioningMode);
      setGithubOwner(project.githubRepository?.owner ?? "");
      setGithubRepo(project.githubRepository?.repo ?? "");
      return;
    }

    setName("");
    setIcon("folder");
    setIconColor("#F37021");
    setFolderPath("");
    setCreationMode("open-local");
    setVersioningMode("none");
    setGithubOwner("");
    setGithubRepo("");
  }, [isEditing, open, project]);

  useEffect(() => {
    if (!open || isEditing || !authStatus.isAuthenticated || githubRepositories.length > 0) return;
    onRefreshGithubRepositories?.();
  }, [authStatus.isAuthenticated, githubRepositories.length, isEditing, onRefreshGithubRepositories, open]);

  if (!open) return null;

  function handleSubmit() {
    const nextProject = {
      name: name.trim() || "Nuevo proyecto",
      icon,
      iconColor,
      folderPath: folderPath.trim(),
      creationMode,
      storageMode: versioningMode === "github-api" ? "local-cache" as const : "local-files" as const,
      versioningMode,
      syncMode: versioningMode === "none" ? "none" as const : "manual-github" as const,
      githubRepository: versioningMode === "github-api"
        ? {
          owner: githubOwner.trim(),
          repo: githubRepo.trim(),
          defaultRef: selectedGithubRepository?.defaultRef ?? null,
          rootPath: "",
          permissions: selectedGithubRepository?.permissions ?? [],
        }
        : null,
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
          {!isEditing ? (
            <>
              <div>
                <div className="mb-2 text-[11px] font-medium text-ink-secondary">Cómo quieres empezar</div>
                <div className="grid grid-cols-3 gap-2">
                  <WizardCard
                    active={creationMode === "new-local"}
                    icon={FolderPlus}
                    title="Crear desde 0"
                    description="Nueva carpeta local para documentación Markdown."
                    onClick={() => {
                      setCreationMode("new-local");
                      setVersioningMode("none");
                    }}
                  />
                  <WizardCard
                    active={creationMode === "open-local"}
                    icon={HardDrive}
                    title="Cargar carpeta"
                    description="Usa una carpeta local ya creada."
                    onClick={() => {
                      setCreationMode("open-local");
                      setVersioningMode("none");
                    }}
                  />
                  <WizardCard
                    active={creationMode === "github-repository"}
                    disabled={!authStatus.isAuthenticated}
                    icon={Github}
                    title="Repo GitHub"
                    description="Descarga y configura un repositorio."
                    onClick={() => {
                      setCreationMode("github-repository");
                      setVersioningMode("github-api");
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium text-ink-secondary">
                  <span>Modo de historial</span>
                  {!authStatus.isAuthenticated ? (
                    <button className="text-[11px] font-semibold text-brand-orange hover:text-brand-dark" type="button" onClick={onLoginGithub}>
                      Conectar GitHub
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <WizardCard
                    active={versioningMode === "none"}
                    icon={HardDrive}
                    title="Archivos locales"
                    description="Persistencia en disco sin historial."
                    onClick={() => setVersioningMode("none")}
                  />
                  <WizardCard
                    active={versioningMode === "local-git"}
                    disabled={!capabilities?.canUseLocalGit}
                    icon={GitBranch}
                    title="Git local + sync"
                    description="Versiones locales y sincronización manual."
                    onClick={() => setVersioningMode("local-git")}
                  />
                  <WizardCard
                    active={versioningMode === "github-api"}
                    disabled={!capabilities?.canUseGithubApi}
                    icon={Github}
                    title="GitHub versionado"
                    description="GitHub actúa como proveedor de versiones."
                    onClick={() => {
                      setCreationMode("github-repository");
                      setVersioningMode("github-api");
                    }}
                  />
                </div>
                {!authStatus.isAuthenticated ? (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-orange-200 bg-brand-hover px-3 py-2 text-[11px] text-ink-secondary">
                    <Lock size={14} className="text-brand-orange" />
                    Las opciones versionadas se activan al conectar GitHub. Los proyectos locales funcionan sin cuenta.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          <label className="block text-[11px] font-medium text-ink-secondary">
            Nombre del proyecto
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center" style={{ color: iconColor }}>
                <SelectedIcon size={17} />
              </span>
              <input
                className="h-10 w-full rounded-md border border-line py-0 pl-10 pr-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="ej. Documentación plataforma"
                autoFocus
              />
            </div>
          </label>
          {versioningMode === "github-api" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="min-w-0 flex-1 text-[11px] font-medium text-ink-secondary">
                  Repositorio GitHub
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                    value={githubOwner && githubRepo ? `${githubOwner}/${githubRepo}` : ""}
                    onChange={(event) => {
                      const repository = githubRepositories.find((candidate) => candidate.fullName === event.target.value);
                      if (!repository) return;
                      setGithubOwner(repository.owner);
                      setGithubRepo(repository.repo);
                      if (!name.trim()) setName(repository.repo);
                    }}
                  >
                    <option value="">Selecciona un repositorio</option>
                    {githubRepositories.map((repository) => (
                      <option key={repository.fullName} value={repository.fullName}>
                        {repository.fullName}{repository.private ? " · privado" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="mt-6 grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line hover:bg-brand-hover disabled:opacity-50"
                  type="button"
                  disabled={githubRepositoriesLoading}
                  data-tooltip="Actualizar repositorios"
                  onClick={onRefreshGithubRepositories}
                >
                  <RefreshCw size={15} className={githubRepositoriesLoading ? "animate-spin" : ""} />
                </button>
              </div>
              {githubRepositories.length === 0 ? (
                <div className="rounded-md border border-line bg-panel px-3 py-2 text-[11px] text-ink-secondary">
                  {githubRepositoriesLoading ? "Cargando repositorios..." : "No hay repositorios cargados. Actualiza la lista o escribe owner/repo manualmente."}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[11px] font-medium text-ink-secondary">
                  Propietario
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                    value={githubOwner}
                    onChange={(event) => setGithubOwner(event.target.value)}
                    placeholder="owner"
                  />
                </label>
                <label className="block text-[11px] font-medium text-ink-secondary">
                  Repositorio
                  <input
                    className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
                    value={githubRepo}
                    onChange={(event) => setGithubRepo(event.target.value)}
                    placeholder="repo"
                  />
                </label>
              </div>
              {selectedGithubRepository ? (
                <div className="rounded-md border border-line bg-panel px-3 py-2 text-[11px] text-ink-secondary">
                  Rama por defecto interna: {selectedGithubRepository.defaultRef ?? "detectada por GitHub"}.
                </div>
              ) : null}
            </div>
          ) : null}
          {versioningMode !== "github-api" ? <label className="block text-[11px] font-medium text-ink-secondary">
            Carpeta local
            <div className="mt-2 flex gap-2">
              <div className="min-w-0 flex-1" data-tooltip={folderPath || undefined}>
                <input
                  className={[
                    "h-10 w-full min-w-0 rounded-md border border-line bg-panel px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange",
                    creationMode === "new-local" ? "" : "cursor-default",
                  ].join(" ")}
                  value={folderPath}
                  readOnly={creationMode !== "new-local"}
                  onChange={(event) => setFolderPath(event.target.value)}
                  placeholder={creationMode === "new-local" ? "Escribe la ruta de la nueva carpeta" : "Selecciona una ruta local completa"}
                />
              </div>
              <button
                className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary hover:bg-brand-hover"
                type="button"
                onClick={handleSelectFolder}
              >
                <FolderOpen size={15} />
                Seleccionar
              </button>
            </div>
          </label> : null}
          <div className="text-[11px] font-medium text-ink-secondary">
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
          <div className="text-[11px] font-medium text-ink-secondary">
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
              className="flex h-9 items-center gap-2 rounded-md px-3 text-[11px] font-medium text-red-700 hover:bg-red-50"
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
            <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
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
                <p className="mt-1 text-[11px] leading-5 text-ink-secondary">
                  Se quitará este proyecto de la aplicación y se eliminarán sus enlaces a las carpetas de documentación. Los archivos y carpetas del disco no se borrarán ni se modificarán.
                </p>
              </div>
            </header>
            <footer className="flex justify-end gap-2 px-5 py-4">
              <button
                className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel"
                type="button"
                onClick={() => setDeleteConfirmationOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="h-9 rounded-md bg-red-700 px-4 text-[11px] font-semibold text-white hover:bg-red-800"
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

function WizardCard({
  active,
  disabled = false,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "min-h-[96px] rounded-md border p-3 text-left transition",
        active ? "border-brand-orange bg-brand-hover text-ink-primary" : "border-line bg-white text-ink-primary hover:bg-panel",
        disabled ? "cursor-not-allowed opacity-45 hover:bg-white" : "",
      ].join(" ")}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} className={active ? "text-brand-orange" : "text-ink-secondary"} />
        <span className="text-[11px] font-semibold">{title}</span>
        {disabled ? <Lock size={13} className="ml-auto text-ink-secondary" /> : null}
      </div>
      <p className="text-[10px] leading-4 text-ink-secondary">{description}</p>
    </button>
  );
}
