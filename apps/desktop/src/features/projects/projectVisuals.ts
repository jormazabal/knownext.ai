import {
  BookOpen,
  Boxes,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Folder,
  Layers,
  Rocket,
  Settings,
  ShieldCheck,
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
] satisfies Array<{ id: string; label: string; icon: LucideIcon }>;

export const projectColors = [
  "#F37021",
  "#F59E0B",
  "#FACC15",
  "#A3E635",
  "#65A30D",
  "#16A34A",
  "#0891B2",
  "#2563EB",
  "#1D4ED8",
  "#7F1D1D",
  "#BE123C",
  "#DC2626",
];

export function getProjectIcon(iconId?: string) {
  return projectIconOptions.find((option) => option.id === iconId)?.icon ?? Folder;
}
