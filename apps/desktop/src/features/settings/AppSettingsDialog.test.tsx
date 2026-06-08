import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAiConfig, defaultAppearanceConfig, defaultDiagnosticsConfig, defaultExportTemplateConfig } from "../../lib/api/config";
import type { AiConfigStatus } from "../../types/domain";
import { AppSettingsDialog } from "./AppSettingsDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseProps = {
  open: true,
  appearance: defaultAppearanceConfig,
  diagnostics: defaultDiagnosticsConfig,
  exportTemplate: defaultExportTemplateConfig,
  exportTemplatePath: "C:\\Users\\user\\AppData\\Roaming\\KnowNext.ai\\export-template-basic.json",
  ai: { ...defaultAiConfig, openaiKeyConfigured: false, openaiKeyPreview: null },
  aiIndexStatus: null,
  traceLogStatus: null,
  runtimeServicesRefreshing: false,
  saveState: "idle" as const,
  saveMessage: null,
  configPersistenceAvailable: true,
  onClose: vi.fn(),
  onAppearanceChange: vi.fn(),
  onDiagnosticsChange: vi.fn(),
  onExportTemplateChange: vi.fn(),
  onResetExportTemplate: vi.fn(),
  onAiChange: vi.fn(),
  onSaveOpenAiKey: vi.fn(),
  onDeleteOpenAiKey: vi.fn(),
  onRebuildAiIndex: vi.fn(),
  onReindexImages: vi.fn(),
  onDeleteAiIndex: vi.fn(),
  onOpenTraceLogFolder: vi.fn(),
  onRefreshRuntimeServices: vi.fn(),
};

