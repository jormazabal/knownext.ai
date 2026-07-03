import { describe, expect, it } from "vitest";
import { normalizeMarkdownHighlightColor, transformHighlightHtml } from "./highlightExtension";

describe("highlightExtension", () => {
  it("normalizes unsupported highlight colors to yellow", () => {
    expect(normalizeMarkdownHighlightColor("green")).toBe("green");
    expect(normalizeMarkdownHighlightColor("purple")).toBe("yellow");
    expect(normalizeMarkdownHighlightColor(undefined)).toBe("yellow");
  });

  it("transforms controlled mark HTML nodes into highlight markdown nodes", () => {
    const tree = {
      type: "root",
      children: [
        { type: "text", value: "Antes " },
        { type: "html", value: '<mark data-knx-highlight="blue">' },
        { type: "text", value: "texto" },
        { type: "html", value: "</mark>" },
        { type: "text", value: " después" },
      ],
    };

    transformHighlightHtml(tree);

    expect(tree.children).toEqual([
      { type: "text", value: "Antes " },
      { type: "highlight", color: "blue", children: [{ type: "text", value: "texto" }] },
      { type: "text", value: " después" },
    ]);
  });
});
