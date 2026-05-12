import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAiConfig, defaultAppearanceConfig, defaultDiagnosticsConfig } from "../../lib/api/config";
import { AppSettingsDialog } from "./AppSettingsDialog";

afterEach(() => {
  cleanup();
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
});
