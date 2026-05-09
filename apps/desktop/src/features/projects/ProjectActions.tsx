import {
  ChevronDown,
  ChevronUp,
  FilePlus2,
  FolderPlus,
  LogOut,
  Search,
  Settings,
  UserPlus,
} from "lucide-react";

const actions = [
  { id: "search", label: "Buscar", icon: Search },
  { id: "folder", label: "Crear carpeta", icon: FolderPlus },
  { id: "document", label: "Crear documento", icon: FilePlus2 },
  { id: "expand", label: "Expandir árbol", icon: ChevronDown },
  { id: "collapse", label: "Contraer árbol", icon: ChevronUp },
  { id: "settings", label: "Configurar proyecto", icon: Settings },
];

type ProjectActionsProps = {
  appVersion: string;
  onCreateFolder: () => void;
  onCreateDocument: () => void;
  onExpandTree: () => void;
  onCollapseTree: () => void;
  onConfigureProject: () => void;
};

const userMenuItems = [
  { label: "Añadir cuenta Git", icon: UserPlus },
  { label: "Configuración de la app", icon: Settings },
  { label: "Cerrar sesión", icon: LogOut },
];

export function ProjectActions({
  appVersion,
  onCreateFolder,
  onCreateDocument,
  onExpandTree,
  onCollapseTree,
  onConfigureProject,
}: ProjectActionsProps) {
  function handleAction(actionId: string) {
    if (actionId === "folder") onCreateFolder();
    if (actionId === "document") onCreateDocument();
    if (actionId === "expand") onExpandTree();
    if (actionId === "collapse") onCollapseTree();
    if (actionId === "settings") onConfigureProject();
  }

  return (
    <div className="mt-auto border-t border-line px-4 py-2">
      <div className="flex items-center justify-between">
        {actions.map((action) => (
          <button
            key={action.label}
            className="grid h-8 w-8 place-items-center rounded-md hover:bg-brand-hover"
            data-tooltip={action.label}
            aria-label={action.label}
            onClick={() => handleAction(action.id)}
          >
            <action.icon size={16} />
          </button>
        ))}
      </div>
      <div className="group relative mt-2 border-t border-line pt-2">
        <button className="flex h-9 w-full min-w-0 items-center gap-3 rounded-md px-1 text-left hover:bg-brand-hover">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-hover text-[12px] font-semibold text-brand-orange">
            AD
          </span>
          <span className="truncate text-[13px] font-medium">Ana Domínguez</span>
        </button>
        <div className="pointer-events-none absolute bottom-[42px] left-0 z-40 w-[228px] opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="rounded-md border border-line bg-white p-1 shadow-menu">
            <div className="px-2 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-ink-primary">Ana Domínguez</p>
                  <p className="text-[10px] text-ink-secondary">Cuenta Git asociada</p>
                </div>
                <span className="shrink-0 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary">
                  v{appVersion}
                </span>
              </div>
            </div>
            {userMenuItems.map((item) => (
              <button
                key={item.label}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[12px] hover:bg-brand-hover"
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
