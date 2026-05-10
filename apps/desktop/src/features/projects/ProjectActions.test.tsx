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
        onCreateFolder={vi.fn()}
        onCreateDocument={vi.fn()}
        onExpandTree={vi.fn()}
        onCollapseTree={vi.fn()}
        onConfigureProject={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={onCheckForUpdates}
      />,
    );

    fireEvent.click(screen.getByText("Buscar actualizaciones"));

    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });
});
