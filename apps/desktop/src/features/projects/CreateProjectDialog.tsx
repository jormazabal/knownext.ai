import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Github,
  GitBranch,
  HardDrive,
  Info,
  Lock,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { selectProjectFolder } from "../../lib/runtime/folders";
import type { AuthStatus, GithubPublishVisibility, GithubRepositorySummary, Project, ProjectCapabilities, ProjectCreationMode, ProjectPayload, VersioningMode } from "../../types/domain";
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

type WizardStepId = "scenario" | "location" | "versioning" | "identity" | "review";
type ProjectStartMode = "github-existing" | "local-new" | "local-existing" | "local-existing-git";
type LocalHistoryChoice = "files-only" | "local-git" | "existing-github-remote" | "publish-github";

type DerivedProjectMode = {
  creationMode: ProjectCreationMode;
  versioningMode: VersioningMode;
  storageMode: "local-files" | "local-cache";
  syncMode: "none" | "manual-github";
  requiresGithubRepository: boolean;
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

const wizardSteps: { id: WizardStepId; title: string; description: string }[] = [
  { id: "scenario", title: "Situación", description: "Elige si partes de GitHub, de una carpeta nueva o de una carpeta existente." },
  { id: "location", title: "Ubicación", description: "Indica el origen y dónde quedará la copia local de trabajo." },
  { id: "versioning", title: "Historial", description: "Define si KnowNext.ai usará archivos, Git local o una conexión GitHub existente." },
  { id: "identity", title: "Detalles", description: "Nombra el proyecto y elige cómo se verá en el selector." },
  { id: "review", title: "Resumen", description: "Revisa la configuración completa antes de crear el proyecto." },
];

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
  const [newProjectParentPath, setNewProjectParentPath] = useState("");
  const [newProjectFolderName, setNewProjectFolderName] = useState("");
  const [startMode, setStartMode] = useState<ProjectStartMode>("local-existing");
  const [localHistoryChoice, setLocalHistoryChoice] = useState<LocalHistoryChoice>("files-only");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubPublishVisibility, setGithubPublishVisibility] = useState<GithubPublishVisibility>("private");
  const [activeStep, setActiveStep] = useState<WizardStepId>("scenario");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);

  const SelectedIcon = getProjectIcon(icon);
  const isEditing = mode === "edit";
  const selectedGithubRepository = githubRepositories.find((repository) => repository.owner === githubOwner && repository.repo === githubRepo);
  const derivedMode = deriveProjectMode(startMode, localHistoryChoice);
  const finalFolderPath = startMode === "local-new" && newProjectParentPath.trim() && newProjectFolderName.trim()
    ? joinProjectFolderPath(newProjectParentPath, newProjectFolderName)
    : folderPath;
  const hasGithubRepository = Boolean(githubOwner.trim() && githubRepo.trim());
  const hasFolder = startMode === "local-new" ? Boolean(newProjectParentPath.trim() && newProjectFolderName.trim()) : Boolean(folderPath.trim());
  const activeStepIndex = wizardSteps.findIndex((step) => step.id === activeStep);
  const canSubmit = hasFolder && (!derivedMode.requiresGithubRepository || hasGithubRepository);
  const canContinue = getStepCanContinue(activeStep, startMode, derivedMode, hasFolder, hasGithubRepository);
  const previewName = name.trim() || githubRepo.trim() || "Nuevo proyecto";

  const reviewItems = useMemo(() => {
    const repository = hasGithubRepository ? `${githubOwner.trim()}/${githubRepo.trim()}` : "Pendiente";
    return [
      { label: "Situación", value: startModeLabel(startMode) },
      { label: "Carpeta local", value: finalFolderPath || "Pendiente" },
      { label: "Historial", value: historyChoiceLabel(startMode, localHistoryChoice) },
      { label: "Modo de trabajo", value: derivedMode.storageMode === "local-cache" ? "Copia local conectada a GitHub" : "Archivos locales" },
      ...(derivedMode.requiresGithubRepository ? [{ label: "GitHub", value: repository }] : []),
      ...(localHistoryChoice === "publish-github" ? [{ label: "Visibilidad GitHub", value: githubPublishVisibility === "private" ? "Privado" : "Público" }] : []),
    ];
  }, [derivedMode.requiresGithubRepository, derivedMode.storageMode, finalFolderPath, githubOwner, githubPublishVisibility, githubRepo, hasGithubRepository, localHistoryChoice, startMode]);

  useEffect(() => {
    if (!open) return;
    setDeleteConfirmationOpen(false);

    if (isEditing && project) {
      setName(project.name);
      setIcon(project.icon);
      setIconColor(project.iconColor);
      setFolderPath(project.folderPath);
      setNewProjectParentPath("");
      setNewProjectFolderName("");
      setStartMode(project.versioningMode === "github-api" ? "github-existing" : project.versioningMode === "local-git" ? "local-existing-git" : "local-existing");
      setLocalHistoryChoice(project.versioningMode === "local-git" && project.githubRepository ? "existing-github-remote" : project.versioningMode === "local-git" ? "local-git" : "files-only");
      setGithubOwner(project.githubRepository?.owner ?? "");
      setGithubRepo(project.githubRepository?.repo ?? "");
      setGithubPublishVisibility("private");
      setActiveStep("identity");
      return;
    }

    setName("");
    setIcon("folder");
    setIconColor("#F37021");
    setFolderPath("");
    setNewProjectParentPath("");
    setNewProjectFolderName("");
    setStartMode("local-existing");
    setLocalHistoryChoice("files-only");
    setGithubOwner("");
    setGithubRepo("");
    setGithubPublishVisibility("private");
    setActiveStep("scenario");
  }, [isEditing, open, project]);

  useEffect(() => {
    if (!open || isEditing || !authStatus.isAuthenticated || githubRepositories.length > 0) return;
    onRefreshGithubRepositories?.();
  }, [authStatus.isAuthenticated, githubRepositories.length, isEditing, onRefreshGithubRepositories, open]);

  if (!open) return null;

  function buildGithubRepository() {
    if (!hasGithubRepository) return null;
    return {
      owner: githubOwner.trim(),
      repo: slugifyGithubRepoName(githubRepo),
      defaultRef: selectedGithubRepository?.defaultRef ?? null,
      rootPath: "",
      permissions: selectedGithubRepository?.permissions ?? (localHistoryChoice === "publish-github" ? ["pull", "push"] : []),
    };
  }

  function buildProjectInput() {
    const githubRepository = buildGithubRepository();
    return {
      name: name.trim() || githubRepo.trim() || "Nuevo proyecto",
      icon,
      iconColor,
      folderPath: finalFolderPath.trim(),
      creationMode: derivedMode.creationMode,
      storageMode: derivedMode.storageMode,
      versioningMode: derivedMode.versioningMode,
      syncMode: derivedMode.syncMode,
      githubRepository: derivedMode.requiresGithubRepository ? githubRepository : null,
      publishToGithub: localHistoryChoice === "publish-github"
        ? {
          visibility: githubPublishVisibility,
          description: `Documentacion ${name.trim() || githubRepo.trim() || "KnowNext.ai"}`,
        }
        : null,
    };
  }

  function handleHistoryChoiceChange(choice: LocalHistoryChoice) {
    setLocalHistoryChoice(choice);
    if (choice !== "publish-github") return;
    if (!githubOwner.trim() && authStatus.user?.login) setGithubOwner(authStatus.user.login);
    if (!githubRepo.trim()) setGithubRepo(slugifyGithubRepoName(name || newProjectFolderName || lastPathSegment(finalFolderPath) || "documentacion"));
  }

  function handleSubmit() {
    const nextProject = buildProjectInput();

    if (isEditing && project) {
      onUpdate?.(project.id, nextProject);
      return;
    }

    onCreate(nextProject);
  }

  async function pickFolder(currentPath = folderPath) {
    return selectProjectFolder(currentPath);
  }

  async function handleSelectFolder() {
    const selectedPath = await pickFolder(folderPath);
    if (selectedPath) {
      setFolderPath(selectedPath);
    }
  }

  function handleConfirmDelete() {
    if (!project) return;
    onDelete?.(project.id);
    setDeleteConfirmationOpen(false);
  }

  function goToNextStep() {
    const nextStep = wizardSteps[activeStepIndex + 1];
    if (nextStep && canEnterStep(nextStep.id, startMode, derivedMode, hasFolder, hasGithubRepository)) setActiveStep(nextStep.id);
  }

  function goToPreviousStep() {
    const previousStep = wizardSteps[activeStepIndex - 1];
    if (previousStep) setActiveStep(previousStep.id);
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20 p-4">
      <section className="flex max-h-[calc(100vh-32px)] w-[min(960px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-orange text-white">
              <FolderPlus size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-ink-primary">
                {isEditing ? "Editar proyecto de documentación" : "Crear proyecto de documentación"}
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-secondary">
                {isEditing ? "Actualiza la referencia local sin modificar los archivos del disco." : "Asistente para elegir origen, carpeta local, historial y conexión GitHub."}
              </p>
            </div>
          </div>
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-brand-hover" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
          {!isEditing ? (
            <aside className="min-h-0 overflow-y-auto border-b border-line bg-panel px-5 py-4 md:border-b-0 md:border-r">
              <div className="space-y-3">
                {wizardSteps.map((step, index) => {
                  const complete = index < activeStepIndex;
                  const selected = step.id === activeStep;
                  const reachable = canEnterStep(step.id, startMode, derivedMode, hasFolder, hasGithubRepository);

                  return (
                    <button
                      key={step.id}
                      disabled={!reachable}
                      className={[
                        "flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition",
                        selected ? "bg-white shadow-[0_1px_2px_rgba(17,24,39,0.08)]" : "hover:bg-white/70",
                        !reachable ? "cursor-not-allowed opacity-55 hover:bg-transparent" : "",
                      ].join(" ")}
                      type="button"
                      onClick={() => {
                        if (reachable) setActiveStep(step.id);
                      }}
                    >
                      <span
                        className={[
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                          selected || complete ? "border-brand-orange bg-brand-orange text-white" : "border-line bg-white text-ink-secondary",
                        ].join(" ")}
                      >
                        {complete ? <Check size={13} /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold text-ink-primary">{step.title}</span>
                        <span className="mt-0.5 block text-[10px] leading-4 text-ink-secondary">{step.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null}
          <div className="min-h-0 overflow-y-auto px-5 py-5">
            {isEditing ? (
              <EditProjectForm
                name={name}
                icon={icon}
                iconColor={iconColor}
                folderPath={folderPath}
                SelectedIcon={SelectedIcon}
                onNameChange={setName}
                onIconChange={setIcon}
                onIconColorChange={setIconColor}
                onFolderPathChange={setFolderPath}
                onSelectFolder={handleSelectFolder}
              />
            ) : activeStep === "scenario" ? (
              <ScenarioStep
                startMode={startMode}
                authStatus={authStatus}
                capabilities={capabilities}
                onLoginGithub={onLoginGithub}
                onSelect={(nextMode) => {
                  setStartMode(nextMode);
                  setLocalHistoryChoice(nextMode === "local-existing-git" ? "existing-github-remote" : "files-only");
                }}
              />
            ) : activeStep === "location" ? (
              <LocationStep
                startMode={startMode}
                folderPath={folderPath}
                newProjectParentPath={newProjectParentPath}
                newProjectFolderName={newProjectFolderName}
                finalFolderPath={finalFolderPath}
                authStatus={authStatus}
                githubRepositories={githubRepositories}
                githubRepositoriesLoading={githubRepositoriesLoading}
                selectedGithubRepository={selectedGithubRepository}
                githubOwner={githubOwner}
                githubRepo={githubRepo}
                onLoginGithub={onLoginGithub}
                onRefreshGithubRepositories={onRefreshGithubRepositories}
                onFolderPathChange={setFolderPath}
                onNewProjectParentPathChange={setNewProjectParentPath}
                onNewProjectFolderNameChange={setNewProjectFolderName}
                onGithubOwnerChange={setGithubOwner}
                onGithubRepoChange={setGithubRepo}
                onNameSuggestion={(nextName) => {
                  if (!name.trim()) setName(nextName);
                }}
                onSelectFolder={pickFolder}
              />
            ) : activeStep === "versioning" ? (
              <VersioningStep
                startMode={startMode}
                localHistoryChoice={localHistoryChoice}
                authStatus={authStatus}
                capabilities={capabilities}
                selectedGithubRepository={selectedGithubRepository}
                githubOwner={githubOwner}
                githubRepo={githubRepo}
                githubPublishVisibility={githubPublishVisibility}
                githubRepositories={githubRepositories}
                githubRepositoriesLoading={githubRepositoriesLoading}
                onLoginGithub={onLoginGithub}
                onRefreshGithubRepositories={onRefreshGithubRepositories}
                onHistoryChoiceChange={handleHistoryChoiceChange}
                onGithubOwnerChange={setGithubOwner}
                onGithubRepoChange={setGithubRepo}
                onGithubPublishVisibilityChange={setGithubPublishVisibility}
                onNameSuggestion={(nextName) => {
                  if (!name.trim()) setName(nextName);
                }}
              />
            ) : activeStep === "identity" ? (
              <ProjectIdentityStep
                name={name}
                icon={icon}
                iconColor={iconColor}
                SelectedIcon={SelectedIcon}
                mode={derivedMode}
                onNameChange={setName}
                onIconChange={setIcon}
                onIconColorChange={setIconColor}
              />
            ) : (
              <ProjectReviewStep
                SelectedIcon={SelectedIcon}
                iconColor={iconColor}
                previewName={previewName}
                items={reviewItems}
                derivedMode={derivedMode}
                authStatus={authStatus}
              />
            )}
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-5 py-4">
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
            <span className="text-[11px] text-ink-secondary">{getFooterHint(activeStep, startMode, derivedMode, hasFolder, hasGithubRepository)}</span>
          )}
          <div className="flex justify-end gap-2">
            {!isEditing && activeStepIndex > 0 ? (
              <button className="flex h-9 items-center gap-2 rounded-md border border-line px-3 text-[11px] hover:bg-panel" type="button" onClick={goToPreviousStep}>
                <ArrowLeft size={14} />
                Anterior
              </button>
            ) : null}
            <button className="h-9 rounded-md border border-line px-4 text-[11px] hover:bg-panel" onClick={onClose}>
              Cancelar
            </button>
            {!isEditing && activeStep !== "review" ? (
              <button
                className="flex h-9 items-center gap-2 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canContinue}
                onClick={goToNextStep}
              >
                Siguiente
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                className="h-9 rounded-md bg-brand-orange px-4 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {isEditing ? "Guardar cambios" : "Crear proyecto"}
              </button>
            )}
          </div>
        </footer>
      </section>
      {deleteConfirmationOpen && project ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/25">
          <section className="w-[min(440px,calc(100vw-32px))] rounded-lg border border-line bg-white shadow-menu">
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

function ScenarioStep({
  startMode,
  authStatus,
  capabilities,
  onLoginGithub,
  onSelect,
}: {
  startMode: ProjectStartMode;
  authStatus: AuthStatus;
  capabilities: ProjectCapabilities | null;
  onLoginGithub?: () => void;
  onSelect: (mode: ProjectStartMode) => void;
}) {
  const githubUnavailable = !authStatus.isAuthenticated || !capabilities?.canUseGithubApi;
  return (
    <section>
      <StepHeader
        title="Qué tipo de proyecto vas a configurar"
        description="La decisión importante es dónde existe hoy la documentación. A partir de ahí el asistente solo pide las opciones que afectan a ese caso."
      />
      <div role="tablist" aria-label="Situación inicial del proyecto" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeTab
          active={startMode === "local-new"}
          icon={FolderPlus}
          title="Carpeta local nueva"
          description="Empiezas desde cero. KnowNext.ai creará o usará una ruta local vacía para guardar Markdown."
          onClick={() => onSelect("local-new")}
        />
        <ModeTab
          active={startMode === "local-existing"}
          icon={HardDrive}
          title="Carpeta local existente"
          description="Ya tienes archivos Markdown en tu equipo. La app los abrirá sin moverlos ni reestructurarlos."
          onClick={() => onSelect("local-existing")}
        />
        <ModeTab
          active={startMode === "local-existing-git"}
          disabled={!capabilities?.canUseLocalGit}
          disabledReason="La integración de Git local todavía no está disponible en esta instalación."
          icon={FolderGit2}
          title="Carpeta con Git/GitHub"
          description="La carpeta ya tiene Git local, y puede tener remoto GitHub. KnowNext.ai respetará esa configuración."
          onClick={() => onSelect("local-existing-git")}
        />
        <ModeTab
          active={startMode === "github-existing"}
          disabled={githubUnavailable}
          disabledReason="Conecta GitHub para seleccionar un repositorio y crear su copia local de trabajo."
          icon={Github}
          title="Repo GitHub existente"
          description="La documentación ya vive en GitHub. Seleccionarás el repo y una carpeta local donde trabajar con su copia."
          onClick={() => onSelect("github-existing")}
        />
      </div>
      {!authStatus.isAuthenticated ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-3 text-[11px] text-ink-secondary">
          <span className="flex min-w-0 items-start gap-2">
            <Lock size={14} className="mt-0.5 shrink-0 text-brand-orange" />
            <span>Los proyectos de archivos locales funcionan sin cuenta. Conecta GitHub para traer repositorios, usar Git local versionado o asociar un remoto.</span>
          </span>
          <button className="shrink-0 font-semibold text-brand-orange hover:text-brand-dark" type="button" onClick={onLoginGithub}>
            Conectar GitHub
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LocationStep({
  startMode,
  folderPath,
  newProjectParentPath,
  newProjectFolderName,
  finalFolderPath,
  authStatus,
  githubRepositories,
  githubRepositoriesLoading,
  selectedGithubRepository,
  githubOwner,
  githubRepo,
  onLoginGithub,
  onRefreshGithubRepositories,
  onFolderPathChange,
  onNewProjectParentPathChange,
  onNewProjectFolderNameChange,
  onGithubOwnerChange,
  onGithubRepoChange,
  onNameSuggestion,
  onSelectFolder,
}: {
  startMode: ProjectStartMode;
  folderPath: string;
  newProjectParentPath: string;
  newProjectFolderName: string;
  finalFolderPath: string;
  authStatus: AuthStatus;
  githubRepositories: GithubRepositorySummary[];
  githubRepositoriesLoading: boolean;
  selectedGithubRepository?: GithubRepositorySummary;
  githubOwner: string;
  githubRepo: string;
  onLoginGithub?: () => void;
  onRefreshGithubRepositories?: () => void;
  onFolderPathChange: (path: string) => void;
  onNewProjectParentPathChange: (path: string) => void;
  onNewProjectFolderNameChange: (name: string) => void;
  onGithubOwnerChange: (owner: string) => void;
  onGithubRepoChange: (repo: string) => void;
  onNameSuggestion: (name: string) => void;
  onSelectFolder: (currentPath?: string) => Promise<string | null>;
}) {
  const isGithubSource = startMode === "github-existing";
  const isNewLocalProject = startMode === "local-new";
  return (
    <section>
      <StepHeader
        title={isGithubSource ? "Repo origen y carpeta local" : "Carpeta de documentación"}
        description={
          isGithubSource
            ? "Un proyecto de GitHub necesita dos datos: el repositorio remoto y la carpeta local donde KnowNext.ai guardará la copia editable."
            : isNewLocalProject
              ? "Define la ruta final que tendrá el proyecto en disco. Si la carpeta no existe, KnowNext.ai la creará al finalizar."
              : "Selecciona la carpeta de trabajo que ya contiene los Markdown. KnowNext.ai la abre sin moverla ni reestructurarla."
        }
      />
      <div className="mt-4 space-y-4">
        {isGithubSource ? (
          <GithubRepositoryFields
            authStatus={authStatus}
            githubRepositories={githubRepositories}
            githubRepositoriesLoading={githubRepositoriesLoading}
            selectedGithubRepository={selectedGithubRepository}
            githubOwner={githubOwner}
            githubRepo={githubRepo}
            onLoginGithub={onLoginGithub}
            onRefreshGithubRepositories={onRefreshGithubRepositories}
            onGithubOwnerChange={onGithubOwnerChange}
            onGithubRepoChange={onGithubRepoChange}
            onNameSuggestion={onNameSuggestion}
          />
        ) : null}
        {isNewLocalProject ? (
          <NewLocalProjectFolderFields
            parentPath={newProjectParentPath}
            folderName={newProjectFolderName}
            finalPath={finalFolderPath}
            onParentPathChange={onNewProjectParentPathChange}
            onFolderNameChange={onNewProjectFolderNameChange}
            onSelectParentFolder={onSelectFolder}
          />
        ) : (
          <LocalFolderField
            creationMode={isGithubSource ? "new-local" : "open-local"}
            folderPath={folderPath}
            label={isGithubSource ? "Carpeta local destino" : "Carpeta local"}
            description={localFolderDescription(startMode)}
            onFolderPathChange={onFolderPathChange}
            onSelectFolder={() => {
              onSelectFolder(folderPath).then((selectedPath) => {
                if (selectedPath) onFolderPathChange(selectedPath);
              });
            }}
          />
        )}
        {isGithubSource ? (
          <GuidanceNote
            title="Qué pasará al crear"
            description="KnowNext.ai descargará los Markdown del repositorio en la carpeta indicada y mantendrá metadatos de sincronización manual. No usa el nombre de rama como parte de la interfaz."
          />
        ) : null}
      </div>
    </section>
  );
}

function VersioningStep({
  startMode,
  localHistoryChoice,
  authStatus,
  capabilities,
  selectedGithubRepository,
  githubOwner,
  githubRepo,
  githubPublishVisibility,
  githubRepositories,
  githubRepositoriesLoading,
  onLoginGithub,
  onRefreshGithubRepositories,
  onHistoryChoiceChange,
  onGithubOwnerChange,
  onGithubRepoChange,
  onGithubPublishVisibilityChange,
  onNameSuggestion,
}: {
  startMode: ProjectStartMode;
  localHistoryChoice: LocalHistoryChoice;
  authStatus: AuthStatus;
  capabilities: ProjectCapabilities | null;
  selectedGithubRepository?: GithubRepositorySummary;
  githubOwner: string;
  githubRepo: string;
  githubPublishVisibility: GithubPublishVisibility;
  githubRepositories: GithubRepositorySummary[];
  githubRepositoriesLoading: boolean;
  onLoginGithub?: () => void;
  onRefreshGithubRepositories?: () => void;
  onHistoryChoiceChange: (choice: LocalHistoryChoice) => void;
  onGithubOwnerChange: (owner: string) => void;
  onGithubRepoChange: (repo: string) => void;
  onGithubPublishVisibilityChange: (visibility: GithubPublishVisibility) => void;
  onNameSuggestion: (name: string) => void;
}) {
  const publishUnavailable = !authStatus.isAuthenticated || !capabilities?.canUseGithubApi || !capabilities?.canUseLocalGit;

  if (startMode === "github-existing") {
    return (
      <section>
        <StepHeader
          title="Historial gestionado por GitHub"
          description="Como el origen es un repositorio remoto, el historial y las versiones se consultan en GitHub. Los cambios se publican de forma manual para evitar sobrescrituras inesperadas."
        />
        <div className="mt-4 space-y-3">
          <GuidanceNote
            icon={Cloud}
            title="Copia local conectada"
            description="La carpeta local actúa como área de trabajo. Al traer cambios se actualizan los Markdown desde GitHub; al crear versiones se envían los cambios al repositorio configurado."
          />
          <GuidanceNote
            icon={Info}
            title="Sin ramas en la interfaz"
            description="KnowNext.ai guarda internamente la rama por defecto detectada, pero la experiencia de producto no expone ramas al usuario."
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      <StepHeader
        title="Cómo quieres tratar el historial"
        description="Estas opciones separan documentación local, Git local ya presente y una posible relación con GitHub. Elige la que describe mejor tu carpeta actual."
      />
      <div role="tablist" aria-label="Configuración de historial" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeTab
          active={localHistoryChoice === "files-only"}
          icon={HardDrive}
          title="Solo archivos locales"
          description="No se inicializa Git ni se conecta GitHub. Recomendado para empezar rápido o revisar documentación existente."
          onClick={() => onHistoryChoiceChange("files-only")}
        />
        <ModeTab
          active={localHistoryChoice === "local-git"}
          disabled={!capabilities?.canUseLocalGit}
          disabledReason="La integración de Git local todavía no está disponible en esta instalación."
          icon={GitBranch}
          title="Usar Git local"
          description="Si la carpeta ya tiene .git se respeta; si no, KnowNext.ai prepara un repositorio local para versiones."
          onClick={() => onHistoryChoiceChange("local-git")}
        />
        <ModeTab
          active={localHistoryChoice === "existing-github-remote"}
          disabled={!capabilities?.canUseLocalGit}
          disabledReason="La integración de Git local todavía no está disponible en esta instalación."
          icon={Github}
          title="Git local con GitHub existente"
          description="Para carpetas que ya tienen remoto GitHub. Selecciona el repo para que la app entienda contra qué remoto sincronizas."
          onClick={() => onHistoryChoiceChange("existing-github-remote")}
        />
        <ModeTab
          active={localHistoryChoice === "publish-github"}
          disabled={publishUnavailable}
          disabledReason="Conecta GitHub para crear el repositorio remoto y preparar la sincronización desde esta carpeta local."
          icon={UploadCloud}
          title="Crear repo GitHub desde local"
          description="Crea un repo nuevo en GitHub y deja esta carpeta preparada con Git local y remoto origin."
          onClick={() => onHistoryChoiceChange("publish-github")}
        />
      </div>
      {localHistoryChoice === "existing-github-remote" ? (
        <div className="mt-4">
          <GithubRepositoryFields
            authStatus={authStatus}
            githubRepositories={githubRepositories}
            githubRepositoriesLoading={githubRepositoriesLoading}
            selectedGithubRepository={selectedGithubRepository}
            githubOwner={githubOwner}
            githubRepo={githubRepo}
            onLoginGithub={onLoginGithub}
            onRefreshGithubRepositories={onRefreshGithubRepositories}
            onGithubOwnerChange={onGithubOwnerChange}
            onGithubRepoChange={onGithubRepoChange}
            onNameSuggestion={onNameSuggestion}
          />
        </div>
      ) : null}
      {localHistoryChoice === "publish-github" ? (
        <div className="mt-4">
          <PublishGithubFields
            authStatus={authStatus}
            githubOwner={githubOwner}
            githubRepo={githubRepo}
            visibility={githubPublishVisibility}
            onLoginGithub={onLoginGithub}
            onGithubOwnerChange={onGithubOwnerChange}
            onGithubRepoChange={onGithubRepoChange}
            onVisibilityChange={onGithubPublishVisibilityChange}
          />
        </div>
      ) : null}
      {!authStatus.isAuthenticated && localHistoryChoice !== "files-only" ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-3 text-[11px] text-ink-secondary">
          <span className="flex min-w-0 items-start gap-2">
            <Lock size={14} className="mt-0.5 shrink-0 text-brand-orange" />
            <span>Conecta GitHub para activar historial versionado y sincronización. La opción de archivos locales no requiere cuenta.</span>
          </span>
          <button className="shrink-0 font-semibold text-brand-orange hover:text-brand-dark" type="button" onClick={onLoginGithub}>
            Conectar GitHub
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProjectIdentityStep({
  name,
  icon,
  iconColor,
  SelectedIcon,
  mode,
  onNameChange,
  onIconChange,
  onIconColorChange,
}: {
  name: string;
  icon: string;
  iconColor: string;
  SelectedIcon: LucideIcon;
  mode: DerivedProjectMode;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string) => void;
  onIconColorChange: (color: string) => void;
}) {
  return (
    <section>
      <StepHeader
        title="Nombre y apariencia"
        description="Estos datos solo ayudan a reconocer el proyecto dentro de KnowNext.ai. No cambian nombres de carpetas, repositorios ni archivos."
      />
      <div className="mt-4 space-y-5">
        <ProjectNameField name={name} iconColor={iconColor} SelectedIcon={SelectedIcon} onNameChange={onNameChange} />
        <ProjectVisualPicker icon={icon} iconColor={iconColor} onIconChange={onIconChange} onIconColorChange={onIconColorChange} />
        <GuidanceNote
          title="Resumen técnico"
          description={`Se registrará como ${mode.storageMode === "local-cache" ? "copia local conectada a GitHub" : "proyecto de archivos locales"} con historial ${versioningModeLabel(mode.versioningMode)}.`}
        />
      </div>
    </section>
  );
}

function EditProjectForm({
  name,
  icon,
  iconColor,
  folderPath,
  SelectedIcon,
  onNameChange,
  onIconChange,
  onIconColorChange,
  onFolderPathChange,
  onSelectFolder,
}: {
  name: string;
  icon: string;
  iconColor: string;
  folderPath: string;
  SelectedIcon: LucideIcon;
  onNameChange: (name: string) => void;
  onIconChange: (icon: string) => void;
  onIconColorChange: (color: string) => void;
  onFolderPathChange: (path: string) => void;
  onSelectFolder: () => void;
}) {
  return (
    <section className="space-y-5">
      <StepHeader
        title="Datos del proyecto"
        description="Ajusta la referencia que KnowNext.ai muestra y abre. Los cambios no modifican el contenido de la carpeta."
      />
      <ProjectNameField name={name} iconColor={iconColor} SelectedIcon={SelectedIcon} onNameChange={onNameChange} autoFocus />
      <LocalFolderField
        creationMode="open-local"
        folderPath={folderPath}
        label="Carpeta local"
        description="Selecciona la carpeta de documentación que este proyecto debe abrir."
        onFolderPathChange={onFolderPathChange}
        onSelectFolder={onSelectFolder}
      />
      <ProjectVisualPicker icon={icon} iconColor={iconColor} onIconChange={onIconChange} onIconColorChange={onIconColorChange} />
    </section>
  );
}

function ProjectReviewStep({
  SelectedIcon,
  iconColor,
  previewName,
  items,
  derivedMode,
  authStatus,
}: {
  SelectedIcon: LucideIcon;
  iconColor: string;
  previewName: string;
  items: { label: string; value: string }[];
  derivedMode: DerivedProjectMode;
  authStatus: AuthStatus;
}) {
  const requiresGithub = derivedMode.versioningMode !== "none";

  return (
    <section>
      <StepHeader
        title="Revisa la configuración"
        description="Antes de crear el proyecto, comprueba el origen, la carpeta local y cómo se gestionará el historial. Si algo no encaja, vuelve al paso correspondiente."
      />
      <div className="mt-5 rounded-md border border-line bg-white p-4">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-hover" style={{ color: iconColor }}>
            <SelectedIcon size={20} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink-primary">{previewName}</div>
            <div className="mt-0.5 text-[11px] text-ink-secondary">Se mostrará así en el selector de proyectos.</div>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="min-w-0 rounded-md border border-line bg-panel px-3 py-3">
              <dt className="text-[10px] font-medium text-ink-secondary">{item.label}</dt>
              <dd className="mt-1 truncate text-[11px] font-medium text-ink-primary" title={item.value}>{item.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4">
          <GuidanceNote
            icon={requiresGithub ? Github : Info}
            title={requiresGithub ? "Creación con GitHub" : "Creación local"}
            description={
              requiresGithub
                ? authStatus.isAuthenticated
                  ? "GitHub está conectado. KnowNext.ai guardará la relación con el repositorio y usará sincronización manual."
                  : "GitHub es necesario para esta configuración. Vuelve a conectar la cuenta antes de crear el proyecto."
                : "KnowNext.ai registrará la carpeta indicada sin mover archivos ni publicar cambios fuera del equipo."
            }
          />
        </div>
      </div>
    </section>
  );
}

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-ink-primary">{title}</h3>
      <p className="mt-1 max-w-[660px] text-[11px] leading-5 text-ink-secondary">{description}</p>
    </div>
  );
}

function GuidanceNote({
  icon: Icon = Info,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-3">
      <Icon size={15} className="mt-0.5 shrink-0 text-brand-orange" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-ink-primary">{title}</div>
        <p className="mt-0.5 text-[10px] leading-4 text-ink-secondary">{description}</p>
      </div>
    </div>
  );
}

function ProjectNameField({
  name,
  iconColor,
  SelectedIcon,
  onNameChange,
  autoFocus = false,
}: {
  name: string;
  iconColor: string;
  SelectedIcon: LucideIcon;
  onNameChange: (name: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block text-[11px] font-medium text-ink-secondary">
      Nombre del proyecto
      <div className="relative mt-2">
        <span className="pointer-events-none absolute left-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center" style={{ color: iconColor }}>
          <SelectedIcon size={17} />
        </span>
        <input
          className="h-10 w-full rounded-md border border-line py-0 pl-10 pr-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="ej. Documentación plataforma"
          autoFocus={autoFocus}
        />
      </div>
    </label>
  );
}

function NewLocalProjectFolderFields({
  parentPath,
  folderName,
  finalPath,
  onParentPathChange,
  onFolderNameChange,
  onSelectParentFolder,
}: {
  parentPath: string;
  folderName: string;
  finalPath: string;
  onParentPathChange: (path: string) => void;
  onFolderNameChange: (name: string) => void;
  onSelectParentFolder: (currentPath?: string) => Promise<string | null>;
}) {
  return (
    <div className="space-y-4">
      <label className="block text-[11px] font-medium text-ink-secondary">
        Selecciona la ubicación
        <span className="mt-1 block text-[10px] font-normal leading-4 text-ink-secondary">
          Elige la carpeta padre donde KnowNext.ai creará la nueva carpeta del proyecto.
        </span>
        <div className="mt-2 flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-panel px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={parentPath}
            onChange={(event) => onParentPathChange(event.target.value)}
            placeholder="C:\\Docs"
          />
          <button
            className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary hover:bg-brand-hover"
            type="button"
            onClick={() => {
              onSelectParentFolder(parentPath).then((selectedPath) => {
                if (selectedPath) onParentPathChange(selectedPath);
              });
            }}
          >
            <FolderOpen size={15} />
            Seleccionar
          </button>
        </div>
      </label>
      <label className="block text-[11px] font-medium text-ink-secondary">
        Nombre de la carpeta a crear
        <span className="mt-1 block text-[10px] font-normal leading-4 text-ink-secondary">
          Usa un nombre corto y reconocible. Esta carpeta se creará dentro de la ubicación seleccionada si aún no existe.
        </span>
        <input
          className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
          value={folderName}
          onChange={(event) => onFolderNameChange(event.target.value.replace(/[\\/]/g, ""))}
          placeholder="Nuevo proyecto"
        />
      </label>
      <div className="rounded-md border border-orange-200 bg-brand-hover px-3 py-3">
        <div className="flex items-start gap-3">
          <Info size={15} className="mt-0.5 shrink-0 text-brand-orange" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-ink-primary">Path final</div>
            <div
              className={[
                "mt-2 min-h-9 rounded-md border px-3 py-2 font-mono text-[11px] leading-5",
                finalPath ? "border-orange-200 bg-white text-ink-primary" : "border-line bg-white/70 text-ink-secondary",
              ].join(" ")}
              title={finalPath || undefined}
            >
              {finalPath || "Pendiente: selecciona una ubicación y escribe el nombre de la carpeta."}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-ink-secondary">
              Al finalizar, KnowNext.ai usará este path completo como carpeta local del proyecto.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocalFolderField({
  creationMode,
  folderPath,
  label,
  description,
  onFolderPathChange,
  onSelectFolder,
}: {
  creationMode: ProjectCreationMode;
  folderPath: string;
  label: string;
  description: string;
  onFolderPathChange: (path: string) => void;
  onSelectFolder: () => void;
}) {
  return (
    <label className="block text-[11px] font-medium text-ink-secondary">
      {label}
      <span className="mt-1 block text-[10px] font-normal leading-4 text-ink-secondary">{description}</span>
      <div className="mt-2 flex gap-2">
        <div className="min-w-0 flex-1" data-tooltip={folderPath || undefined}>
          <input
            className={[
              "h-10 w-full min-w-0 rounded-md border border-line bg-panel px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange",
              creationMode === "new-local" ? "" : "cursor-default",
            ].join(" ")}
            value={folderPath}
            readOnly={creationMode !== "new-local"}
            onChange={(event) => onFolderPathChange(event.target.value)}
            placeholder={creationMode === "new-local" ? "C:\\Docs\\Nuevo proyecto" : "Selecciona una ruta local completa"}
          />
        </div>
        <button
          className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary hover:bg-brand-hover"
          type="button"
          onClick={onSelectFolder}
        >
          <FolderOpen size={15} />
          Seleccionar
        </button>
      </div>
    </label>
  );
}

function PublishGithubFields({
  authStatus,
  githubOwner,
  githubRepo,
  visibility,
  onLoginGithub,
  onGithubOwnerChange,
  onGithubRepoChange,
  onVisibilityChange,
}: {
  authStatus: AuthStatus;
  githubOwner: string;
  githubRepo: string;
  visibility: GithubPublishVisibility;
  onLoginGithub?: () => void;
  onGithubOwnerChange: (owner: string) => void;
  onGithubRepoChange: (repo: string) => void;
  onVisibilityChange: (visibility: GithubPublishVisibility) => void;
}) {
  return (
    <div className="space-y-4 rounded-md border border-line bg-panel px-3 py-3">
      {!authStatus.isAuthenticated ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-3 text-[11px] text-ink-secondary">
          <span className="flex min-w-0 items-start gap-2">
            <Lock size={14} className="mt-0.5 shrink-0 text-brand-orange" />
            <span>Conecta GitHub para crear el repositorio remoto desde esta carpeta local.</span>
          </span>
          <button className="shrink-0 font-semibold text-brand-orange hover:text-brand-dark" type="button" onClick={onLoginGithub}>
            Conectar
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <label className="block text-[11px] font-medium text-ink-secondary">
          Propietario GitHub
          <input
            className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={githubOwner}
            onChange={(event) => onGithubOwnerChange(event.target.value)}
            placeholder={authStatus.user?.login ?? "usuario"}
          />
        </label>
        <label className="block text-[11px] font-medium text-ink-secondary">
          Nombre del nuevo repo
          <input
            className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={githubRepo}
            onChange={(event) => onGithubRepoChange(sanitizeGithubRepoNameInput(event.target.value))}
            placeholder="documentacion-proyecto"
          />
        </label>
      </div>
      <div className="text-[11px] font-medium text-ink-secondary">
        Visibilidad
        <div role="tablist" aria-label="Visibilidad del nuevo repo GitHub" className="mt-2 grid grid-cols-2 gap-2">
          <button
            role="tab"
            aria-selected={visibility === "private"}
            className={[
              "rounded-md border px-3 py-2 text-left text-[11px] transition",
              visibility === "private" ? "border-brand-orange bg-brand-hover text-ink-primary" : "border-line bg-white text-ink-secondary hover:bg-brand-hover",
            ].join(" ")}
            type="button"
            onClick={() => onVisibilityChange("private")}
          >
            <span className="block font-semibold">Privado</span>
            <span className="mt-0.5 block text-[10px] leading-4">Solo usuarios con permisos del repo.</span>
          </button>
          <button
            role="tab"
            aria-selected={visibility === "public"}
            className={[
              "rounded-md border px-3 py-2 text-left text-[11px] transition",
              visibility === "public" ? "border-brand-orange bg-brand-hover text-ink-primary" : "border-line bg-white text-ink-secondary hover:bg-brand-hover",
            ].join(" ")}
            type="button"
            onClick={() => onVisibilityChange("public")}
          >
            <span className="block font-semibold">Público</span>
            <span className="mt-0.5 block text-[10px] leading-4">Visible para cualquiera en GitHub.</span>
          </button>
        </div>
      </div>
      <GuidanceNote
        icon={UploadCloud}
        title="Qué pasará al crear"
        description="KnowNext.ai inicializará Git local si hace falta, pedirá a GitHub crear el repo indicado y configurará origin para que las versiones locales puedan publicarse."
      />
    </div>
  );
}

function GithubRepositoryFields({
  authStatus,
  githubRepositories,
  githubRepositoriesLoading,
  selectedGithubRepository,
  githubOwner,
  githubRepo,
  onLoginGithub,
  onRefreshGithubRepositories,
  onGithubOwnerChange,
  onGithubRepoChange,
  onNameSuggestion,
}: {
  authStatus: AuthStatus;
  githubRepositories: GithubRepositorySummary[];
  githubRepositoriesLoading: boolean;
  selectedGithubRepository?: GithubRepositorySummary;
  githubOwner: string;
  githubRepo: string;
  onLoginGithub?: () => void;
  onRefreshGithubRepositories?: () => void;
  onGithubOwnerChange: (owner: string) => void;
  onGithubRepoChange: (repo: string) => void;
  onNameSuggestion: (name: string) => void;
}) {
  return (
    <div className="space-y-3">
      {!authStatus.isAuthenticated ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-orange-200 bg-brand-hover px-3 py-3 text-[11px] text-ink-secondary">
          <span className="flex min-w-0 items-center gap-2">
            <Lock size={14} className="shrink-0 text-brand-orange" />
            Conecta GitHub para cargar repositorios y permisos.
          </span>
          <button className="shrink-0 font-semibold text-brand-orange hover:text-brand-dark" type="button" onClick={onLoginGithub}>
            Conectar
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-[11px] font-medium text-ink-secondary">
          Repositorio GitHub
          <select
            className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={githubOwner && githubRepo ? `${githubOwner}/${githubRepo}` : ""}
            onChange={(event) => {
              const repository = githubRepositories.find((candidate) => candidate.fullName === event.target.value);
              if (!repository) return;
              onGithubOwnerChange(repository.owner);
              onGithubRepoChange(repository.repo);
              onNameSuggestion(repository.repo);
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line hover:bg-brand-hover disabled:opacity-50"
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-medium text-ink-secondary">
          Propietario
          <input
            className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={githubOwner}
            onChange={(event) => onGithubOwnerChange(event.target.value)}
            placeholder="owner"
          />
        </label>
        <label className="block text-[11px] font-medium text-ink-secondary">
          Repositorio
          <input
            className="mt-2 h-10 w-full rounded-md border border-line px-3 text-[11px] text-ink-primary outline-none focus:border-brand-orange"
            value={githubRepo}
            onChange={(event) => onGithubRepoChange(event.target.value)}
            placeholder="repo"
          />
        </label>
      </div>
      {selectedGithubRepository ? (
        <div className="rounded-md border border-line bg-panel px-3 py-2 text-[11px] text-ink-secondary">
          Rama por defecto interna: {selectedGithubRepository.defaultRef ?? "detectada por GitHub"}. Sincronización manual para evitar cambios inesperados.
        </div>
      ) : null}
    </div>
  );
}

function ProjectVisualPicker({
  icon,
  iconColor,
  onIconChange,
  onIconColorChange,
}: {
  icon: string;
  iconColor: string;
  onIconChange: (icon: string) => void;
  onIconColorChange: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
      <div className="text-[11px] font-medium text-ink-secondary">
        Icono
        <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-8">
          {projectIconOptions.map((option) => {
            const OptionIcon = option.icon;
            const selected = option.id === icon;

            return (
              <button
                key={option.id}
                className={[
                  "relative grid h-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange",
                  selected ? "bg-brand-hover text-brand-orange" : "",
                ].join(" ")}
                type="button"
                data-tooltip={option.label}
                aria-label={`Icono ${option.label}`}
                onClick={() => onIconChange(option.id)}
              >
                <OptionIcon size={19} strokeWidth={selected ? 2.25 : 1.9} style={selected ? { color: iconColor } : undefined} />
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-[11px] font-medium text-ink-secondary">
        Color
        <div className="mt-2 grid grid-cols-6 gap-2">
          {projectColors.map((color) => (
            <button
              key={color}
              className="grid h-8 place-items-center rounded-full"
              type="button"
              onClick={() => onIconColorChange(color)}
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
  );
}

function ModeTab({
  active,
  disabled = false,
  disabledReason,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  disabledReason?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-disabled={disabled}
      className={[
        "min-h-[88px] rounded-md border px-3 py-3 text-left transition",
        active ? "border-brand-orange bg-brand-hover text-ink-primary shadow-[inset_0_0_0_1px_rgba(243,112,33,0.18)]" : "border-line bg-white text-ink-primary hover:border-orange-200 hover:bg-brand-hover",
        disabled ? "cursor-not-allowed bg-panel text-ink-secondary hover:border-line hover:bg-panel" : "",
      ].join(" ")}
      type="button"
      onClick={() => {
        if (!disabled) onClick();
      }}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} className={active ? "text-brand-orange" : "text-ink-secondary"} />
        <span className="text-[11px] font-semibold">{title}</span>
        {disabled ? (
          <span
            className="ml-auto text-ink-primary"
            data-tooltip={disabledReason ?? "No disponible"}
            aria-label={disabledReason ?? "No disponible"}
          >
            <Lock size={13} />
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{description}</p>
    </button>
  );
}

function deriveProjectMode(startMode: ProjectStartMode, localHistoryChoice: LocalHistoryChoice): DerivedProjectMode {
  if (startMode === "github-existing") {
    return {
      creationMode: "github-repository",
      versioningMode: "github-api",
      storageMode: "local-cache",
      syncMode: "manual-github",
      requiresGithubRepository: true,
    };
  }

  const creationMode: ProjectCreationMode = startMode === "local-new" ? "new-local" : "open-local";
  if (localHistoryChoice === "local-git") {
    return { creationMode, versioningMode: "local-git", storageMode: "local-files", syncMode: "none", requiresGithubRepository: false };
  }
  if (localHistoryChoice === "existing-github-remote") {
    return { creationMode, versioningMode: "local-git", storageMode: "local-files", syncMode: "manual-github", requiresGithubRepository: true };
  }
  if (localHistoryChoice === "publish-github") {
    return { creationMode, versioningMode: "local-git", storageMode: "local-files", syncMode: "manual-github", requiresGithubRepository: true };
  }
  return { creationMode, versioningMode: "none", storageMode: "local-files", syncMode: "none", requiresGithubRepository: false };
}

function getStepCanContinue(
  step: WizardStepId,
  startMode: ProjectStartMode,
  derivedMode: DerivedProjectMode,
  hasFolder: boolean,
  hasGithubRepository: boolean,
) {
  if (step === "location") {
    if (startMode === "github-existing") return hasFolder && hasGithubRepository;
    return hasFolder;
  }
  if (step === "versioning") {
    return !derivedMode.requiresGithubRepository || hasGithubRepository;
  }
  if (step === "identity") {
    return hasFolder && (!derivedMode.requiresGithubRepository || hasGithubRepository);
  }
  return true;
}

function canEnterStep(
  step: WizardStepId,
  startMode: ProjectStartMode,
  derivedMode: DerivedProjectMode,
  hasFolder: boolean,
  hasGithubRepository: boolean,
) {
  if (step === "scenario" || step === "location") return true;
  const locationComplete = startMode === "github-existing" ? hasFolder && hasGithubRepository : hasFolder;
  if (!locationComplete) return false;
  if (step === "versioning") return true;
  const versioningComplete = !derivedMode.requiresGithubRepository || hasGithubRepository;
  if (!versioningComplete) return false;
  return true;
}

function getFooterHint(
  step: WizardStepId,
  startMode: ProjectStartMode,
  derivedMode: DerivedProjectMode,
  hasFolder: boolean,
  hasGithubRepository: boolean,
) {
  if (step === "location" && startMode === "github-existing" && !hasGithubRepository) return "Selecciona o escribe el repositorio GitHub.";
  if (step === "location" && startMode === "local-new" && !hasFolder) return "Selecciona la ubicación y escribe el nombre de la carpeta para continuar.";
  if (step === "location" && !hasFolder) return "Selecciona la carpeta local para continuar.";
  if (step === "versioning" && derivedMode.requiresGithubRepository && !hasGithubRepository) return "Selecciona el repositorio GitHub asociado.";
  return "";
}

function localFolderDescription(startMode: ProjectStartMode) {
  if (startMode === "github-existing") return "Elige dónde se guardará la copia local editable del repositorio. La carpeta puede estar vacía o dedicada a este proyecto.";
  if (startMode === "local-existing-git") return "Selecciona la carpeta que ya contiene la documentación y la configuración Git existente.";
  return "Selecciona la carpeta que ya contiene la documentación. La app no la mueve ni la reestructura.";
}

function joinProjectFolderPath(parentPath: string, folderName: string) {
  const cleanFolderName = folderName.trim();
  if (!cleanFolderName) return trimTrailingPathSeparators(parentPath.trim());

  const cleanParentPath = trimTrailingPathSeparators(parentPath.trim());
  if (!cleanParentPath) return cleanFolderName;
  const separator = cleanParentPath.includes("/") && !cleanParentPath.includes("\\") ? "/" : "\\";
  if (/^[A-Za-z]:$/.test(cleanParentPath)) return `${cleanParentPath}\\${cleanFolderName}`;
  return `${cleanParentPath}${separator}${cleanFolderName}`;
}

function trimTrailingPathSeparators(path: string) {
  if (/^[A-Za-z]:[\\/]$/.test(path)) return path;
  if (/^[\\/]+$/.test(path)) return path;
  return path.replace(/[\\/]+$/, "");
}

function lastPathSegment(path: string) {
  const cleanPath = trimTrailingPathSeparators(path.trim());
  if (!cleanPath) return "";
  const separatorIndex = Math.max(cleanPath.lastIndexOf("\\"), cleanPath.lastIndexOf("/"));
  return separatorIndex >= 0 ? cleanPath.slice(separatorIndex + 1) : cleanPath;
}

function slugifyGithubRepoName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function sanitizeGithubRepoNameInput(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 100);
}

function startModeLabel(startMode: ProjectStartMode) {
  if (startMode === "github-existing") return "Repo GitHub existente";
  if (startMode === "local-new") return "Carpeta local nueva";
  if (startMode === "local-existing-git") return "Carpeta con Git/GitHub";
  return "Carpeta local existente";
}

function historyChoiceLabel(startMode: ProjectStartMode, localHistoryChoice: LocalHistoryChoice) {
  if (startMode === "github-existing") return "GitHub versionado";
  if (localHistoryChoice === "local-git") return "Git local";
  if (localHistoryChoice === "existing-github-remote") return "Git local + GitHub existente";
  if (localHistoryChoice === "publish-github") return "Publicar en GitHub";
  return "Solo archivos locales";
}

function versioningModeLabel(versioningMode: VersioningMode) {
  if (versioningMode === "github-api") return "GitHub";
  if (versioningMode === "local-git") return "Git local";
  return "desactivado";
}
