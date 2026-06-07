import { describe, expect, it } from "vitest";
import type { AiEditOperation } from "../types/domain";
import { applyAiEditOperationToMarkdown } from "./aiEditProposalApplication";

describe("applyAiEditOperationToMarkdown", () => {
  it("replaces a unique selected excerpt without treating editor positions as markdown offsets", () => {
    const result = applyAiEditOperationToMarkdown(
      operation({
        action: "replace_selection",
        originalExcerpt: "concepto antiguo.",
        replacementMarkdown: "concepto nuevo ampliado",
        from: 2,
        to: 4,
      }),
      "Intro\n\nEl Concepto antiguo no coincide por mayúsculas.\n\nEl concepto antiguo real: concepto antiguo.\n",
    );

    expect(result).toEqual({
      applied: true,
      markdown: "Intro\n\nEl Concepto antiguo no coincide por mayúsculas.\n\nEl concepto antiguo real: concepto nuevo ampliado\n",
    });
  });

  it("rejects ambiguous anchors so the product can ask for review instead of changing the wrong paragraph", () => {
    const result = applyAiEditOperationToMarkdown(
      operation({
        action: "edit_block",
        originalExcerpt: "repetido",
        replacementMarkdown: "cambio",
      }),
      "repetido\n\nrepetido\n",
    );

    expect(result).toEqual({ applied: false, reason: "anchor_ambiguous" });
  });

  it("inserts cursor content after the unique textual anchor", () => {
    const result = applyAiEditOperationToMarkdown(
      operation({
        action: "insert_at_cursor",
        anchorExcerpt: "Párrafo base.",
        markdown: "Nuevo bloque.",
      }),
      "# Título\n\nPárrafo base.\n\nCierre.\n",
    );

    expect(result).toEqual({
      applied: true,
      markdown: "# Título\n\nPárrafo base.\n\nNuevo bloque.\n\nCierre.\n",
    });
  });

  it("appends image markdown at the document end when the placement is explicit", () => {
    const result = applyAiEditOperationToMarkdown(
      operation({
        action: "insert_image",
        placement: { type: "document_end", headingPath: null, anchorExcerpt: null },
      }),
      "# Documento\n\nTexto.",
      { imageMarkdown: "![Diagrama](assets/diagrama.png)" },
    );

    expect(result).toEqual({
      applied: true,
      markdown: "# Documento\n\nTexto.\n\n![Diagrama](assets/diagrama.png)\n",
    });
  });

  it("inserts content after the requested heading without rewriting the whole document", () => {
    const result = applyAiEditOperationToMarkdown(
      operation({
        action: "insert_at_cursor",
        markdown: "Nuevo bloque bajo el apartado.",
        placement: { type: "after_heading", headingPath: ["Historia", "Orígenes"], anchorExcerpt: null },
      }),
      "# Historia\n\n## Orígenes\n\nTexto existente.\n\n## Consumo\n\nOtro texto.\n",
    );

    expect(result).toEqual({
      applied: true,
      markdown: "# Historia\n\n## Orígenes\n\nNuevo bloque bajo el apartado.\n\nTexto existente.\n\n## Consumo\n\nOtro texto.\n",
    });
  });

  it("rejects heading placement when the heading is ambiguous", () => {
    const result = applyAiEditOperationToMarkdown(
      operation({
        action: "insert_at_cursor",
        markdown: "Nuevo bloque.",
        placement: { type: "after_heading", headingPath: ["Orígenes"], anchorExcerpt: null },
      }),
      "## Orígenes\n\nA.\n\n## Orígenes\n\nB.\n",
    );

    expect(result).toEqual({ applied: false, reason: "anchor_ambiguous" });
  });
});

function operation(patch: Partial<AiEditOperation>): AiEditOperation {
  return {
    id: "op-1",
    action: "edit_block",
    documentId: "project::doc.md",
    summary: "Cambio",
    confidence: "medium",
    ...patch,
  };
}
