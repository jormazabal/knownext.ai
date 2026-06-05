import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubLoginDialog } from "./GithubLoginDialog";

describe("GithubLoginDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the real device code flow and dispatches GitHub actions", async () => {
    const user = userEvent.setup();
    const onOpenGithub = vi.fn();
    const onPoll = vi.fn();

    render(
      <GithubLoginDialog
        open
        state="waiting"
        device={{
          deviceCode: "device-1",
          userCode: "ABCD-EFGH",
          verificationUri: "https://github.com/login/device",
          expiresIn: 900,
          interval: 5,
          mock: false,
        }}
        error={null}
        polling={false}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onOpenGithub={onOpenGithub}
        onPoll={onPoll}
      />,
    );

    expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
    expect(screen.queryByText("GitHub remoto no configurado")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir GitHub" }));
    await user.click(screen.getByRole("button", { name: "Ya autoricé" }));

    expect(onOpenGithub).toHaveBeenCalledTimes(1);
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("keeps the local fallback quiet when production cannot start remote GitHub login", () => {
    const onStart = vi.fn();
    render(
      <GithubLoginDialog
        open
        state="waiting"
        device={{
          deviceCode: "",
          userCode: "",
          verificationUri: "https://github.com/login/device",
          expiresIn: 0,
          interval: 5,
          mock: true,
          status: "error",
          error: "github_remote_not_configured",
        }}
        error={null}
        polling={false}
        onClose={vi.fn()}
        onStart={onStart}
        onOpenGithub={vi.fn()}
        onPoll={vi.fn()}
        devRuntime={false}
      />,
    );

    expect(screen.getByText("GitHub remoto no configurado")).toBeInTheDocument();
    expect(screen.getByText(/mantiene el historial local activo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir GitHub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ya autoricé" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar login" })).toBeInTheDocument();
  });

  it("allows retrying after a local GitHub fallback", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();

    render(
      <GithubLoginDialog
        open
        state="waiting"
        device={{
          deviceCode: "",
          userCode: "",
          verificationUri: "https://github.com/login/device",
          expiresIn: 0,
          interval: 5,
          mock: true,
          status: "error",
          error: "github_remote_not_configured",
        }}
        error={null}
        polling={false}
        onClose={vi.fn()}
        onStart={onStart}
        onOpenGithub={vi.fn()}
        onPoll={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reintentar login" }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("does not show an empty device-code flow in dev when GitHub is not configured", () => {
    render(
      <GithubLoginDialog
        open
        state="waiting"
        device={{
          deviceCode: "",
          userCode: "",
          verificationUri: "https://github.com/login/device",
          expiresIn: 0,
          interval: 5,
          mock: true,
          status: "error",
          error: "github_remote_not_configured",
        }}
        error={null}
        polling={false}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onOpenGithub={vi.fn()}
        onPoll={vi.fn()}
      />,
    );

    expect(screen.getByText("GitHub remoto no configurado")).toBeInTheDocument();
    expect(screen.queryByText("Código de verificación")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir GitHub" })).not.toBeInTheDocument();
  });
});
