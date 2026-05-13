import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAiConfig, defaultAppearanceConfig, defaultDiagnosticsConfig } from "../../lib/api/config";
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
  onDeleteAiIndex: vi.fn(),
  onOpenTraceLogFolder: vi.fn(),
  onRefreshRuntimeServices: vi.fn(),
  onRestartBackendService: vi.fn(),
  onUpdateBackendPortConfig: vi.fn(),
};

describe("AppSettingsDialog", () => {
  it("shows service status as the first settings section", () => {
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

    expect(screen.getByRole("heading", { name: /estado de servicios/i })).toBeInTheDocument();
    expect(screen.getByText("Backend local")).toBeInTheDocument();
    expect(screen.getByText("Operativo")).toBeInTheDocument();
    expect(screen.getAllByText("0.6.13").length).toBeGreaterThanOrEqual(2);
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

    fireEvent.click(screen.getByText("IA"));
    expect(screen.getByText("Modelo de respuesta")).toBeInTheDocument();
    expect(screen.getAllByText("Coste").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("Crear, duplicar y mover documentos")).toBeInTheDocument();
    expect(screen.getByText("Crear y mover carpetas")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /equilibrado/i })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: /máxima inteligencia/i }));

    expect(onAiChange).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5.5" }));
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

    fireEvent.click(screen.getByText("IA"));

    expect(screen.getByText("Tareas agénticas")).toBeInTheDocument();
    expect(screen.getByText("Control desde el prompt")).toBeInTheDocument();
    expect(screen.getByText("Investigación web")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Investigación web"));

    expect(onAiChange).toHaveBeenCalledWith(expect.objectContaining({
      agentic: expect.objectContaining({ webResearchEnabled: true }),
    }));
  });
});
