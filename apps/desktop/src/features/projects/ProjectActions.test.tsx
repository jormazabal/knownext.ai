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
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
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
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={onLoginGithub}
        onLogout={onLogout}
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
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
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

  it("shows AI usage by model from the account menu", async () => {
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
          capabilities: [
            {
              capability: "document_ai",
              label: "IA documental",
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
            {
              capability: "image_generation",
              label: "Imágenes",
              interactions: 0,
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 0,
              estimatedCost: 0,
              currency: "EUR",
              usageSource: "unknown",
            },
          ],
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
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.mouseEnter(screen.getByRole("button", { name: /uso ia/i }));

    await screen.findByText("Mayo");
    expect(screen.getAllByText("Uso IA").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("IA documental")).toBeInTheDocument();
    expect(screen.getAllByText("96.180").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: /por modelo/i }));
    expect(screen.getByText("gpt-5.4-mini")).toBeInTheDocument();
    expect(screen.getAllByText("96.180").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("32").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1,86/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("gpt-5.5")).not.toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.queryByText(/datos ficticios/i)).not.toBeInTheDocument();
  });

  it("opens application settings from the account menu", () => {
    const onOpenAppSettings = vi.fn();

    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
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
