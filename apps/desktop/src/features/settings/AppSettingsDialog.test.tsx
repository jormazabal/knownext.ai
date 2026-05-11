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
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              sidecarPath: "C:\\Program Files\\KnowNext.ai\\knownext-backend.exe",
              lastError: null,
              canRestart: true,
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
              expectedAppDataDir: "C:\\Users\\user\\AppData\\Roaming\\ai.knownext.desktop",
              appDataDir: null,
              sidecarPath: null,
              lastError: "Could not connect to 127.0.0.1:8765",
              canRestart: true,
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
});
