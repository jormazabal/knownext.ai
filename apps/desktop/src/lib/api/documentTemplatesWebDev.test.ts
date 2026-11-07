import { beforeEach, expect, it } from "vitest";
import { handleWebDevLocalApiRequest as request } from "./webDevLocalApi";
import type { DocumentTemplate, DocumentTemplateInventory, DocumentTemplatePreview } from "../../types/documentTemplates";
import type { FileOperationResult } from "../../types/domain";
beforeEach(() => localStorage.removeItem("knownext.web-dev.local-api"));
it("roundtrips explicit portable data, rejects stale bytes and renames a duplicate without overwriting", async () => {
  const saved = await request<DocumentTemplate>("POST", "/api/document-templates", { name: "Portable", description: "Structure", markdown: "# {{titulo}}\n{{asistentes}}" });
  const file = await request<{ content: string; digest: string }>("POST", `/api/document-templates/${saved.body.id}/transfer`, { revision: saved.body.revision });
  const review = await request<{ digest: string }>("POST", "/api/document-templates/transfer/inspect", { content: file.body.content });
  const body = { content: file.body.content, digest: review.body.digest, name: "Portable" };
  expect((await request("POST", "/api/document-templates/transfer/import", body)).status).toBe(400);
  expect((await request("POST", "/api/document-templates/transfer/import", { ...body, content: body.content + " ", name: "Changed" })).status).toBe(400);
  const imported = await request<DocumentTemplate>("POST", "/api/document-templates/transfer/import", { ...body, name: "Received" });
  expect(imported.status).toBe(200); expect(imported.body.id).not.toBe(saved.body.id); expect(imported.body.markdown).toBe(saved.body.markdown);
  const portable = JSON.parse(file.body.content); expect(Object.keys(portable).sort()).toEqual(["description", "format", "markdown", "name", "schemaVersion"]);
  portable.credentials = {}; expect((await request("POST", "/api/document-templates/transfer/inspect", { content: JSON.stringify(portable) })).status).toBe(400);
});
it("preserves templates across adapter reads, creates distinct documents and retires without deleting them", async () => {
  const project = await request<{ id: string }>("POST", "/api/projects", { name: "Proyecto QA", folderPath: "C:/QA/templates", versioningMode: "none" });
  expect(project.status).toBe(200);
  const saved = await request<DocumentTemplate>("POST", "/api/document-templates", { name: "Acta", description: "Equipo", markdown: "# {{titulo}}\n{{asistentes}}" });
  expect(saved.status).toBe(200);
  const list = await request<DocumentTemplateInventory>("GET", "/api/document-templates", null);
  expect(list.body.templates.some(template => template.id === saved.body.id)).toBe(true);
  for (const [name, asistentes] of [["Uno.md", "Ana"], ["Dos.md", "Miren"]]) {
    const body = { projectId: project.body.id, name, revision: saved.body.revision, values: { asistentes } };
    const preview = await request<DocumentTemplatePreview>("POST", `/api/document-templates/${saved.body.id}/preview`, body);
    expect(preview.body.markdown).toContain(asistentes);
    const reviewed = { ...body, values: preview.body.values, projectRootHash: preview.body.projectRootHash };
    const created = await request<FileOperationResult>("POST", `/api/document-templates/${saved.body.id}/create`, reviewed);
    expect(created.status).toBe(200);
    expect((await request("POST", `/api/document-templates/${saved.body.id}/create`, reviewed)).status).toBe(400);
  }
  expect((await request("POST", `/api/document-templates/${saved.body.id}/retire`, { revision: saved.body.revision })).status).toBe(200);
  const after = await request<DocumentTemplateInventory>("GET", "/api/document-templates", null);
  expect(after.body.templates.some(template => template.id === saved.body.id)).toBe(false);
  const state = JSON.parse(localStorage.getItem("knownext.web-dev.local-api")!);
  expect(Object.keys(state.projectState[project.body.id].documents)).toHaveLength(2);
  expect(state.retiredDocumentTemplates[saved.body.id].markdown).toBe("# {{titulo}}\n{{asistentes}}");
});
