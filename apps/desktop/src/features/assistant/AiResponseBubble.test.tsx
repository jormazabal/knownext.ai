import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiResponseBubble } from "./AiResponseBubble";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AiResponseBubble", () => {
  it("uses the countdown close button and auto-closes after the countdown", () => {
    const onClose = vi.fn();

    render(
      <AiResponseBubble
        bubble={{ id: "bubble-1", answer: "Respuesta breve de IA." }}
        onClose={onClose}
        onOpenConversation={vi.fn()}
      />,
    );

    const closeButton = screen.getByLabelText("Cerrar respuesta IA");
    expect(closeButton).toHaveClass("h-7", "w-7", "rounded-full");
    expect(closeButton.querySelector("svg")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows used AI skills and diagnostics when the runtime provides them", () => {
    render(
      <AiResponseBubble
        bubble={{
          id: "bubble-skills",
          answer: "He preparado un diagrama.",
          usedSkills: ["knownext.mermaid"],
          skillApplications: [{
            skillId: "knownext.mermaid",
            modeId: "diagram_structure",
            action: "insert_diagram",
            status: "applied",
            reason: "Arquitectura solicitada.",
            confidence: "high",
          }],
          skillDiagnostics: [{
            skillId: "knownext.mermaid",
            modeId: "diagram_structure",
            phase: "validation",
            severity: "info",
            status: "applied",
            title: "Skill aplicada",
            notes: ["Resuelta por runtime."],
          }],
        }}
        onClose={vi.fn()}
        onOpenConversation={vi.fn()}
      />,
    );

    expect(screen.getByText(/Skills usadas:/)).toBeInTheDocument();
    expect(screen.getAllByText(/Mermaid \/ estructura/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Diagnostico/)).toBeInTheDocument();
  });
});
