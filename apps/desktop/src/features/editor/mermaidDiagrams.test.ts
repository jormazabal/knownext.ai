import { describe, expect, it } from "vitest";
import { defaultAiConfig } from "../../lib/api/config";
import { mermaidDiagramTemplates, validateMermaidPolicy } from "./mermaidCatalog";
import {
  buildMermaidMarkdown,
  diagramResolutionScale,
  extractKnownextDiagramMetadata,
  findMermaidDiagramBlocks,
  resolveMermaidDiagramWidthRatio,
  stripKnownextDiagramMetadata,
  updateKnownextDiagramMetadata,
} from "./mermaidDiagrams";

describe("mermaidDiagrams", () => {
  it("stores editable diagram metadata inside the Mermaid block", () => {
    const markdown = buildMermaidMarkdown({
      code: "flowchart TD\n  A --> B",
      caption: "Flujo de aprobacion",
      widthRatio: 0.72,
    });

    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("%% knownext:");
    expect(markdown).toContain("flowchart TD");

    const block = findMermaidDiagramBlocks(markdown)[0];
    expect(block.renderCode).toBe("flowchart TD\n  A --> B");
    expect(block.metadata).toEqual({ caption: "Flujo de aprobacion", width: null, widthRatio: 0.72 });
  });

  it("finds only Mermaid fenced blocks and strips KnowNext metadata before rendering", () => {
    const markdown = [
      "Texto",
      "```ts",
      "console.log('no');",
      "```",
      "```mermaid",
      '%% knownext: {"caption":"Arquitectura","width":"full"}',
      "sequenceDiagram",
      "  A->>B: Hola",
      "```",
    ].join("\n");

    const blocks = findMermaidDiagramBlocks(markdown);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].renderCode).toBe("sequenceDiagram\n  A->>B: Hola");
    expect(extractKnownextDiagramMetadata(blocks[0].code)).toEqual({ caption: "Arquitectura", width: "full", widthRatio: null });
    expect(stripKnownextDiagramMetadata(blocks[0].code)).not.toContain("knownext");
  });

  it("maps legacy diagram width and can reset persisted size metadata", () => {
    const code = '%% knownext: {"caption":"Arquitectura","width":"wide"}\nflowchart TD\n  A --> B';

    expect(resolveMermaidDiagramWidthRatio(extractKnownextDiagramMetadata(code))).toBe(0.9);

    const resized = updateKnownextDiagramMetadata(code, { width: null, widthRatio: 0.5 });
    expect(extractKnownextDiagramMetadata(resized)).toEqual({ caption: "Arquitectura", width: null, widthRatio: 0.5 });

    const reset = updateKnownextDiagramMetadata(resized, { width: null, widthRatio: null });
    expect(extractKnownextDiagramMetadata(reset)).toEqual({ caption: "Arquitectura", width: null, widthRatio: null });
    expect(reset).not.toContain("width");
    expect(reset).toContain("flowchart TD");
  });

  it("normalizes literal escaped line breaks generated inside diagram labels", () => {
    const code = String.raw`flowchart TD
  A[Inicio\nContexto] --> B[Resultado]`;

    expect(stripKnownextDiagramMetadata(code)).toContain("A[Inicio<br/>Contexto]");
  });

  it("maps export diagram resolution to raster scales", () => {
    expect(diagramResolutionScale("low")).toBe(2);
    expect(diagramResolutionScale("medium")).toBe(4);
    expect(diagramResolutionScale("high")).toBe(8);
  });

  it("ships a guided template catalog for the supported Mermaid families", () => {
    expect(mermaidDiagramTemplates.length).toBeGreaterThanOrEqual(28);
    expect(mermaidDiagramTemplates.some((template) => template.id === "flowchart-architecture-icons")).toBe(true);
    expect(mermaidDiagramTemplates.some((template) => template.diagramType === "architecture-beta")).toBe(true);
    expect(new Set(mermaidDiagramTemplates.map((template) => template.id)).size).toBe(mermaidDiagramTemplates.length);
  });

  it("enforces diagram visual policies before rendering", () => {
    const compatible = {
      ...defaultAiConfig.diagrams,
      visualProfile: "compatible" as const,
      iconSet: "none" as const,
      imagePolicy: "disabled" as const,
      aiGenerationMode: "safe" as const,
    };
    expect(validateMermaidPolicy('flowchart LR\n  app@{ icon: "lucide:monitor", label: "App" }', compatible).valid).toBe(false);
    expect(validateMermaidPolicy("flowchart LR\n  A --> B", compatible).valid).toBe(true);
    expect(validateMermaidPolicy("flowchart LR\n  A --> B\n  B --> https://example.com/img.png", defaultAiConfig.diagrams).valid).toBe(false);
  });

});
