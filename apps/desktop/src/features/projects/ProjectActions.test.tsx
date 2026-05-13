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

  it("keeps GitHub account actions in the menu header", () => {
    const onLoginGithub = vi.fn();
    const onLogout = vi.fn();

    render(
      <ProjectActions
        appVersion="0.7.2"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        hasActiveProject
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={onLoginGithub}
        onLogout={onLogout}
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));

    expect(screen.getByText("v0.7.2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /conectar github/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /conectar github/i }));

    expect(onLoginGithub).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
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

  it("shows AI usage by model from the account menu", () => {
    render(
      <ProjectActions
        appVersion="0.7.2"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        aiUsageSummary={{
          month: "2026-05",
          currency: "EUR",
          estimated: true,
          totalEstimatedCost: 1.86,
          generatedAt: "2026-05-12T12:00:00Z",
          models: [
            {
              model: "gpt-5.4-mini",
              interactions: 32,
              inputTokens: 62000,
              cachedInputTokens: 0,
              outputTokens: 34180,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 96180,
              estimatedCost: 1.86,
              currency: "EUR",
              usageSource: "provider",
            },
          ],
        }}
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
        onOpenReleaseNotes={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.mouseEnter(screen.getByRole("button", { name: /uso ia/i }));

    expect(screen.getByText("Uso IA estimado")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.4-mini")).toBeInTheDocument();
    expect(screen.getByText("96.180")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText(/1,86/)).toBeInTheDocument();
    expect(screen.queryByText("gpt-5.5")).not.toBeInTheDocument();
    expect(screen.queryByText("Total mes")).not.toBeInTheDocument();
    expect(screen.queryByText(/datos ficticios/i)).not.toBeInTheDocument();
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
