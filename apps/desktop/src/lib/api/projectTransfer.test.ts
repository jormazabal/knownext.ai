import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), requestJson: vi.fn(), native: vi.fn() }));
vi.mock("./nativeClient", () => ({ invokeManagedNative: mocks.invoke }));
vi.mock("./client", () => ({ requestJson: mocks.requestJson }));
vi.mock("../runtime/platform", () => ({ isTauriRuntime: mocks.native }));
import { projectTransfers } from "./projectTransfer";
beforeEach(() => { vi.resetAllMocks();mocks.native.mockReturnValue(true); });
it("passes opaque identities and reviewed digest to native transport, without archive bytes or frontend paths", async () => {
  await projectTransfers.pick("transfer-a");expect(mocks.invoke).toHaveBeenLastCalledWith("pick_project_package", { id: "transfer-a" });
  await projectTransfers.deliver("transfer-a", "reviewed-sha");expect(mocks.invoke).toHaveBeenLastCalledWith("export_project_package", { id: "transfer-a", archiveSha256: "reviewed-sha" });
  await projectTransfers.commit("transfer-a/b", "reviewed-sha", "Equipo");expect(mocks.requestJson).toHaveBeenLastCalledWith("/api/project-transfers/transfer-a%2Fb/commit", { method: "POST", body: JSON.stringify({ archiveSha256: "reviewed-sha", name: "Equipo" }) });
  await projectTransfers.rememberReview('transfer-a','reviewed-sha','');expect(mocks.requestJson).toHaveBeenLastCalledWith('/api/project-transfers/transfer-a/review',{method:'POST',body:JSON.stringify({archiveSha256:'reviewed-sha',name:''})});
  await projectTransfers.begin({ kind: "export", projectId: "project-a", projectName: "Only displayed" });expect(mocks.requestJson).toHaveBeenLastCalledWith("/api/project-transfers", { method: "POST", body: JSON.stringify({ kind: "export", projectId: "project-a" }) });
});
it("fails honestly in browser development rather than claiming a native package transfer", async () => {
  mocks.native.mockReturnValue(false);await expect(projectTransfers.list()).rejects.toThrow("aplicación nativa");await expect(projectTransfers.pick("transfer-a")).rejects.toThrow("aplicación nativa");expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.requestJson).not.toHaveBeenCalled();
});
it("starts a template from its reviewed identity without a project path or native picker",async()=>{
  await projectTransfers.begin({kind:"template-import",templateId:"project-template-owned",revision:"reviewed",projectName:"Displayed only"});
  expect(mocks.requestJson).toHaveBeenLastCalledWith("/api/project-transfers",{method:"POST",body:JSON.stringify({kind:"import",templateId:"project-template-owned",templateRevision:"reviewed"})});
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("requests a private project archive explicitly without passing configuration or file authority",async()=>{
  await projectTransfers.begin({kind:"export",projectId:"project-owned",projectName:"Display only",includeArchive:true});
  expect(mocks.requestJson).toHaveBeenLastCalledWith("/api/project-transfers",{method:"POST",body:JSON.stringify({kind:"export",projectId:"project-owned",includeArchive:true})});
  expect(mocks.invoke).not.toHaveBeenCalled();
});
