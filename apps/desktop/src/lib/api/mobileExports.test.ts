import { beforeEach,expect,it,vi } from "vitest";
import {invokeManagedNative as invoke} from "./nativeClient";
import { exportMarkdownToMobile,exportHandwrittenToMobile,openMobileExport } from "./mobileExports";
vi.mock("./nativeClient",()=>({invokeManagedNative:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
it("sends content to the native picker without a supplied URI or output path",async()=>{
  vi.mocked(invoke).mockResolvedValue({status:"cancelled",requestId:"qa",completedAt:"now"});
  const result=await exportMarkdownToMobile("p::Notas con acento.md",{format:"pdf",markdown:"# Snapshot"});
  expect(invoke).toHaveBeenCalledWith("export_document_mobile",{request:{method:"POST",path:"/api/documents/p%3A%3ANotas%20con%20acento.md/export/content",body:{format:"pdf",markdown:"# Snapshot"}}});
  expect(result.status).toBe("cancelled");
});
it("keeps note/page scope and opens only the native result ticket",async()=>{
  vi.mocked(invoke).mockResolvedValue({status:"saved",exportId:"ticket",fileName:"Note.png",byteLength:10});
  await exportHandwrittenToMobile("p::Note.knote",{format:"png",pageId:"page-2"});
  expect(invoke).toHaveBeenLastCalledWith("export_document_mobile",{request:{method:"POST",path:"/api/handwritten-notes/p%3A%3ANote.knote/export/content",body:{format:"png",pageId:"page-2"}}});
  await openMobileExport("ticket");expect(invoke).toHaveBeenLastCalledWith("open_mobile_export",{exportId:"ticket"});
});
it("keeps native destination failures visible to the caller",async()=>{
  vi.mocked(invoke).mockRejectedValue(new Error("Destination denied"));
  await expect(exportMarkdownToMobile("p::a.md",{format:"pdf"})).rejects.toThrow("Destination denied");
});
