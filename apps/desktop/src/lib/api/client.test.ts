import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "../appVersion";
import { ApiError, requestBinary, requestFormData, requestJson, validateRuntimeHealth } from "./client";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
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