describe("AppSettingsDialog", () => {
  it("shows the configuration summary as the first settings section", () => {
    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-05-11T17:30:00.000Z",
          services: [
            {
              id: "local-runtime",
              name: "Runtime local Rust",
              status: "running",
              statusLabel: "Operativo",
              description: "El runtime local responde y coincide con esta instalación.",
              endpoint: "tauri://local-api/health",
              expectedVersion: "2.0.2",
              version: "2.0.2",
              expectedProfile: "desktop",
              profile: "desktop",
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              managedBy: "tauri",
              instanceId: "runtime-test",
              startedAt: "2026-05-11T17:29:00.000Z",
              lastError: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: /resumen de configuración/i })).toBeInTheDocument();
    expect(screen.getByText("Modelos de IA utilizados")).toBeInTheDocument();
    expect(screen.getAllByText("Imágenes (generación)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Imágenes (visión)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gpt-image-2").length).toBeGreaterThan(0);
    expect(screen.getByText("Sin cambios pendientes")).toBeInTheDocument();
    expect(screen.queryByText("Imágenes (generación y visión)")).not.toBeInTheDocument();
    expect(screen.queryByText("Vector store")).not.toBeInTheDocument();
    expect(screen.queryByText("¿Necesitas ayuda?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copiar resumen/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Coste por 1M tokens")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: /apartados de configuración/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /resumen/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /skills de ia/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));

    expect(screen.getByRole("heading", { name: /estado de la aplicación/i })).toBeInTheDocument();
    expect(screen.getByText("Aplicación local")).toBeInTheDocument();
    expect(screen.getAllByText("Operativo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.0.2").length).toBeGreaterThan(0);
    expect(screen.queryByText("Contrato local")).not.toBeInTheDocument();
    expect(screen.queryByText("tauri://local-api/health")).not.toBeInTheDocument();
    expect(screen.queryByText("Runtime local Rust")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reiniciar runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/puerto/i)).not.toBeInTheDocument();
  });

  it("shows settings persistence state in the dialog header", () => {
    render(
      <AppSettingsDialog
        {...baseProps}
        saveState="error"
        saveMessage="No se pudo guardar IA"
        runtimeServicesStatus={null}
      />,
    );

    expect(screen.getByText("No se pudo guardar IA")).toBeInTheDocument();
  });

  it("allows checking local runtime status without external runtime controls", () => {
    const onRefreshRuntimeServices = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-05-11T17:30:00.000Z",
          services: [
            {
              id: "local-runtime",
              name: "Runtime local Rust",
              status: "unavailable",
              statusLabel: "No disponible",
              description: "El runtime local no responde al chequeo de salud.",
              endpoint: "tauri://local-api/health",
              expectedVersion: "2.0.2",
              version: null,
              expectedProfile: "desktop",
              profile: null,
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: null,
              managedBy: null,
              instanceId: null,
              startedAt: null,
              lastError: "Runtime local no disponible",
            },
          ],
        }}
        onRefreshRuntimeServices={onRefreshRuntimeServices}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));
    fireEvent.click(screen.getByRole("button", { name: /comprobar/i }));

    expect(onRefreshRuntimeServices).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/runtime local no disponible/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reiniciar runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ejecutable externo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/aplicar y reiniciar/i)).not.toBeInTheDocument();
  });

  it("keeps legacy runtime controls out of the system panel", () => {
    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-05-11T17:30:00.000Z",
          services: [
            {
              id: "local-runtime",
              name: "Runtime local Rust",
              status: "unavailable",
              statusLabel: "No disponible",
              description: "El runtime local no responde al chequeo de salud.",
              endpoint: "tauri://local-api/health",
              expectedVersion: "2.0.2",
              version: null,
              expectedProfile: "web-dev",
              profile: null,
              expectedAppDataDir: "",
              appDataDir: null,
              managedBy: null,
              instanceId: null,
              startedAt: null,
              lastError: "Runtime local no disponible",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));

    expect(screen.queryByRole("button", { name: /reiniciar runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/modo de puerto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/puerto activo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ejecutable externo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/proceso externo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend|fastapi|python/i)).not.toBeInTheDocument();
  });

  it("shows Git and GitHub diagnostics as a separate local runtime service", () => {
    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-06-05T17:30:00.000Z",
          services: [
            {
              id: "local-runtime",
              name: "Runtime local Rust",
              status: "running",
              statusLabel: "Operativo",
              description: "La aplicación usa comandos Tauri y persistencia local Rust.",
              endpoint: "tauri://local-api/health",
              expectedVersion: "2.0.4",
              version: "2.0.4",
              expectedProfile: "desktop",
              profile: "desktop",
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              managedBy: "tauri",
              instanceId: "tauri-rust-local",
              startedAt: "2026-06-05T17:00:00.000Z",
              lastError: null,
            },
            {
              id: "git-runtime",
              name: "Git local y GitHub",
              status: "running",
              statusLabel: "Local activo · GitHub pausado",
              description: "El historial local puede usarse sin terminales visibles; GitHub queda pausado hasta conectar la cuenta.",
              endpoint: "tauri://local-api/api/runtime/git",
              expectedVersion: "git",
              version: "git version 2.45.0.windows.1",
              expectedProfile: "desktop",
              profile: "unauthenticated",
              expectedAppDataDir: "C:\\KnowNext-PROJECTS\\LKS Next",
              appDataDir: null,
              managedBy: "local-git+github",
              instanceId: "knownext-lks",
              startedAt: "2026-06-05T17:30:00.000Z",
              lastError: "GitHub remoto pausado: sin cuenta GitHub conectada. El trabajo local sigue disponible.",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));

    expect(screen.getByText("Aplicación local")).toBeInTheDocument();
    expect(screen.getByText("Git local y GitHub")).toBeInTheDocument();
    expect(screen.getByText("Local activo · GitHub pausado")).toBeInTheDocument();
    expect(screen.getByText(/sin terminales visibles/i)).toBeInTheDocument();
  });

  it("copies the runtime diagnostic and shows feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-05-11T17:30:00.000Z",
          services: [
            {
              id: "local-runtime",
              name: "Runtime local Rust",
              status: "degraded",
              statusLabel: "Incompatible",
              description: "El runtime local responde, pero no coincide.",
              endpoint: "tauri://local-api/health",
              expectedVersion: "2.0.2",
              version: "1.0.1",
              expectedProfile: "web-dev",
              profile: null,
              expectedAppDataDir: "",
              appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.web",
              managedBy: null,
              instanceId: null,
              startedAt: null,
              lastError: "expectedProfile=web-dev\nactualProfile=unknown",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));
    fireEvent.click(screen.getByRole("button", { name: /copiar diagnóstico/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("expectedProfile=web-dev"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("localContract=tauri://local-api/health"));
    expect(await screen.findByRole("button", { name: /diagnóstico copiado/i })).toBeInTheDocument();
  });

  it("enables trace logging controls and opens the local log folder", () => {
    const onDiagnosticsChange = vi.fn();
    const onOpenTraceLogFolder = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        diagnostics={{ ...defaultDiagnosticsConfig, traceLoggingEnabled: false }}
        traceLogStatus={{
          enabled: false,
          folderPath: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop\\logs",
          filePath: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop\\logs\\knownext.log",
        }}
        runtimeServicesStatus={null}
        onDiagnosticsChange={onDiagnosticsChange}
        onOpenTraceLogFolder={onOpenTraceLogFolder}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));

    expect(screen.getByText("C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop\\logs")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("switch", { name: /activar registro de trazas/i })[0]);
    expect(onDiagnosticsChange).toHaveBeenCalledWith({ traceLoggingEnabled: true });

    fireEvent.click(screen.getByRole("button", { name: /abrir carpeta en el explorador/i }));
    expect(onOpenTraceLogFolder).toHaveBeenCalledTimes(1);
  });

  it("shows AI model choices and saves the selected model", () => {
    const onAiChange = vi.fn();
    const onRebuildAiIndex = vi.fn();
    const onDeleteAiIndex = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
        aiIndexStatus={{
          projectId: "project-1",
          enabled: true,
          status: "updated",
          vectorStoreId: "local-rag:project-1",
          lastIndexedAt: "2026-06-06T10:00:00.000Z",
          error: null,
          documentCount: 3,
          indexedDocumentCount: 3,
          pendingDocumentCount: 0,
          failedDocumentCount: 0,
          deletedDocumentCount: 0,
          localExactReady: true,
        }}
        onRebuildAiIndex={onRebuildAiIndex}
        onDeleteAiIndex={onDeleteAiIndex}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "IA documental" }));
    expect(screen.getByText("Modelo de respuesta")).toBeInTheDocument();
    expect(screen.getByText("Elige el equilibrio entre inteligencia, velocidad y coste para las respuestas documentales.")).toBeInTheDocument();
    expect(screen.getByText("Proveedor de IA")).toBeInTheDocument();
    expect(screen.getByText("Contexto documental (RAG)")).toBeInTheDocument();
    expect(screen.getByText("local-rag:project-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reconstruir índice/i }));
    fireEvent.click(screen.getByRole("button", { name: /limpiar índice/i }));
    expect(onRebuildAiIndex).toHaveBeenCalledTimes(1);
    expect(onDeleteAiIndex).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /gpt-5.4-mini/i })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /gpt-5.4-mini/i }));
    const selectedModelOption = screen.getAllByRole("option", { name: /gpt-5.4-mini/i }).find((option) => option.getAttribute("aria-selected") === "true");
    expect(selectedModelOption).toBeTruthy();
    expect(screen.getByText("Ver guía de modelos")).toBeInTheDocument();

    const maximumModelOption = screen.getAllByRole("option", { name: /gpt-5.5/i }).find((option) => option.tagName === "BUTTON");
    expect(maximumModelOption).toBeTruthy();
    fireEvent.click(maximumModelOption!);

    expect(onAiChange).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.5" }));
  });

  it("opens AI settings with legacy config missing image vision and agentic defaults", () => {
    const legacyAi: Partial<AiConfigStatus> = {
      ...defaultAiConfig,
      openaiKeyConfigured: false,
      openaiKeyPreview: null,
    };
    delete legacyAi.vision;
    delete legacyAi.agentic;

    render(
      <AppSettingsDialog
        {...baseProps}
        ai={legacyAi as AiConfigStatus}
        runtimeServicesStatus={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "IA documental" }));

    expect(screen.getByText("Contexto documental (RAG)")).toBeInTheDocument();
    expect(screen.getByText("Modelo de respuesta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));
    expect(screen.getByText("1. Diagramas")).toBeInTheDocument();
    expect(screen.getByText("2. Imágenes")).toBeInTheDocument();
    expect(screen.getByText("5. Tareas agénticas")).toBeInTheDocument();
  });

  it("shows configurable image generation backed by the Rust runtime contract", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));

    expect(screen.getByText("Generación de imágenes")).toBeInTheDocument();
    expect(screen.getByText("Modelo imagen")).toBeInTheDocument();
    const imageModelButton = screen.getByRole("button", { name: "Modelo imagen" });
    expect(screen.getByText("gpt-image-2")).toBeInTheDocument();
    expect(screen.getByText("$0.006-$0.211")).toBeInTheDocument();
    expect(screen.getByText("por imagen 1K")).toBeInTheDocument();
    expect(screen.queryByText("Calculadora")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2048 x 2048" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3840 x 2160" })).toBeInTheDocument();
    expect(screen.getByLabelText("Carpeta destino")).toBeInTheDocument();
    fireEvent.click(imageModelButton);
    expect(screen.getByText(/calidad anterior/i)).toBeInTheDocument();
    expect(screen.getByText("$0.009-$0.133")).toBeInTheDocument();
    const previousImageModelOption = screen.getAllByRole("option", { name: /gpt-image-1.5/i }).find((option) => option.tagName === "BUTTON");
    expect(previousImageModelOption).toBeTruthy();
    fireEvent.click(previousImageModelOption!);
    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imageGeneration: expect.objectContaining({ model: "gpt-image-1.5" }),
    }));
    expect(screen.queryByRole("option", { name: "3840 x 2160" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Formato"), { target: { value: "webp" } });
    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imageGeneration: expect.objectContaining({ outputFormat: "webp" }),
    }));
  });

  it("updates transcription defaults from the capabilities panel", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));

    const targetSelect = screen.getByLabelText(/destino por defecto/i) as HTMLSelectElement;
    expect(targetSelect.value).toBe("prompt");
    fireEvent.change(targetSelect, { target: { value: "document" } });

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      transcription: expect.objectContaining({ defaultTarget: "document" }),
    }));

    const languageSelect = screen.getByLabelText(/idioma por defecto/i) as HTMLSelectElement;
    fireEvent.change(languageSelect, { target: { value: "eu" } });

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      transcription: expect.objectContaining({
        defaultTarget: "document",
        defaultLanguage: "eu",
      }),
    }));

    fireEvent.click(screen.getByRole("button", { name: /idiomas favoritos del micrófono/i }));
    const euskeraFavoriteOption = screen.getAllByRole("option", { name: "Euskera" }).find((option) => option.tagName === "BUTTON");
    expect(euskeraFavoriteOption).toBeTruthy();
    fireEvent.click(euskeraFavoriteOption!);

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      transcription: expect.objectContaining({
        defaultTarget: "document",
        defaultLanguage: "eu",
        favoriteLanguages: expect.arrayContaining(["es", "en", "eu"]),
      }),
    }));
  });

  it("allows disabling the extended Markdown underline control from appearance settings", () => {
    const onAppearanceChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAppearanceChange={onAppearanceChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Interfaz" }));

    expect(screen.getByText("Compatibilidad Markdown")).toBeInTheDocument();
    expect(screen.getByText("Mostrar subrayado en el editor")).toBeInTheDocument();
    expect(screen.getByText(/no forma parte de Markdown estándar/i)).toBeInTheDocument();
    expect(screen.getByText(/limitar el editor a controles de Markdown estándar/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Activar subrayado extendido" }));

    expect(onAppearanceChange).toHaveBeenCalledWith({ markdownExtendedUnderlineEnabled: false });
  });

  it("updates export template settings from the export panel", () => {
    const onExportTemplateChange = vi.fn();
    const onResetExportTemplate = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onExportTemplateChange={onExportTemplateChange}
        onResetExportTemplate={onResetExportTemplate}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Exportar" }));
    const fontSelect = screen.getByLabelText("Tipografia") as HTMLSelectElement;
    expect(fontSelect.tagName).toBe("SELECT");
    expect(Array.from(fontSelect.options).map((option) => option.value)).toEqual([
      "Arial",
      "Calibri",
      "Aptos",
      "Times New Roman",
      "Georgia",
      "Verdana",
      "Courier New",
      "Consolas",
    ]);
    expect(fontSelect).toHaveStyle({ fontFamily: "Arial" });
    expect(Array.from(fontSelect.options).map((option) => option.style.fontFamily)).toEqual([
      "Arial",
      "Calibri",
      "Aptos",
      "Times New Roman",
      "Georgia",
      "Verdana",
      "Courier New",
      "Consolas",
    ]);

    fireEvent.change(fontSelect, { target: { value: "Calibri" } });
    expect(onExportTemplateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      normal: expect.objectContaining({ fontFamily: "Calibri" }),
    }));

    fireEvent.change(screen.getByLabelText("Formato Titulo 1"), { target: { value: "bold_underline" } });
    expect(onExportTemplateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      headings: expect.objectContaining({
        h1: expect.objectContaining({ fontFamily: "Arial", textFormat: "bold_underline" }),
        h6: expect.objectContaining({ fontSizePt: 11 }),
      }),
    }));

    fireEvent.change(screen.getByLabelText("Antes Titulo 1"), { target: { value: "14" } });
    expect(onExportTemplateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      headings: expect.objectContaining({
        h1: expect.objectContaining({ spaceBeforePt: 14 }),
      }),
    }));

    fireEvent.change(screen.getByLabelText("Interlineado"), { target: { value: "1.5" } });
    expect(onExportTemplateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      paragraph: expect.objectContaining({ lineSpacing: 1.5 }),
    }));
    fireEvent.change(screen.getByLabelText("Espaciado anterior"), { target: { value: "4" } });
    expect(onExportTemplateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      paragraph: expect.objectContaining({ spaceBeforePt: 4 }),
    }));

    fireEvent.change(screen.getByLabelText("Resolucion diagramas"), { target: { value: "high" } });
    expect(onExportTemplateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      document: expect.objectContaining({ diagramResolution: "high" }),
    }));
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restablecer plantilla" }));

    expect(onExportTemplateChange).toHaveBeenCalledTimes(6);
    expect(onResetExportTemplate).toHaveBeenCalledTimes(1);
  });

  it("allows changing theme mode and primary color from appearance settings", () => {
    const onAppearanceChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAppearanceChange={onAppearanceChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Interfaz" }));
    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));
    fireEvent.click(screen.getByRole("radio", { name: "Color Verde" }));

    expect(onAppearanceChange).toHaveBeenCalledWith({ themeMode: "dark" });
    expect(onAppearanceChange).toHaveBeenCalledWith({ primaryColor: "green" });
    expect(screen.getByText("Vista previa")).toBeInTheDocument();
  });

  it("resets appearance without changing language or Markdown compatibility", () => {
    const onAppearanceChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        appearance={{
          ...defaultAppearanceConfig,
          themeMode: "dark",
          primaryColor: "rose",
          zoomPercent: 115,
        }}
        onAppearanceChange={onAppearanceChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Interfaz" }));
    fireEvent.click(screen.getByRole("button", { name: "Restablecer apariencia" }));

    expect(onAppearanceChange).toHaveBeenCalledWith({
      themeMode: "system",
      primaryColor: "orange",
      zoomPercent: 100,
    });
  });

  it("configures local guided agentic tasks while keeping web research unavailable", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));

    expect(screen.getByText("5. Tareas agénticas")).toBeInTheDocument();
    expect(screen.getAllByText("Control desde el prompt").length).toBeGreaterThan(0);
    expect(screen.getByText("Investigación web")).toBeInTheDocument();
    expect(screen.getByText(/No disponible hasta que la app pueda investigar en web/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pasos"), { target: { value: "8" } });

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      agentic: expect.objectContaining({
        maxSteps: 8,
        webResearchEnabled: false,
      }),
    }));
  });

  it("applies AI permission presets and individual permission changes", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));
    fireEvent.click(screen.getByRole("button", { name: /productivo/i }));

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      permissions: {
        editDocuments: true,
        createFolders: true,
        createDocuments: true,
        deleteDocumentsAndFolders: true,
        generateImages: true,
        createImageAssets: true,
        insertImagesIntoDocuments: true,
        useDocumentContextForImageGeneration: true,
      },
    }));

    fireEvent.click(screen.getByRole("switch", { name: "Eliminar documentos y carpetas" }));

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      permissions: expect.objectContaining({
        editDocuments: true,
        createFolders: true,
        createDocuments: true,
        deleteDocumentsAndFolders: false,
      }),
    }));
  });
});
