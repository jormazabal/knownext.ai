import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateAvailableDialog } from "./UpdateAvailableDialog";

describe("UpdateAvailableDialog", () => {
  afterEach(() => cleanup());

  it("shows release metadata and starts installation from the update dialog", async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();

    render(
      <UpdateAvailableDialog
        update={{
          currentVersion: "2.0.1",
          version: "2.0.2",
          date: "2026-06-04T10:00:00.000Z",
          notes: "Correcciones de sincronizacion",
          platform: "desktop",
          sizeBytes: 12_582_912,
          mandatory: true,
        }}
        state="available"
        progress={null}
        error={null}
        onClose={vi.fn()}
        onInstall={onInstall}
      />,
    );

    expect(screen.getByText("Actualización disponible")).toBeInTheDocument();
    expect(screen.getByText("v2.0.1")).toBeInTheDocument();
    expect(screen.getByText("v2.0.2")).toBeInTheDocument();
    expect(screen.getByText("Actualizador de escritorio")).toBeInTheDocument();
    expect(screen.getByText("12 MB")).toBeInTheDocument();
    expect(screen.getByText("Esta actualización está marcada como obligatoria.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("disables actions while downloading and shows progress", () => {
    render(
      <UpdateAvailableDialog
        update={{ currentVersion: "2.0.1", version: "2.0.2", platform: "android-private" }}
        state="downloading"
        progress={{ downloadedBytes: 50, contentLength: 100, percent: 50 }}
        error="Red interrumpida"
        onClose={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByText("APK Android privado")).toBeInTheDocument();
    expect(screen.getByText("Descargando")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Red interrumpida")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más tarde" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizando" })).toBeDisabled();
  });
});
