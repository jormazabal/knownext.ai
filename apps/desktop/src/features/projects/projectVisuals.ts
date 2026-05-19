import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Folder,
  Layers,
  Lightbulb,
  Network,
  Rocket,
  Settings,
  ShieldCheck,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const projectIconOptions = [
  { id: "folder", label: "Carpeta", icon: Folder },
  { id: "docs", label: "Documentos", icon: FileText },
  { id: "book", label: "Manual", icon: BookOpen },
  { id: "layers", label: "Arquitectura", icon: Layers },
  { id: "tasks", label: "Tareas", icon: ClipboardList },
  { id: "code", label: "Código", icon: Code2 },
  { id: "database", label: "Datos", icon: Database },
  { id: "boxes", label: "Módulos", icon: Boxes },
  { id: "rocket", label: "Lanzamiento", icon: Rocket },
  { id: "security", label: "Seguridad", icon: ShieldCheck },
  { id: "tools", label: "Herramientas", icon: Wrench },
  { id: "settings", label: "Configuración", icon: Settings },
  { id: "business", label: "Negocio", icon: BriefcaseBusiness },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
  { id: "network", label: "Red", icon: Network },
  { id: "workflow", label: "Flujo", icon: Workflow },
] satisfies Array<{ id: string; label: string; icon: LucideIcon }>;

export const projectColors = [
  "#F37021",
  "#F59E0B",
  "#EAB308",
  "#84CC16",
  "#22C55E",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
  "#4F46E5",
  "#7C3AED",
  "#A855F7",
  "#D946EF",
  "#E11D48",
  "#DC2626",
  "#E24A1A",
];

export function getProjectIcon(iconId?: string) {
  return projectIconOptions.find((option) => option.id === iconId)?.icon ?? Folder;
}
