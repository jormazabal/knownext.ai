import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPendingIntentActions } from "./AiPendingIntentActions";
import type { AiPendingIntent } from "../../types/domain";

afterEach(() => cleanup());

describe("AiPendingIntentActions", () => {
  it("shows pending action context and sends apply as structured action", async () => {
    const onAction = vi.fn();
    const intent = makeIntent({ status: "awaiting_decision" });

    render(<AiPendingIntentActions intent={intent} onAction={onAction} />);

    expect(screen.getByText("Acción pendiente")).toBeInTheDocument();
    expect(screen.getByText("pp.md")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onAction).toHaveBeenCalledWith("apply", "intent-1");
  });

  it("requests web permission without simulating user text", async () => {
    const onAction = vi.fn();
    const intent = makeIntent({ status: "awaiting_web_permission", requiresWebResearch: true });

    render(<AiPendingIntentActions intent={intent} onAction={onAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Permitir búsqueda" }));
    expect(onAction).toHaveBeenCalledWith("allow_web_research", "intent-1");
  });

  it("cancels through a structured action", async () => {
    const onAction = vi.fn();
    const intent = makeIntent({ status: "ready" });

    render(<AiPendingIntentActions intent={intent} onAction={onAction} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onAction).toHaveBeenCalledWith("cancel", "intent-1");
  });
});

function makeIntent(patch: Partial<AiPendingIntent>): AiPendingIntent {
  return {
    id: "intent-1",
    projectId: "project-1",
    originDocumentId: "doc-1",
    targetDocumentId: "doc-1",
    targetPath: "pp.md",
    goal: "Redactar descripción en el documento activo.",
    proposedAction: "research_then_write",
    requiresWebResearch: false,
    webResearchAllowed: false,
    status: "awaiting_decision",
    createdAt: "2026-05-13T10:00:00+00:00",
    updatedAt: "2026-05-13T10:00:00+00:00",
    expiresAt: "2026-05-14T10:00:00+00:00",
    ...patch,
  };
}
