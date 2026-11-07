import { beforeEach, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ invoke: vi.fn(), requestJson: vi.fn() }));
vi.mock("./nativeClient", () => ({ invokeManagedNative: bridge.invoke }));
vi.mock("./client", () => ({ requestJson: bridge.requestJson }));
vi.mock("../runtime/platform", () => ({ isTauriRuntime: () => true }));
import { deliverTemplateTransfer, importTemplateTransfer, inspectTemplateTransfer, pickTemplateTransfer, prepareTemplateTransfer } from "./documentTemplateTransfer";
beforeEach(() => vi.resetAllMocks());
it("native transport accepts template identity/revision, never a React URI or source path", async () => {
  await pickTemplateTransfer(); await deliverTemplateTransfer("custom/a", "revision");
  expect(bridge.invoke).toHaveBeenNthCalledWith(1, "pick_document_template"); expect(bridge.invoke).toHaveBeenNthCalledWith(2, "export_document_template", { id: "custom/a", revision: "revision" });
});
it("inspection and import preserve the reviewed content and digest; export escapes its identity", async () => {
  await inspectTemplateTransfer("exact bytes"); await importTemplateTransfer("exact bytes", "sha", "New name"); await prepareTemplateTransfer("custom/a", "revision");
  expect(bridge.requestJson).toHaveBeenNthCalledWith(1, "/api/document-templates/transfer/inspect", { method: "POST", body: JSON.stringify({ content: "exact bytes" }) });
  expect(bridge.requestJson).toHaveBeenNthCalledWith(2, "/api/document-templates/transfer/import", { method: "POST", body: JSON.stringify({ content: "exact bytes", digest: "sha", name: "New name" }) });
  expect(bridge.requestJson).toHaveBeenNthCalledWith(3, "/api/document-templates/custom%2Fa/transfer", { method: "POST", body: JSON.stringify({ revision: "revision" }) });
});

it("carries explicit resource consent only for the reviewed attachment import",async()=>{await importTemplateTransfer("exact payload","sha","Received",true);expect(bridge.requestJson).toHaveBeenCalledWith("/api/document-templates/transfer/import",{method:"POST",body:JSON.stringify({content:"exact payload",digest:"sha",name:"Received",reviewedResources:true})});});
