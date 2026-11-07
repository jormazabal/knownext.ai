import { beforeEach, expect, it, vi } from "vitest";
const { requestJson } = vi.hoisted(() => ({ requestJson: vi.fn() }));
vi.mock("./client", () => ({ requestJson }));
import { createDocumentFromTemplate, previewDocumentTemplate, retireDocumentTemplate, saveDocumentTemplate } from "./documentTemplates";
beforeEach(() => vi.clearAllMocks());
it("sends the reviewed template identity, destination and resolved fields", async () => {
  const body = { projectId: "project", name: "Acta.md", parentId: "project::carpeta", revision: "revision", values: { cliente: "Ana" }, localDate: "2026-11-01" };
  await previewDocumentTemplate("custom/a b", body);
  await createDocumentFromTemplate("custom/a b", body);
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/document-templates/custom%2Fa%20b/preview", { method: "POST", body: JSON.stringify(body) });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/document-templates/custom%2Fa%20b/create", { method: "POST", body: JSON.stringify(body) });
});
it("captures only explicitly selected content and retires only the reviewed revision", async () => {
  const body = { name: "Acta", description: "Equipo", markdown: "# {{titulo}}" };
  await saveDocumentTemplate(body); await retireDocumentTemplate("custom", "reviewed");
  expect(requestJson).toHaveBeenNthCalledWith(1, "/api/document-templates", { method: "POST", body: JSON.stringify(body) });
  expect(requestJson).toHaveBeenNthCalledWith(2, "/api/document-templates/custom/retire", { method: "POST", body: JSON.stringify({ revision: "reviewed" }) });
});
