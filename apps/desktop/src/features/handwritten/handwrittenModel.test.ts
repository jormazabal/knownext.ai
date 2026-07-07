import { describe, expect, it, vi } from "vitest";
import {
  addPencilPreset,
  createDefaultHandwrittenContent,
  createStrokeFromPoints,
  drawStroke,
  erasePartialStrokes,
  finalizeStrokePoints,
  findIntersectingStrokeIds,
  findLassoStrokeIds,
  getPencilTextureCacheKey,
  getToolPreset,
  normalizeEraserConfig,
  MAX_PENCIL_PRESETS,
  normalizeToolPresets,
  reorderPage,
  moveStrokeIds,
  removePencilPreset,
  removeStrokeIds,
  transformStrokeIds,
  updateHandwrittenPageLayout,
} from "./handwrittenModel";
import type { HandwrittenPoint } from "../../types/domain";

describe("handwrittenModel", () => {
  it("creates default knote content with the selected page background", () => {
    const content = createDefaultHandwrittenContent("note-1", "Boceto", "grid");

    expect(content.schemaVersion).toBe(1);
    expect(content.id).toBe("note-1");
    expect(content.defaultPage.background).toBe("grid");
    expect(content.pages).toHaveLength(1);
    expect(content.pages[0].background.type).toBe("grid");
    expect(content.toolPresets).toHaveLength(3);
    expect(content.toolPresets.map((tool) => tool.type)).toEqual(["pen", "pencil", "highlighter"]);
  });

  it("normalizes pressure points, builds stroke geometry and supports eraser/lasso operations", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = getToolPreset(content, "pencil-1");
    const stroke = createStrokeFromPoints(tool, [
      [10, 10, 0.2, 0],
      [40.234, 42.876, 1.4, 14],
      [Number.NaN, 20, 0.5, 20],
    ] as HandwrittenPoint[]);
    const page = { ...content.pages[0], strokes: [stroke] };

    expect(stroke.points).toHaveLength(2);
    expect(stroke.tool).toBe("pen");
    expect(stroke.points[1]).toEqual([40.23, 42.88, 1, 14, undefined, undefined]);
    expect(stroke.bounds!.width).toBeGreaterThan(30);
    expect(stroke.path).toMatch(/^M /);
    expect([...findIntersectingStrokeIds(page, { x: 40, y: 43 }, 4)]).toContain(stroke.id);
    expect([...findLassoStrokeIds(page, [
      [0, 0, 0.5, 0],
      [80, 0, 0.5, 0],
      [80, 80, 0.5, 0],
      [0, 80, 0.5, 0],
    ])]).toContain(stroke.id);

    const movedPage = moveStrokeIds(page, new Set([stroke.id]), 5, -3);
    expect(movedPage.strokes[0]!.points[0]).toEqual([15, 7, 0.2, 0, undefined, undefined]);
    expect(movedPage.strokes[0]!.bounds!.x).toBeGreaterThan(stroke.bounds!.x);

    const erasedPage = removeStrokeIds(movedPage, new Set([stroke.id]));
    expect(erasedPage.strokes).toHaveLength(0);
  });

  it("finalizes dense jittered points conservatively while preserving endpoints and pressure bounds", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), smoothing: 0.78 };
    const densePoints = Array.from({ length: 80 }, (_value, index) => [
      20 + index * 2,
      100 + Math.sin(index / 2) * 0.45,
      index % 2 === 0 ? 0.15 : 0.95,
      index * 4,
    ] as HandwrittenPoint);

    const finalizedPoints = finalizeStrokePoints(tool, densePoints);
    const stroke = createStrokeFromPoints(tool, densePoints);

    expect(finalizedPoints.length).toBeLessThan(densePoints.length / 2);
    expect(finalizedPoints[0]![0]).toBe(20);
    expect(finalizedPoints[finalizedPoints.length - 1]![0]).toBe(178);
    expect(finalizedPoints.every((point) => point[2] >= 0 && point[2] <= 1)).toBe(true);
    expect(stroke.points).toEqual(finalizedPoints);
    expect(stroke.path).toMatch(/^M /);
    expect(stroke.bounds!.width).toBeGreaterThan(150);
  });

  it("does not collapse very short handwriting marks", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = getToolPreset(content, "pencil-2");
    const points = [
      [10, 10, 0.4, 0],
      [10.4, 10.25, 0.45, 4],
      [10.8, 10.6, 0.5, 8],
      [11.2, 10.95, 0.55, 12],
    ] as HandwrittenPoint[];

    const finalizedPoints = finalizeStrokePoints(tool, points);
    expect(finalizedPoints.length).toBeGreaterThanOrEqual(2);
    expect(finalizedPoints[0]).toEqual([10, 10, 0.4, 0, undefined, undefined]);
    expect(finalizedPoints[finalizedPoints.length - 1]).toEqual([11.2, 10.95, 0.55, 12, undefined, undefined]);
  });

  it("adds deterministic texture metadata only to pencil strokes", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const penStroke = createStrokeFromPoints(getToolPreset(content, "pencil-1"), linePoints(10, 10, 70, 20, 4, 0));
    const pencilStroke = createStrokeFromPoints(getToolPreset(content, "pencil-2"), linePoints(10, 40, 70, 50, 4, 0));

    expect(penStroke.textureSeed).toBeUndefined();
    expect(penStroke.textureVersion).toBeUndefined();
    expect(pencilStroke.tool).toBe("pencil");
    expect(pencilStroke.textureSeed).toMatch(/^texture-/);
    expect(pencilStroke.textureVersion).toBe(1);

    const legacyPencilStroke = { ...pencilStroke, textureSeed: undefined, textureVersion: undefined };
    expect(getPencilTextureCacheKey(legacyPencilStroke)).toBe(getPencilTextureCacheKey(legacyPencilStroke));
    expect(getPencilTextureCacheKey({ ...legacyPencilStroke, color: "#111827" })).not.toBe(getPencilTextureCacheKey(legacyPencilStroke));
  });

  it("detects eraser hits and lasso crossings against simplified stroke segments", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), smoothing: 1 };
    const stroke = createStrokeFromPoints(tool, [
      [0, 50, 0.5, 0],
      [20, 50.2, 0.5, 4],
      [40, 49.8, 0.5, 8],
      [60, 50.1, 0.5, 12],
      [80, 50, 0.5, 16],
    ] as HandwrittenPoint[]);
    const page = { ...content.pages[0]!, strokes: [stroke] };

    expect(stroke.points.length).toBeLessThan(5);
    expect([...findIntersectingStrokeIds(page, { x: 40, y: 50 }, 2)]).toContain(stroke.id);
    expect([...findLassoStrokeIds(page, [
      [38, 40, 0.5, 0],
      [42, 40, 0.5, 0],
      [42, 60, 0.5, 0],
      [38, 60, 0.5, 0],
    ])]).toContain(stroke.id);
  });

  it("preserves sharp corners when finalizing geometric shapes", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), smoothing: 1 };
    const squarePoints = [
      ...linePoints(100, 100, 220, 100, 9, 0),
      ...linePoints(220, 100, 220, 220, 9, 40).slice(1),
      ...linePoints(220, 220, 100, 220, 9, 80).slice(1),
      ...linePoints(100, 220, 100, 100, 9, 120).slice(1),
    ];

    const finalizedPoints = finalizeStrokePoints(tool, squarePoints);

    expect(finalizedPoints.some((point) => distanceBetweenPoints(point, [220, 100, 0.5, 0]) < 4)).toBe(true);
    expect(finalizedPoints.some((point) => distanceBetweenPoints(point, [220, 220, 0.5, 0]) < 4)).toBe(true);
    expect(finalizedPoints.some((point) => distanceBetweenPoints(point, [100, 220, 0.5, 0]) < 4)).toBe(true);
    expect(finalizedPoints.length).toBeLessThan(squarePoints.length);
  });

  it("preserves triangle vertices after smoothing and path generation", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), smoothing: 0.9 };
    const trianglePoints = [
      ...linePoints(180, 80, 280, 240, 10, 0),
      ...linePoints(280, 240, 80, 240, 10, 50).slice(1),
      ...linePoints(80, 240, 180, 80, 10, 100).slice(1),
    ];

    const stroke = createStrokeFromPoints(tool, trianglePoints);

    expect(stroke.points.some((point) => distanceBetweenPoints(point, [280, 240, 0.5, 0]) < 4)).toBe(true);
    expect(stroke.points.some((point) => distanceBetweenPoints(point, [80, 240, 0.5, 0]) < 4)).toBe(true);
    expect(stroke.path).toMatch(/^M /);
  });

  it("renders smooth curves with curved path commands instead of visibly segmented outlines", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), smoothing: 0.9 };
    const curvePoints = Array.from({ length: 44 }, (_value, index) => {
      const x = 40 + index * 7;
      const y = 150 + Math.sin(index / 5) * 44;
      return [x, y, 0.55, index * 5] as HandwrittenPoint;
    });

    const stroke = createStrokeFromPoints(tool, curvePoints);

    expect(stroke.points.length).toBeGreaterThan(8);
    expect(stroke.points.length).toBeLessThan(curvePoints.length);
    expect(stroke.path).toContain(" Q ");
  });

  it("renders AI strokes through computed smooth paths instead of segmented line drawing", () => {
    const originalPath2D = globalThis.Path2D;
    class FakePath2D {
      value: string;

      constructor(value: string) {
        this.value = value;
      }
    }
    globalThis.Path2D = FakePath2D as unknown as typeof Path2D;
    const fill = vi.fn();
    const lineTo = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fill,
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo,
      stroke: vi.fn(),
      set globalAlpha(_value: number) {},
      set lineCap(_value: CanvasLineCap) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set strokeStyle(_value: string) {},
      set fillStyle(_value: string) {},
      set lineWidth(_value: number) {},
    } as unknown as CanvasRenderingContext2D;

    drawStroke(ctx, {
      id: "ai-gato-outer-line-1",
      tool: "pencil",
      color: "#111827",
      width: 4,
      opacity: 0.9,
      pressure: true,
      pressureSensitivity: 0.82,
      path: null,
      points: Array.from({ length: 20 }, (_value, index) => [
        120 + index * 12,
        180 + Math.sin(index / 3) * 34,
        0.35 + Math.sin(index / 4) * 0.2,
        index * 18,
      ] as HandwrittenPoint),
    }, true);

    expect(fill).toHaveBeenCalledTimes(1);
    expect(lineTo).not.toHaveBeenCalled();
    globalThis.Path2D = originalPath2D;
  });

  it("keeps sharp-corner paths angular while smoothing curves", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), smoothing: 0.95 };
    const squarePoints = [
      ...linePoints(40, 40, 120, 40, 8, 0),
      ...linePoints(120, 40, 120, 120, 8, 40).slice(1),
      ...linePoints(120, 120, 40, 120, 8, 80).slice(1),
    ];

    const stroke = createStrokeFromPoints(tool, squarePoints);

    expect(stroke.path).not.toContain(" Q ");
  });

  it("resizes handwritten pages by preset and orientation while scaling strokes", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = getToolPreset(content, "pencil-1");
    const stroke = createStrokeFromPoints(tool, [
      [100, 100, 0.5, 0],
      [300, 500, 0.7, 20],
    ] as HandwrittenPoint[]);
    const contentWithStroke = {
      ...content,
      pages: [{ ...content.pages[0], strokes: [stroke] }],
    };

    const resized = updateHandwrittenPageLayout(contentWithStroke, "page-1", "16:9", "landscape");
    const page = resized.pages[0]!;

    expect(resized.defaultPage.preset).toBe("16:9");
    expect(resized.defaultPage.orientation).toBe("landscape");
    expect(page.size).toMatchObject({ width: 1600, height: 900, preset: "16:9" });
    const sourceDeltaX = stroke.points[1]![0] - stroke.points[0]![0];
    const sourceDeltaY = stroke.points[1]![1] - stroke.points[0]![1];
    const resizedDeltaX = page.strokes[0]!.points[1]![0] - page.strokes[0]!.points[0]![0];
    const resizedDeltaY = page.strokes[0]!.points[1]![1] - page.strokes[0]!.points[0]![1];
    expect(resizedDeltaX / resizedDeltaY).toBeCloseTo(sourceDeltaX / sourceDeltaY, 2);
    expect(page.strokes[0]!.points[1]![1]).toBeLessThan(stroke.points[1]![1]);
    expect(page.strokes[0]!.path).toMatch(/^M /);

    const backToPortrait = updateHandwrittenPageLayout(resized, "page-1", "16:9", "portrait");
    const landscapeAgain = updateHandwrittenPageLayout(backToPortrait, "page-1", "16:9", "landscape");
    const firstLandscapeDistance = distanceBetweenPoints(page.strokes[0]!.points[0]!, page.strokes[0]!.points[1]!);
    const secondLandscapeDistance = distanceBetweenPoints(landscapeAgain.pages[0]!.strokes[0]!.points[0]!, landscapeAgain.pages[0]!.strokes[0]!.points[1]!);
    expect(secondLandscapeDistance).toBeCloseTo(firstLandscapeDistance, 2);
  });

  it("scales and rotates selected strokes from their original geometry", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = getToolPreset(content, "pencil-1");
    const stroke = createStrokeFromPoints(tool, [
      [100, 100, 0.5, 0],
      [200, 100, 0.5, 20],
    ] as HandwrittenPoint[]);
    const page = { ...content.pages[0], strokes: [stroke] };

    const scaled = transformStrokeIds(page, [stroke], {
      origin: { x: 100, y: 100 },
      scaleX: 2,
      scaleY: 1,
    });
    expect(scaled.strokes[0]!.points[1]![0]).toBe(300);
    expect(scaled.strokes[0]!.points[1]![1]).toBe(100);
    expect(scaled.strokes[0]!.width).toBeGreaterThan(stroke.width);

    const rotated = transformStrokeIds(page, [stroke], {
      origin: { x: 100, y: 100 },
      rotationRadians: Math.PI / 2,
    });
    expect(rotated.strokes[0]!.points[1]![0]).toBe(100);
    expect(rotated.strokes[0]!.points[1]![1]).toBe(200);

    const translated = transformStrokeIds(page, [stroke], {
      origin: { x: 100, y: 100 },
      translateX: 35,
      translateY: -12,
    });
    expect(translated.strokes[0]!.id).toBe(stroke.id);
    expect(translated.strokes[0]!.points[0]).toEqual([135, 88, 0.5, 0, undefined, undefined]);
    expect(translated.strokes[0]!.points[1]).toEqual([235, 88, 0.5, 20, undefined, undefined]);
    expect(translated.strokes[0]!.path).toMatch(/^M /);

    const translatedAgainFromSource = transformStrokeIds(translated, [stroke], {
      origin: { x: 100, y: 100 },
      translateX: 35,
      translateY: -12,
    });
    expect(translatedAgainFromSource.strokes[0]!.points).toEqual(translated.strokes[0]!.points);

    const translatedAndRotated = transformStrokeIds(page, [stroke], {
      origin: { x: 100, y: 100 },
      translateX: 10,
      translateY: 5,
      rotationRadians: Math.PI / 2,
    });
    expect(translatedAndRotated.strokes[0]!.points[0]).toEqual([110, 105, 0.5, 0, undefined, undefined]);
    expect(translatedAndRotated.strokes[0]!.points[1]).toEqual([110, 205, 0.5, 20, undefined, undefined]);
  });

  it("preserves pencil texture metadata through transforms", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const stroke = createStrokeFromPoints(getToolPreset(content, "pencil-2"), [
      [100, 100, 0.5, 0],
      [200, 100, 0.5, 20],
    ] as HandwrittenPoint[]);
    const page = { ...content.pages[0], strokes: [stroke] };

    const transformed = transformStrokeIds(page, [stroke], {
      origin: { x: 100, y: 100 },
      translateX: 20,
      rotationRadians: Math.PI / 5,
    });

    expect(transformed.strokes[0]!.textureSeed).toBe(stroke.textureSeed);
    expect(transformed.strokes[0]!.textureVersion).toBe(1);
    expect(getPencilTextureCacheKey(transformed.strokes[0]!)).not.toBe(getPencilTextureCacheKey(stroke));
  });

  it("reorders pages by id and ignores invalid moves", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const secondPageContent = {
      ...content,
      pages: [
        content.pages[0]!,
        { ...content.pages[0]!, id: "page-2" },
        { ...content.pages[0]!, id: "page-3" },
      ],
    };

    const reordered = reorderPage(secondPageContent, "page-3", "page-1");
    expect(reordered.pages.map((page) => page.id)).toEqual(["page-3", "page-1", "page-2"]);

    expect(reorderPage(reordered, "missing", "page-2")).toBe(reordered);
    expect(reorderPage(reordered, "page-2", "page-2")).toBe(reordered);
  });

  it("normalizes legacy tools and enforces pencil preset add/remove limits", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const legacyPresets = normalizeToolPresets([
      { id: "pen", label: "Boligrafo", color: "#111827", width: 4, opacity: 1, pressure: true, pressureSensitivity: 0.55, smoothing: 0.62 },
      { id: "eraser", label: "Borrador", color: "#FFFFFF", width: 24, opacity: 1, pressure: false, pressureSensitivity: 0.2, smoothing: 0.3 },
    ]);

    expect(legacyPresets).toHaveLength(3);
    expect(legacyPresets[0].id).toBe("pen");
    expect(legacyPresets[0].type).toBe("pen");
    expect(legacyPresets[0].pressureSensitivity).toBe(0.55);
    expect(legacyPresets.some((preset) => preset.id === "eraser")).toBe(false);

    let nextContent = content;
    for (let index = 0; index < 8; index += 1) {
      nextContent = addPencilPreset(nextContent).content;
    }
    expect(nextContent.toolPresets).toHaveLength(MAX_PENCIL_PRESETS);

    nextContent = removePencilPreset(nextContent, nextContent.toolPresets[0].id);
    expect(nextContent.toolPresets).toHaveLength(MAX_PENCIL_PRESETS - 1);

    const threePresetContent = createDefaultHandwrittenContent("note-2");
    expect(removePencilPreset(threePresetContent, threePresetContent.toolPresets[0].id).toolPresets).toHaveLength(3);
  });

  it("normalizes eraser configuration with safe defaults and width clamps", () => {
    expect(normalizeEraserConfig(undefined)).toEqual({ width: 24, mode: "stroke" });
    expect(normalizeEraserConfig({ width: -10, mode: "partial" })).toEqual({ width: 6, mode: "partial" });
    expect(normalizeEraserConfig({ width: 99, mode: "unsupported" as never })).toEqual({ width: 72, mode: "stroke" });
  });

  it("partially erases a line into visible stroke fragments", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-2"), width: 4 };
    const stroke = createStrokeFromPoints(tool, linePoints(0, 100, 200, 100, 5, 0));
    const page = { ...content.pages[0]!, strokes: [stroke] };

    const erased = erasePartialStrokes(page, [[100, 100, 0.5, 0]], 12);

    expect(erased.strokes).toHaveLength(2);
    expect(erased.strokes.every((fragment) => fragment.id !== stroke.id)).toBe(true);
    expect(erased.strokes.every((fragment) => fragment.path?.startsWith("M "))).toBe(true);
    expect(erased.strokes.every((fragment) => fragment.textureSeed?.startsWith(`${stroke.textureSeed}:fragment:`))).toBe(true);
    expect(erased.strokes.every((fragment) => fragment.textureVersion === 1)).toBe(true);
    expect(erased.strokes[0]!.bounds!.x).toBeLessThan(90);
    expect(erased.strokes[1]!.bounds!.x).toBeGreaterThan(100);
  });

  it("partially erases only the crossed side of a square", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const tool = { ...getToolPreset(content, "pencil-1"), width: 4, smoothing: 0.2 };
    const squareStroke = createStrokeFromPoints(tool, [
      ...linePoints(40, 40, 160, 40, 6, 0),
      ...linePoints(160, 40, 160, 160, 6, 40).slice(1),
      ...linePoints(160, 160, 40, 160, 6, 80).slice(1),
      ...linePoints(40, 160, 40, 40, 6, 120).slice(1),
    ]);
    const page = { ...content.pages[0]!, strokes: [squareStroke] };

    const erased = erasePartialStrokes(page, linePoints(100, 20, 100, 70, 4, 0), 10);

    expect(erased.strokes.length).toBeGreaterThanOrEqual(1);
    expect(erased.strokes.some((fragment) => fragment.points.some((point) => point[1] > 130))).toBe(true);
    expect(erased.strokes.flatMap((fragment) => fragment.points).some((point) => Math.abs(point[0] - 100) < 6 && point[1] < 55)).toBe(false);
  });

  it("keeps untouched partial-erase strokes by identity and accounts for wide strokes", () => {
    const content = createDefaultHandwrittenContent("note-1");
    const pen = { ...getToolPreset(content, "pencil-1"), width: 4 };
    const highlighter = { ...getToolPreset(content, "pencil-3"), width: 30 };
    const untouched = createStrokeFromPoints(pen, linePoints(0, 20, 120, 20, 4, 0));
    const wideStroke = createStrokeFromPoints(highlighter, linePoints(0, 100, 120, 100, 4, 0));
    const page = { ...content.pages[0]!, strokes: [untouched, wideStroke] };

    const erased = erasePartialStrokes(page, [[60, 120, 0.5, 0]], 6);

    expect(erased.strokes).toContain(untouched);
    expect(erased.strokes).not.toContain(wideStroke);
    expect(erased.strokes.length).toBeGreaterThanOrEqual(2);
  });
});

function distanceBetweenPoints(first: HandwrittenPoint, second: HandwrittenPoint) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function linePoints(startX: number, startY: number, endX: number, endY: number, steps: number, timeOffset: number) {
  return Array.from({ length: steps }, (_value, index) => {
    const ratio = index / (steps - 1);
    return [
      startX + (endX - startX) * ratio,
      startY + (endY - startY) * ratio,
      0.5,
      timeOffset + index * 5,
    ] as HandwrittenPoint;
  });
}
