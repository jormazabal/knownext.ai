import type { AppSettingsSection } from "../../types/settings";
import { getSettingsSections } from "./settingsSections";

// Topics point to real categories, not to individual controls or provider calls.
const topics: Record<AppSettingsSection, string> = {
  summary: "resumen estado general overview status summary",
  interface: "idioma language zoom tamaño tema theme claro light oscuro dark sistema color acento accent subrayado underline",
  ai: "privacidad privacy retención retention conservación eliminar datos pausa envíos recuperar credenciales copias protegidas rotación seguridad recovery rotation security openai clave credenciales api key credentials modelo documental model contexto context índice index rag reindexar documentos fuentes sources revisar ediciones revisión confirmación review edits apply",
  audio: "micrófono microphone altavoces speakers sistema fuentes grabación recording reunión meeting dispositivos devices conservar audio retención retention bandeja tray windows idiomas languages transcripción transcription",
  skills: "skills habilidades instrucciones instructions manifiesto manifest ejemplos examples validación validation diagnóstico diagnostics",
  capabilities: "permisos permissions visión vision imágenes images generación generation modelos models transcripción transcription dictado dictation voz voice diagramas diagrams mermaid iconos icons trazos strokes dibujo drawing manuscrito handwritten agente agent investigación research profundidad depth pasos steps documentos documents coste cost presupuesto budget web confirmar confirm",
  export: "pdf word docx html márgenes margins a4 página page tipografía typography fuentes fonts títulos headings código code párrafos paragraphs interlineado spacing color enlaces links diagramas diagrams resolución resolution restablecer reset plantilla template",
  system: "runtime logs trazas tracing registro diagnóstico diagnostics servicios services rendimiento performance latencia latency tiempos timings p95 memoria memory carpeta folder versión version perfil profile almacenamiento storage uso usage datos locales local data ubicaciones locations tamaño size disco disk borradores drafts papelera trash",
};
function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
export function searchSettingsSections(query: string, language: "es" | "en") {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return getSettingsSections(language).filter(section => {
    const searchable = normalized(`${section.label} ${section.description} ${topics[section.id]}`);
    return words.every(word => searchable.includes(word));
  });
}
