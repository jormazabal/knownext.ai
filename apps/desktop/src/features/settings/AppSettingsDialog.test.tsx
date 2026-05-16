import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAiConfig, defaultAppearanceConfig, defaultDiagnosticsConfig } from "../../lib/api/config";
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
  ai: { ...defaultAiConfig, openaiKeyConfigured: false, openaiKeyPreview: null },
  aiIndexStatus: null,
  traceLogStatus: null,
  runtimeServicesRefreshing: false,
  onClose: vi.fn(),
  onAppearanceChange: vi.fn(),
  onDiagnosticsChange: vi.fn(),
  onAiChange: vi.fn(),
  onSaveOpenAiKey: vi.fn(),
  onDeleteOpenAiKey: vi.fn(),
  onRebuildAiIndex: vi.fn(),
  onReindexImages: vi.fn(),
  onDeleteAiIndex: vi.fn(),
  onOpenTraceLogFolder: vi.fn(),
  onRefreshRuntimeServices: vi.fn(),
  onRestartBackendService: vi.fn(),
  onUpdateBackendPortConfig: vi.fn(),
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
              id: "backend",
              name: "Backend local",
              status: "running",
              statusLabel: "Operativo",
              description: "La API local responde y coincide con esta instalación.",
              endpoint: "http://127.0.0.1:8765/health",
              expectedVersion: "0.6.13",
              version: "0.6.13",
              expectedProfile: "desktop",
              profile: "desktop",
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              port: 8765,
              managedBy: "tauri",
              instanceId: "backend-test",
              startedAt: "2026-05-11T17:29:00.000Z",
              sidecarPath: "C:\\Program Files\\KnowNext.ai\\knownext-backend.exe",
              lastError: null,
              canRestart: true,
              canConfigurePort: true,
              portConfig: { mode: "automatic", port: 8765, autoPortStart: 8765, autoPortEnd: 8799 },
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

    expect(screen.getByRole("heading", { name: /estado de servicios/i })).toBeInTheDocument();
    expect(screen.getByText("Backend local")).toBeInTheDocument();
    expect(screen.getByText("Operativo")).toBeInTheDocument();
    expect(screen.getByText("0.6.13")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reiniciar backend/i })).toBeEnabled();
  });

  it("allows checking and restarting runtime services", () => {
    const onRefreshRuntimeServices = vi.fn();
    const onRestartBackendService = vi.fn();

    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-05-11T17:30:00.000Z",
          services: [
            {
              id: "backend",
              name: "Backend local",
              status: "unavailable",
              statusLabel: "No disponible",
              description: "La API local no responde al chequeo de salud.",
              endpoint: "http://127.0.0.1:8765/health",
              expectedVersion: "0.6.13",
              version: null,
              expectedProfile: "desktop",
              profile: null,
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: null,
              port: 8765,
              managedBy: null,
              instanceId: null,
              startedAt: null,
              sidecarPath: null,
              lastError: "Could not connect to 127.0.0.1:8765",
              canRestart: true,
              canConfigurePort: true,
              portConfig: { mode: "automatic", port: 8765, autoPortStart: 8765, autoPortEnd: 8799 },
            },
          ],
        }}
        onRefreshRuntimeServices={onRefreshRuntimeServices}
        onRestartBackendService={onRestartBackendService}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));
    fireEvent.click(screen.getByRole("button", { name: /comprobar/i }));
    fireEvent.click(screen.getByRole("button", { name: /reiniciar backend/i }));

    expect(onRefreshRuntimeServices).toHaveBeenCalledTimes(1);
    expect(onRestartBackendService).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/could not connect/i)).toBeInTheDocument();
  });

  it("explains that browser mode cannot restart the backend from the panel", () => {
    render(
      <AppSettingsDialog
        {...baseProps}
        runtimeServicesStatus={{
          checkedAt: "2026-05-11T17:30:00.000Z",
          services: [
            {
              id: "backend",
              name: "Backend local",
              status: "unavailable",
              statusLabel: "No disponible",
              description: "La API local no responde al chequeo de salud.",
              endpoint: "http://127.0.0.1:8766/health",
              expectedVersion: "0.7.0",
              version: null,
              expectedProfile: "web-dev",
              profile: null,
              expectedAppDataDir: "",
              appDataDir: null,
              port: null,
              managedBy: null,
              instanceId: null,
              startedAt: null,
              sidecarPath: null,
              lastError: "El chequeo /health no respondió en 2500 ms.",
              canRestart: false,
              canConfigurePort: false,
              portConfig: null,
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));

    expect(screen.getByRole("button", { name: /reiniciar backend/i })).toBeDisabled();
    expect(screen.getByText(/modo web\/desarrollo/i)).toBeInTheDocument();
  });

  it("copies the backend diagnostic and shows feedback", async () => {
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
              id: "backend",
              name: "Backend local",
              status: "degraded",
              statusLabel: "Incompatible",
              description: "Hay una API local respondiendo, pero no coincide.",
              endpoint: "http://127.0.0.1:8766/health",
              expectedVersion: "0.7.1",
              version: "0.6.14",
              expectedProfile: "web-dev",
              profile: null,
              expectedAppDataDir: "",
              appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.web",
              port: null,
              managedBy: null,
              instanceId: null,
              startedAt: null,
              sidecarPath: null,
              lastError: "expectedProfile=web-dev\nactualProfile=unknown",
              canRestart: false,
              canConfigurePort: false,
              portConfig: null,
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /sistema y diagnóstico/i }));
    fireEvent.click(screen.getByRole("button", { name: /copiar diagnóstico/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("expectedProfile=web-dev"));
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
