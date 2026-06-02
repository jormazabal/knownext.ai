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
              expectedVersion: "2.0.1",
              version: "2.0.1",
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
    expect(screen.queryByText("¿Necesitas ayuda?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copiar resumen/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Coste por 1M tokens")).not.toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: /apartados de configuración/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /resumen/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));

    expect(screen.getByRole("heading", { name: /runtime local/i })).toBeInTheDocument();
    expect(screen.getByText("Runtime local Rust")).toBeInTheDocument();
    expect(screen.getByText("Operativo")).toBeInTheDocument();
    expect(screen.getByText("2.0.1")).toBeInTheDocument();
    expect(screen.getAllByText("Contrato local").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /reiniciar runtime/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/puerto/i)).not.toBeInTheDocument();
  });

  it("allows checking local runtime status without backend controls", () => {
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
              expectedVersion: "2.0.1",
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

  it("keeps backend-oriented runtime controls out of the system panel", () => {
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
              expectedVersion: "2.0.1",
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
              expectedVersion: "2.0.1",
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

  it("shows AI model choices and saves the selected model", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "IA documental" }));
    expect(screen.getByText("Modelo de respuesta")).toBeInTheDocument();
    expect(screen.getByText("Elige el equilibrio entre inteligencia, velocidad y coste para las respuestas documentales.")).toBeInTheDocument();
    expect(screen.getByText("Proveedor de IA")).toBeInTheDocument();
    expect(screen.getByText("Contexto documental (RAG)")).toBeInTheDocument();
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
    expect(screen.getByText("1. Imágenes")).toBeInTheDocument();
    expect(screen.getByText("4. Tareas agénticas")).toBeInTheDocument();
  });

  it("allows choosing a custom generated image folder", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));

    expect(screen.getByText(/Define dónde se guardan las imágenes generadas/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/carpeta por defecto/i), { target: { value: "custom_folder" } });

    expect(screen.getByLabelText(/ruta personalizada/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/ruta personalizada/i), { target: { value: "assets/infografias" } });

    expect(onAiChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imageGeneration: expect.objectContaining({
        defaultFolder: "custom_folder",
        customFolderPath: "assets/infografias",
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
    fireEvent.change(screen.getByLabelText("Formato Titulo 1"), { target: { value: "bold_underline" } });
    fireEvent.change(screen.getByLabelText("Interlineado"), { target: { value: "1.5" } });
    expect(onExportTemplateChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    fireEvent.click(screen.getByRole("button", { name: "Restablecer plantilla" }));

    expect(onExportTemplateChange).toHaveBeenCalledWith(expect.objectContaining({
      normal: expect.objectContaining({ fontFamily: "Calibri" }),
      headings: expect.objectContaining({
        h1: expect.objectContaining({ fontFamily: "Arial", textFormat: "bold_underline" }),
        h6: expect.objectContaining({ fontSizePt: 11 }),
      }),
    }));
    expect(onExportTemplateChange).toHaveBeenCalledWith(expect.objectContaining({
      paragraph: expect.objectContaining({ lineSpacing: 1.5 }),
    }));
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

  it("shows agentic limits and web research controls", () => {
    const onAiChange = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={null}
        onAiChange={onAiChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Capacidades" }));

    expect(screen.getByText("4. Tareas agénticas")).toBeInTheDocument();
    expect(screen.getByText(/Permite flujos de varios pasos/i)).toBeInTheDocument();
    expect(screen.getByText("Investigación web")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Investigación web"));

    expect(onAiChange).toHaveBeenCalledWith(expect.objectContaining({
      agentic: expect.objectContaining({ webResearchEnabled: true }),
    }));
  });
});
