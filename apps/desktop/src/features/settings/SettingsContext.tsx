import type { AppSettingsSection } from "../../types/settings";
import { getSettingsSections } from "./settingsSections";

export function SettingsContext({section,language,projectName}: {section: AppSettingsSection;language: "es" | "en";projectName?: string}) {
  const english = language === "en";
  const current = getSettingsSections(language).find(item => item.id === section)!;
  const descriptions: Record<AppSettingsSection, string> = english ? {
    summary: "These settings belong to this device. Returning to your document keeps its open session.",
    interface: "Appearance and reading preferences apply to the workspace. They do not change your document content.",
    ai: "Connection, models and allowed actions share one configuration. Advanced view reveals more controls without selecting another configuration.",
    audio: "Recording sources and transcription settings belong to this device. Session controls remain available from Recordings.",
    skills: "Inspect the instructions used by the assistant. A skill does not replace the allowed-action settings.",
    capabilities: "Choose which capabilities are available to the assistant. Each operation still uses its runtime permissions and scope.",
    export: "These styles apply to subsequent exports. Changing a style does not modify the source document.",
    system: "Local service status and diagnostic preferences help inspect this installation.",
  } : {
    summary: "Estos ajustes pertenecen a este dispositivo. Volver al documento conserva su sesión abierta.",
    interface: "Las preferencias de apariencia y lectura se aplican al espacio de trabajo. No cambian el contenido del documento.",
    ai: "Conexión, modelos y acciones permitidas comparten una configuración. La vista avanzada muestra más controles sin seleccionar otra configuración.",
    audio: "Las fuentes de grabación y los ajustes de transcripción pertenecen a este dispositivo. Los controles de sesión siguen disponibles en Grabaciones.",
    skills: "Puedes inspeccionar las instrucciones del asistente. Una skill no sustituye los ajustes de acciones permitidas.",
    capabilities: "Elige las capacidades disponibles para el asistente. Cada operación mantiene sus permisos y ámbito en el runtime.",
    export: "Estos estilos se aplican a las siguientes exportaciones. Cambiar un estilo no modifica el documento de origen.",
    system: "El estado de servicios locales y los ajustes de diagnóstico permiten revisar esta instalación.",
  };
  return <section className="px-2 py-3" aria-label={english ? "Settings scope and help" : "Ayuda y ámbito de configuración"}><h3 className="text-base font-semibold">{current.label}</h3><p className="mt-2 text-xs text-ink-secondary">{english ? "This device" : "Este dispositivo"}</p><p className="mt-5 text-sm leading-6 text-ink-secondary">{descriptions[section]}</p>{(section === "ai" || section === "summary") && <div className="mt-6"><h4 className="text-sm font-semibold">{english ? "Document index" : "Índice documental"}</h4><p className="mt-2 break-words text-sm leading-6 text-ink-secondary">{projectName ? `${english ? "The index shown belongs to" : "El índice mostrado pertenece a"} ${projectName}.` : english ? "Select a project to inspect its document index." : "Selecciona un proyecto para consultar su índice documental."}</p></div>}</section>;
}
