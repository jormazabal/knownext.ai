import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectActions } from "./ProjectActions";

afterEach(() => {
  cleanup();
});

describe("ProjectActions", () => {
  it("starts a manual update check from the account menu", () => {
    const onCheckForUpdates = vi.fn();

    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        hasActiveProject
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={onCheckForUpdates}
        onOpenReleaseNotes={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.click(screen.getByText("Buscar actualizaciones"));

    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it("opens release notes from the account menu", () => {
    const onOpenReleaseNotes = vi.fn();

    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        hasActiveProject
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={onOpenReleaseNotes}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.click(screen.getByText("Notas de release"));

    expect(onOpenReleaseNotes).toHaveBeenCalledTimes(1);
  });

  it("opens application settings from the account menu", () => {
    const onOpenAppSettings = vi.fn();

    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        hasActiveProject
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onOpenAppSettings={onOpenAppSettings}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.click(screen.getByText("Configuración de la app"));

    expect(onOpenAppSettings).toHaveBeenCalledTimes(1);
  });
});
