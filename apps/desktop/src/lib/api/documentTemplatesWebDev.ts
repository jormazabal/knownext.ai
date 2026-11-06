// Browser-only fixtures for the native template contract; no filesystem or provider access.
import type { DocumentTemplate, DocumentTemplatePreview, TemplateRenderRequest } from "../../types/documentTemplates";

function spans(markdown: string) {
  const result: { start: number; end: number; key: string }[] = [];
  let offset = 0;
  while (true) {
    const start = markdown.indexOf("{{", offset);
    if (start < 0) break;
    const closing = markdown.indexOf("}}", start + 2);
    if (closing < 0) break;
    const key = markdown.slice(start + 2, closing);
    let escaped = 0;
    for (let index = start - 1; index >= 0 && markdown[index] === "\\"; index--) escaped++;
    if (escaped % 2 === 0 && /^[a-z][a-z0-9_]{0,39}$/.test(key)) result.push({ start, end: closing + 2, key });
    offset = closing + 2;
  }
  return result;
}
function variables(markdown: string) {
  const keys = [...new Set(spans(markdown).map(span => span.key))];
  if (keys.length > 32) throw new Error("La plantilla admite hasta 32 campos diferentes");
  return keys;
}
export function inspectWebTemplateTransfer(content: string) {
  if (typeof content !== "string" || new TextEncoder().encode(content).length > 2 * 1024 * 1024) throw new Error("El archivo de plantilla supera 2 MiB");
  const data = JSON.parse(content);
  if (!data || Array.isArray(data) || data.format !== "knownext.document-template" || data.schemaVersion !== 1 || Object.keys(data).sort().join(",") !== "description,format,markdown,name,schemaVersion" || typeof data.description !== "string") throw new Error("Formato o versión de plantilla no compatible o campos adicionales");
  const checked = captureWebDocumentTemplate({ name: data.name, description: data.description, markdown: data.markdown });
  return { name: checked.name, description: checked.description, markdown: checked.markdown, variables: checked.variables, byteLength: new TextEncoder().encode(content).length };
}
function portable(markdown: string) {
  for (const match of markdown.matchAll(/(!?)\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[2].toLowerCase();
    if (spans(target).some(span => span.start === 0 && span.end === target.length)) continue;
    if (match[1] && !target.startsWith("data:image/")) throw new Error("La plantilla necesita imágenes embebidas. La captura de recursos locales requiere el runtime nativo.");
    if (!/^(https?:\/\/|mailto:|data:image\/|#)/.test(target)) throw new Error("La plantilla contiene un recurso o enlace local. Prepara una copia sin rutas locales.");
  }
}
export function initialWebDocumentTemplates(): DocumentTemplate[] {
  return [
    ["blank", "Documento en blanco", "# {{titulo}}\n\n"],
    ["meeting", "Acta de reunión", "# {{titulo}}\n\n## Información general\n\n## Asistentes\n\n## Acuerdos\n\n- [ ] Nueva tarea\n"],
    ["requirements", "Requisitos", "# {{titulo}}\n\n## Requisitos funcionales\n\n- \n\n## Requisitos no funcionales\n\n- \n"],
    ["decision", "Decisión técnica", "# {{titulo}}\n\n## Contexto\n\n## Decisión\n\n## Consecuencias\n\n"],
  ].map(([id, name, markdown]) => ({ id, name, markdown, variables: variables(markdown), description: "Plantilla inicial de KnowNext.ai", revision: `web-dev-${id}-v1`, builtIn: true, createdAt: null }));
}
export function captureWebDocumentTemplate(body: Record<string, unknown>): DocumentTemplate {
  if (Object.keys(body).some(key => !["name", "description", "markdown"].includes(key)) || typeof body.name !== "string" || !body.name.trim() || typeof body.markdown !== "string") throw new Error("Datos de plantilla no válidos");
  if (new TextEncoder().encode(body.markdown).length > 1024 * 1024) throw new Error("La plantilla supera 1 MiB");
  portable(body.markdown);
  const id = `custom-web-${crypto.randomUUID()}`;
  return { id, name: body.name.trim(), description: typeof body.description === "string" ? body.description : "", markdown: body.markdown, variables: variables(body.markdown), revision: `web-dev-${id}`, builtIn: false, createdAt: new Date().toISOString() };
}
export function renderWebDocumentTemplate(template: DocumentTemplate, input: TemplateRenderRequest, projectName: string, projectRootHash: string): DocumentTemplatePreview {
  if (input.revision !== template.revision) throw new Error("La plantilla cambió. Vuelve a cargarla.");
  const name = input.name?.trim();
  if (!name || /[\\/\0]/.test(name) || !name.toLowerCase().endsWith(".md") || name.toLowerCase() === ".md") throw new Error("Nombre Markdown no válido");
  const values = { ...input.values };
  for (const [key, value] of Object.entries(values)) if (!template.variables.includes(key) || typeof value !== "string" || value.length > 16384) throw new Error("Campo de plantilla no válido");
  const defaults: Record<string, string> = { titulo: name.slice(0, -3).replace(/-/g, " "), fecha: input.localDate ?? new Date().toISOString().slice(0, 10), proyecto: projectName };
  for (const key of template.variables) {
    if (!(key in values) && key in defaults) values[key] = defaults[key];
    if (!values[key]?.trim()) throw new Error(`Completa el campo {{${key}}}`);
  }
  let markdown = ""; let offset = 0;
  for (const span of spans(template.markdown)) { markdown += template.markdown.slice(offset, span.start) + values[span.key]; offset = span.end; }
  markdown += template.markdown.slice(offset);
  if (new TextEncoder().encode(markdown).length > 2 * 1024 * 1024) throw new Error("El documento generado supera 2 MiB");
  portable(markdown);
  return { templateId: template.id, revision: template.revision, name, markdown, values, projectRootHash };
}
