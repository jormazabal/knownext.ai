import { describe, expect, it } from "vitest";
import { formatMarkdownSourceForDisplay } from "./MarkdownSourceViewer";

describe("formatMarkdownSourceForDisplay", () => {
  it("compacts redundant blank lines between consecutive simple bullet items", () => {
    expect(formatMarkdownSourceForDisplay("- Uno\n\n- Dos\n\n- Tres")).toBe("- Uno\n- Dos\n- Tres");
  });

  it("compacts ordered and checklist items at the same nesting level", () => {
    expect(formatMarkdownSourceForDisplay("1. Uno\n\n2. Dos\n\n- [ ] Pendiente\n\n- [x] Hecho")).toBe("1. Uno\n2. Dos\n- [ ] Pendiente\n- [x] Hecho");
  });

  it("keeps meaningful loose-list spacing when an item contains a continuation paragraph", () => {
    const markdown = "- Uno\n\n  Explicacion adicional.\n\n- Dos";

    expect(formatMarkdownSourceForDisplay(markdown)).toBe(markdown);
  });
});
