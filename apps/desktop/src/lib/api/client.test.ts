import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../appVersion";
import { ApiError, requestBinary, requestFormData, requestJson, validateRuntimeHealth } from "./client";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async(command:string,args?:Record<string,unknown>)=>{const value=await invokeMock(command,args);return value&&typeof value==="object"?{protocolVersion:1,operationId:args?.operationId,completedAt:new Date().toISOString(),...value}:value;},
}));

describe("requestJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockReset();
    window.localStorage.clear();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("routes JSON requests through the local Tauri command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({ status: 200, body: { ok: true } });

    await expect(requestJson("/api/config", { method: "PUT", body: JSON.stringify({ layout: { sidebarWidth: 320 } }) })).resolves.toEqual({ ok: true });

    expect(invokeMock).toHaveBeenCalledWith("local_api_request", {
      operationId: expect.stringMatching(/^operation-/),
      request: {
        method: "PUT",
        path: "/api/config",
        body: { layout: { sidebarWidth: 320 } },
      },
    });
  });

  it("converts local command errors into ApiError", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({ status: 404, body: { detail: "No encontrado" } });

    await expect(requestJson("/api/projects/active")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      detail: "No encontrado",
    });
  });
  it("preserves only an explicit not-started outcome instead of inferring it from an error status",async()=>{
    Object.defineProperty(window,"__TAURI_INTERNALS__",{value:{},configurable:true});
    invokeMock.mockResolvedValueOnce({status:409,body:{detail:"Proyecto ocupado",operationOutcome:"not-started"}}).mockResolvedValueOnce({status:409,body:{detail:"Resultado incierto"}});
    await expect(requestJson("/api/documents/p::a.md/conflict",{method:"POST"})).rejects.toMatchObject({status:409,detail:"Proyecto ocupado",operationOutcome:"not-started"});
    await expect(requestJson("/api/documents/p::a.md/conflict",{method:"POST"})).rejects.toMatchObject({status:409,operationOutcome:undefined});
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("preserves a structured private-draft conflict code without deriving it from translated text",async()=>{
    Object.defineProperty(window,"__TAURI_INTERNALS__",{value:{},configurable:true});
    invokeMock.mockResolvedValueOnce({status:409,body:{detail:"Otra operación cambió la edición",code:"draft_write_conflict",operationOutcome:"not-started"}})
      .mockResolvedValueOnce({status:409,body:{detail:"draft_write_conflict"}});
    await expect(requestJson("/api/documents/p::A.md/draft",{method:"PUT"})).rejects.toMatchObject({status:409,code:"draft_write_conflict",operationOutcome:"not-started"});
    await expect(requestJson("/api/documents/p::A.md/draft",{method:"PUT"})).rejects.toMatchObject({code:undefined,operationOutcome:undefined});
  });

  it("routes form-data files through the local Tauri command as base64 file payloads", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({ status: 200, body: { uploaded: true } });
    const originalArrayBuffer = File.prototype.arrayBuffer;
    Object.defineProperty(File.prototype, "arrayBuffer", {
      configurable: true,
      value: vi.fn(async () => new TextEncoder().encode("hello").buffer),
    });
    const formData = new FormData();
    formData.append("file", new File(["hello"], "notes.md", { type: "text/markdown" }));

    await expect(requestFormData("/api/projects/project-1/attachments", formData)).resolves.toEqual({ uploaded: true });

    expect(invokeMock).toHaveBeenCalledWith("local_api_request", {
      operationId: expect.stringMatching(/^operation-/),
      request: {
        method: "POST",
        path: "/api/projects/project-1/attachments",
        body: null,
        files: [{
          fieldName: "file",
          name: "notes.md",
          mimeType: "text/markdown",
          dataBase64: "aGVsbG8=",
        }],
      },
    });
    Object.defineProperty(File.prototype, "arrayBuffer", { configurable: true, value: originalArrayBuffer });
  });

  it("routes binary requests through local_api_content and returns a Blob", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    invokeMock.mockResolvedValue({
      status: 200,
      contentType: "application/pdf",
      filename: "notes.pdf",
      dataBase64: "UERG",
    });

    const blob = await requestBinary("/api/documents/docs%2Fnotes.md/export/content", {
      method: "POST",
      body: JSON.stringify({ format: "pdf" }),
    });

    expect(invokeMock).toHaveBeenCalledWith("local_api_content", {
      operationId: expect.stringMatching(/^operation-/),
      request: {
        method: "POST",
        path: "/api/documents/docs%2Fnotes.md/export/content",
        body: { format: "pdf" },
      },
    });
    expect(blob.type).toBe("application/pdf");
    await expect(readBlobAsText(blob)).resolves.toBe("PDF");
  });

  it("serves browser development JSON requests from the web-dev local adapter", async () => {
    await expect(requestJson("/health")).resolves.toMatchObject({
      app: "knownext",
      status: "ok",
      profile: "web-dev",
      version: APP_VERSION,
    });

    const project = await requestJson<{ id: string; name: string; active: boolean }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "Documentación plataforma",
        folderPath: "",
        icon: "folder",
        iconColor: "#F37021",
        creationMode: "new-local",
        storageMode: "local-files",
        versioningMode: "none",
        syncMode: "none",
      }),
    });

    expect(project).toMatchObject({
      name: "Documentación plataforma",
      active: true,
    });
    await expect(requestJson(`/api/projects/${project.id}/tree`)).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

function readBlobAsText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("API client runtime compatibility", () => {
  it("accepts a matching desktop runtime", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    expect(() => validateRuntimeHealth({
      app: "knownext",
      status: "ok",
      profile: "desktop",
      version: APP_VERSION,
    })).not.toThrow();
  });

  it("rejects a stale runtime with the right profile but a different version", () => {
    expect(() => validateRuntimeHealth({
      app: "knownext",
      status: "ok",
      profile: "desktop",
      version: "1.0.1",
    })).toThrow(ApiError);
  });
});

it("rejects malformed payloads before native work and incompatible responses with a traceable unknown outcome",async()=>{
 Object.defineProperty(window,"__TAURI_INTERNALS__",{value:{},configurable:true});invokeMock.mockClear();
 await expect(requestJson("/api/config",{method:"PUT",body:"invalid JSON"})).rejects.toMatchObject({status:400,operationOutcome:"not-started",code:"invalid-request-body",operationId:expect.stringMatching(/^operation-/)});expect(invokeMock).not.toHaveBeenCalled();
 invokeMock.mockResolvedValueOnce({status:"200",body:{ok:true}});await expect(requestJson("/api/config")).rejects.toMatchObject({status:502,operationOutcome:"unknown",code:"invalid-runtime-response",operationId:expect.stringMatching(/^operation-/)});expect(invokeMock).toHaveBeenCalledTimes(1);
});

it("rejects future or unrelated native replies instead of adopting their result",async()=>{Object.defineProperty(window,"__TAURI_INTERNALS__",{value:{},configurable:true});invokeMock.mockClear();invokeMock.mockResolvedValueOnce({status:200,body:{ok:true},protocolVersion:99}).mockResolvedValueOnce({status:200,body:{ok:true},operationId:"operation-other-request-12345"});await expect(requestJson("/health")).rejects.toMatchObject({code:"invalid-runtime-response",operationOutcome:"unknown"});await expect(requestJson("/health")).rejects.toMatchObject({code:"invalid-runtime-response",operationOutcome:"unknown"});expect(invokeMock).toHaveBeenCalledTimes(2);});
