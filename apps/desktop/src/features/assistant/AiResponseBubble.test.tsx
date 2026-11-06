import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("keeps an embedded answer until the user closes it", () => {
    const close=vi.fn();render(<AiResponseBubble embedded bubble={{id:"embedded",answer:"A reviewable answer"}} onClose={close} onOpenConversation={vi.fn()}/>);
    act(()=>vi.advanceTimersByTime(30_000));expect(close).not.toHaveBeenCalled();expect(screen.getByText("A reviewable answer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Cerrar respuesta IA"}));expect(close).toHaveBeenCalledOnce();
  });
  it("does not expire or hide a pending proposal when its answer is dismissed", () => {
    const close=vi.fn();const proposal={id:"p",projectId:"project",interactionId:"i",status:"proposed" as const,title:"Pending text review",summary:"Review this output",scope:"document" as const,createdAt:"now",updatedAt:"now",operations:[{id:"op",documentId:"project::a.md",action:"replace_document" as const,confidence:"high" as const,summary:"Review",markdown:"Output"}]};
    const callbacks={embedded:true,editProposal:proposal,onClose:close,onOpenConversation:vi.fn(),onApplyEditProposal:vi.fn(),onDiscardEditProposal:vi.fn()};
    const {rerender}=render(<AiResponseBubble {...callbacks} bubble={{id:"i",answer:"Pending review"}}/>);
    act(()=>vi.advanceTimersByTime(30_000));expect(close).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Aplicar"})).toBeEnabled();
    rerender(<AiResponseBubble {...callbacks} bubble={null}/>);act(()=>vi.advanceTimersByTime(200));expect(screen.getByText("Pending text review")).toBeInTheDocument();expect(screen.getByRole("button",{name:"Aplicar"})).toBeEnabled();
  });
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
