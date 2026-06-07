import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiEditProposal } from "../../types/domain";
import { AiEditProposalCard } from "./AiEditProposalCard";

afterEach(() => cleanup());

describe("AiEditProposalCard", () => {
  it("renders a focused edit proposal and dispatches apply/discard actions", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onDiscard = vi.fn();

    render(
      <AiEditProposalCard
        proposal={proposal}
        onApply={onApply}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText("Propuesta IA")).toBeInTheDocument();
    expect(screen.getByText("Cambio sobre texto seleccionado")).toBeInTheDocument();
    expect(screen.getAllByText("Amplía el apartado seleccionado.")).toHaveLength(2);
    expect(screen.getByText("1 cambio")).toBeInTheDocument();
    expect(screen.getByText("Actual")).toBeInTheDocument();
    expect(screen.getByText("Texto original")).toBeInTheDocument();
    expect(screen.getByText("Texto ampliado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(onApply).toHaveBeenCalledWith("proposal-1", ["op-1"]);
    expect(onDiscard).toHaveBeenCalledWith("proposal-1");
  });

  it("marks stale operations and disables apply when no safe change is selected", () => {
    render(
      <AiEditProposalCard
        proposal={proposal}
        staleOperationIds={["op-1"]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText("1 requiere revisión")).toBeInTheDocument();
    expect(screen.getByText("Obsoleto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  it("keeps applied and blocked operations visible while applying only pending safe changes", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <AiEditProposalCard
        proposal={multiOperationProposal}
        appliedOperationIds={["op-1"]}
        blockedOperationReasons={{ "op-2": "anchor_ambiguous" }}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText("1 aplicado")).toBeInTheDocument();
    expect(screen.getByText("1 requiere revisión")).toBeInTheDocument();
    expect(screen.getByText("Aplicado")).toBeInTheDocument();
    expect(screen.getByText("Revisar")).toBeInTheDocument();
    expect(screen.getByText("El texto de referencia aparece varias veces; elige o ajusta el fragmento antes de aplicar.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aplicar 1" }));

    expect(onApply).toHaveBeenCalledWith("proposal-2", ["op-3"]);
  });
});

const proposal: AiEditProposal = {
  id: "proposal-1",
  projectId: "project-1",
  interactionId: "interaction-1",
  status: "proposed",
  documentId: "project::doc.md",
  title: "Cambio sobre texto seleccionado",
  summary: "Amplía el apartado seleccionado.",
  scope: "selection",
  focus: {
    type: "selection",
    documentId: "project::doc.md",
    path: "doc.md",
    from: 4,
    to: 20,
    position: null,
    text: "Texto original",
  },
  operations: [
    {
      id: "op-1",
      action: "replace_selection",
      documentId: "project::doc.md",
      summary: "Amplía el apartado seleccionado.",
      confidence: "medium",
      from: 4,
      to: 20,
      originalExcerpt: "Texto original",
      replacementMarkdown: "Texto ampliado",
    },
  ],
  createdAt: "2026-06-06T10:00:00Z",
  updatedAt: "2026-06-06T10:00:00Z",
};

const multiOperationProposal: AiEditProposal = {
  ...proposal,
  id: "proposal-2",
  title: "3 cambios de proyecto preparados",
  summary: "Actualiza el concepto en varios apartados.",
  scope: "project",
  operations: [
    {
      ...proposal.operations[0],
      id: "op-1",
      documentId: "project::a.md",
      summary: "Cambio ya aplicado",
    },
    {
      ...proposal.operations[0],
      id: "op-2",
      documentId: "project::b.md",
      summary: "Cambio con ancla ambigua",
    },
    {
      ...proposal.operations[0],
      id: "op-3",
      documentId: "project::c.md",
      summary: "Cambio pendiente",
    },
  ],
};
