import getStroke from "perfect-freehand";
import type {
  HandwrittenNoteContent,
  HandwrittenNotePage,
  HandwrittenPageBackground,
  HandwrittenPageOrientation,
  HandwrittenPageSizePreset,
  HandwrittenEraserConfig,
  HandwrittenEraserMode,
  HandwrittenPencilType,
  HandwrittenPoint,
  HandwrittenStroke,
  HandwrittenToolId,
  HandwrittenToolPreset,
} from "../../types/domain";

const A4_PORTRAIT = { width: 1190, height: 1684 } as const;
const RATIO_PAGE_LONG_SIDE = 1600;
const SQUARE_PAGE_SIZE = 1200;
export const MIN_PENCIL_PRESETS = 3;
export const MAX_PENCIL_PRESETS = 7;
export const ERASER_WIDTH = 24;
export const MIN_ERASER_WIDTH = 6;
export const MAX_ERASER_WIDTH = 72;
export const DEFAULT_ERASER_CONFIG: HandwrittenEraserConfig = { width: ERASER_WIDTH, mode: "stroke" };
const STROKE_PATH_CACHE_LIMIT = 500;
const PENCIL_TEXTURE_VERSION = 1;
const PENCIL_TEXTURE_SCALE = 2;
const PENCIL_TEXTURE_CACHE_LIMIT = 220;
const PENCIL_TEXTURE_CACHE_MAX_PIXELS = 9_000_000;
const PENCIL_TEXTURE_MAX_AREA = 2_400_000;
const PENCIL_TEXTURE_PADDING = 8;

type StrokeProcessingProfile = {
  minDistance: number;
  positionSmoothing: number;
  pressureSmoothing: number;
  simplifyTolerance: number;
};

const strokePathCache = new Map<string, Path2D>();
const pencilTextureCache = new Map<string, PencilTextureCacheEntry>();

type PencilTextureCanvas = HTMLCanvasElement | OffscreenCanvas;
type PencilTextureContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type PencilTextureCacheEntry = {
  canvas: PencilTextureCanvas;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
};

export const PENCIL_TYPES: Array<{ id: HandwrittenPencilType; label: string; defaults: Omit<HandwrittenToolPreset, "id" | "type" | "label"> }> = [
  { id: "pen", label: "Boligrafo", defaults: { color: "#111827", width: 4, opacity: 1, pressure: true, pressureSensitivity: 0.55, smoothing: 0.62 } },
  { id: "fountain", label: "Pluma", defaults: { color: "#111827", width: 5, opacity: 1, pressure: true, pressureSensitivity: 0.72, smoothing: 0.82 } },
  { id: "pencil", label: "Lapiz", defaults: { color: "#374151", width: 3, opacity: 0.68, pressure: true, pressureSensitivity: 0.82, smoothing: 0.48 } },
  { id: "marker", label: "Rotulador", defaults: { color: "#D85A12", width: 9, opacity: 0.92, pressure: true, pressureSensitivity: 0.38, smoothing: 0.56 } },
  { id: "highlighter", label: "Subrayador", defaults: { color: "#FACC15", width: 18, opacity: 0.36, pressure: false, pressureSensitivity: 0.2, smoothing: 0.42 } },
];

export const DEFAULT_PENCILS: HandwrittenToolPreset[] = [
  { id: "pencil-1", type: "pen", label: "Boligrafo", color: "#111827", width: 4, opacity: 1, pressure: true, pressureSensitivity: 0.55, smoothing: 0.62 },
  { id: "pencil-2", type: "pencil", label: "Lapiz", color: "#374151", width: 3, opacity: 0.68, pressure: true, pressureSensitivity: 0.82, smoothing: 0.48 },
  { id: "pencil-3", type: "highlighter", label: "Subrayador", color: "#FACC15", width: 18, opacity: 0.36, pressure: false, pressureSensitivity: 0.2, smoothing: 0.42 },
];

export const PAGE_BACKGROUNDS: Array<{ id: HandwrittenPageBackground; label: string }> = [
  { id: "blank", label: "Blanco" },
  { id: "ruled", label: "Rayado" },
  { id: "grid", label: "Cuadricula" },
  { id: "dots", label: "Puntos" },
  { id: "cornell", label: "Cornell" },
];

export const PAGE_SIZE_PRESETS: Array<{ id: Exclude<HandwrittenPageSizePreset, "Letter" | "free">; label: string }> = [
  { id: "A4", label: "DinA4" },
  { id: "4:3", label: "4:3" },
  { id: "16:9", label: "16:9" },
  { id: "1:1", label: "1:1" },
];

export const PAGE_ORIENTATIONS: Array<{ id: HandwrittenPageOrientation; label: string }> = [
  { id: "portrait", label: "Vertical" },
  { id: "landscape", label: "Horizontal" },
];

export function createDefaultHandwrittenContent(id: string, title = "Nota a mano", background: HandwrittenPageBackground = "blank"): HandwrittenNoteContent {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id,
    title,
    createdAt: now,
    updatedAt: now,
    defaultPage: { preset: "A4", orientation: "portrait", background },
    toolPresets: cloneHandwrittenValue(DEFAULT_PENCILS),
    pages: [createHandwrittenPage("page-1", background, "A4", "portrait")],
    ocr: { status: "not-indexed", updatedAt: null, textByPage: {} },
  };
}

export function createHandwrittenPage(
  id: string,
  background: HandwrittenPageBackground = "blank",
  preset: HandwrittenPageSizePreset = "A4",
  orientation: HandwrittenPageOrientation = "portrait",
): HandwrittenNotePage {
  const size = getPageSize(preset, orientation);
  return {
    id,
    title: null,
    size,
    background: { type: background, spacing: 32 },
    strokes: [],
    thumbnailHash: null,
    updatedAt: new Date().toISOString(),
  };
}

export function cloneHandwrittenValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function touchHandwrittenContent(content: HandwrittenNoteContent): HandwrittenNoteContent {
  return { ...content, updatedAt: new Date().toISOString() };
}

export function updateHandwrittenPage(
  content: HandwrittenNoteContent,
  pageId: string,
  updater: (page: HandwrittenNotePage) => HandwrittenNotePage,
): HandwrittenNoteContent {
  const pages = content.pages.map((page) => {
    if (page.id !== pageId) return page;
    const updatedPage = updater(page);
    return { ...updatedPage, updatedAt: new Date().toISOString() };
  });
  return touchHandwrittenContent({ ...content, pages });
}

export function updateHandwrittenPageLayout(
  content: HandwrittenNoteContent,
  pageId: string,
  preset: HandwrittenPageSizePreset,
  orientation: HandwrittenPageOrientation,
): HandwrittenNoteContent {
  const targetSize = getPageSize(preset, orientation);
  return touchHandwrittenContent({
    ...content,
    defaultPage: {
      ...content.defaultPage,
      preset: targetSize.preset,
      orientation,
    },
    pages: content.pages.map((page) => (
      page.id === pageId ? resizeHandwrittenPage(page, targetSize) : page
    )),
  });
}

export function updateToolPreset(
  content: HandwrittenNoteContent,
  presetId: string,
  patch: Partial<HandwrittenToolPreset>,
): HandwrittenNoteContent {
  const toolPresets = updateToolPresetList(content.toolPresets, presetId, patch);
  return touchHandwrittenContent({
    ...content,
    toolPresets,
  });
}

export function getToolPreset(content: HandwrittenNoteContent, presetId: string): HandwrittenToolPreset {
  return normalizeToolPresets(content.toolPresets).find((preset) => preset.id === presetId) ?? DEFAULT_PENCILS[0];
}

export function normalizeToolPresets(presets: HandwrittenToolPreset[] | null | undefined = DEFAULT_PENCILS): HandwrittenToolPreset[] {
  const seen = new Set<string>();
  const normalized: HandwrittenToolPreset[] = [];
  const rawPresets = Array.isArray(presets) ? presets : [];

  for (const rawPreset of rawPresets) {
    if (normalized.length >= MAX_PENCIL_PRESETS) break;
    const normalizedPreset = normalizeToolPreset(rawPreset, seen, normalized.length);
    if (!normalizedPreset) continue;
    seen.add(normalizedPreset.id);
    normalized.push(normalizedPreset);
  }

  for (const defaultPreset of DEFAULT_PENCILS) {
    if (normalized.length >= MIN_PENCIL_PRESETS) break;
    if (seen.has(defaultPreset.id)) continue;
    normalized.push(cloneHandwrittenValue(defaultPreset));
    seen.add(defaultPreset.id);
  }

  return normalized.slice(0, MAX_PENCIL_PRESETS);
}

export function normalizeEraserConfig(config: Partial<HandwrittenEraserConfig> | null | undefined): HandwrittenEraserConfig {
  return {
    width: normalizeEraserWidth(config?.width),
    mode: normalizeEraserMode(config?.mode),
  };
}

export function normalizeEraserWidth(width: unknown): number {
  const numericWidth = typeof width === "number" ? width : Number(width);
  if (!Number.isFinite(numericWidth)) return DEFAULT_ERASER_CONFIG.width;
  return Math.round(Math.min(MAX_ERASER_WIDTH, Math.max(MIN_ERASER_WIDTH, numericWidth)));
}

function normalizeEraserMode(mode: unknown): HandwrittenEraserMode {
  return mode === "partial" ? "partial" : "stroke";
}

export function addPencilPreset(content: HandwrittenNoteContent): { content: HandwrittenNoteContent; presetId: string } {
  const result = addPencilPresetToList(content.toolPresets);
  return {
    content: touchHandwrittenContent({ ...content, toolPresets: result.toolPresets }),
    presetId: result.presetId,
  };
}

export function addPencilPresetToList(presets: HandwrittenToolPreset[]): { toolPresets: HandwrittenToolPreset[]; presetId: string } {
  const currentPresets = normalizeToolPresets(presets);
  if (currentPresets.length >= MAX_PENCIL_PRESETS) {
    return { toolPresets: currentPresets, presetId: currentPresets[currentPresets.length - 1]?.id ?? DEFAULT_PENCILS[0].id };
  }
  const baseType = currentPresets[currentPresets.length - 1]?.type ?? "pen";
  const typeDefinition = getPencilTypeDefinition(baseType);
  const presetId = createId("pencil");
  const preset: HandwrittenToolPreset = {
    id: presetId,
    type: typeDefinition.id,
    label: `${typeDefinition.label} ${currentPresets.length + 1}`,
    ...typeDefinition.defaults,
  };
  return {
    toolPresets: [...currentPresets, preset],
    presetId,
  };
}

export function removePencilPreset(content: HandwrittenNoteContent, presetId: string): HandwrittenNoteContent {
  const toolPresets = removePencilPresetFromList(content.toolPresets, presetId);
  if (toolPresets === content.toolPresets) return content;
  return touchHandwrittenContent({ ...content, toolPresets });
}

export function updateToolPresetList(
  presets: HandwrittenToolPreset[],
  presetId: string,
  patch: Partial<HandwrittenToolPreset>,
): HandwrittenToolPreset[] {
  return normalizeToolPresets(presets).map((preset) => (
    preset.id === presetId ? normalizeToolPreset({ ...preset, ...patch }) ?? preset : preset
  ));
}

export function removePencilPresetFromList(presets: HandwrittenToolPreset[], presetId: string): HandwrittenToolPreset[] {
  const currentPresets = normalizeToolPresets(presets);
  if (currentPresets.length <= MIN_PENCIL_PRESETS) return currentPresets;
  const nextPresets = currentPresets.filter((preset) => preset.id !== presetId);
  if (nextPresets.length === currentPresets.length) return currentPresets;
  return normalizeToolPresets(nextPresets);
}

export function getPencilTypeLabel(type: HandwrittenPencilType | undefined) {
  return getPencilTypeDefinition(type ?? "pen").label;
}

export function createStrokeFromPoints(tool: HandwrittenToolPreset, points: HandwrittenPoint[]): HandwrittenStroke {
  const normalizedPoints = finalizeStrokePoints(tool, points);
  const bounds = getStrokeBounds(normalizedPoints, tool.width);
  const toolType = resolvePencilType(tool.type ?? tool.id) ?? "pen";
  return {
    id: createId("stroke"),
    tool: toolType,
    color: tool.color,
    width: tool.width,
    opacity: tool.opacity,
    pressure: tool.pressure,
    pressureSensitivity: tool.pressureSensitivity,
    ...(toolType === "pencil" ? { textureSeed: createId("texture"), textureVersion: PENCIL_TEXTURE_VERSION as 1 } : {}),
    points: normalizedPoints,
    path: buildStrokeOutlinePath(normalizedPoints, tool),
    bounds,
  };
}

export function finalizeStrokePoints(tool: HandwrittenToolPreset, points: HandwrittenPoint[]): HandwrittenPoint[] {
  const normalizedPoints = normalizeStrokePoints(points);
  if (normalizedPoints.length <= 2) return normalizedPoints;
  const profile = getStrokeProcessingProfile(tool);
  const distanceFilteredPoints = filterCloseStrokePoints(normalizedPoints, profile.minDistance);
  if (distanceFilteredPoints.length <= 2) return distanceFilteredPoints;
  const cornerIndexes = getCornerPointIndexes(distanceFilteredPoints, profile.simplifyTolerance);
  const positionSmoothedPoints = smoothStrokePositions(distanceFilteredPoints, profile.positionSmoothing, cornerIndexes);
  const pressureSmoothedPoints = smoothStrokePressure(positionSmoothedPoints, profile.pressureSmoothing);
  const effectiveTolerance = cornerIndexes.size > 0 ? profile.simplifyTolerance : profile.simplifyTolerance * 0.62;
  return simplifyStrokePoints(pressureSmoothedPoints, effectiveTolerance, cornerIndexes);
}

export function normalizeStrokePoints(points: HandwrittenPoint[]): HandwrittenPoint[] {
  return points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1])).map((point) => [
    roundNumber(point[0]),
    roundNumber(point[1]),
    clampNumber(point[2] || 0.5, 0, 1),
    Math.max(0, Math.round(point[3] || 0)),
    point[4],
    point[5],
  ]);
}

export function getStrokeBounds(points: HandwrittenPoint[], width = 1) {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const padding = Math.max(2, width);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;
  return {
    x: roundNumber(minX),
    y: roundNumber(minY),
    width: roundNumber(maxX - minX),
    height: roundNumber(maxY - minY),
  };
}

export function buildStrokeOutlinePath(points: HandwrittenPoint[], tool: Pick<HandwrittenToolPreset, "width" | "smoothing" | "pressure" | "pressureSensitivity">) {
  if (points.length < 2) return "";
  const sensitivity = clampNumber(tool.pressureSensitivity, 0, 1);
  const smoothing = clampNumber(tool.smoothing, 0, 1);
  const hasSharpCorners = getCornerPointIndexes(points, Math.max(0.8, tool.width * 0.3)).size > 0;
  const effectiveSmoothing = hasSharpCorners ? Math.min(smoothing, 0.28) : smoothing;
  const outline = getStroke(points.map((point) => [point[0], point[1], tool.pressure ? applyPressureSensitivity(point[2], sensitivity) : 0.5]), {
    size: tool.width,
    thinning: tool.pressure ? 0.18 + sensitivity * 0.72 : 0,
    smoothing: effectiveSmoothing,
    streamline: hasSharpCorners ? 0.08 : 0.18 + smoothing * 0.2,
    simulatePressure: false,
  });
  return getSvgPathFromStroke(outline, { smooth: !hasSharpCorners });
}

export function getSvgPathFromStroke(points: number[][], options: { smooth?: boolean } = {}) {
  if (points.length === 0) return "";
  const first = points[0];
  if (options.smooth && points.length > 3) return getSmoothSvgPathFromStroke(points);
  const rest = points.slice(1);
  const path = rest.reduce((commands, point) => `${commands} L ${roundNumber(point[0])} ${roundNumber(point[1])}`, `M ${roundNumber(first[0])} ${roundNumber(first[1])}`);
  return `${path} Z`;
}

function getSmoothSvgPathFromStroke(points: number[][]) {
  const first = points[0];
  let path = `M ${roundNumber(first[0])} ${roundNumber(first[1])}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current[0] + next[0]) / 2;
    const midY = (current[1] + next[1]) / 2;
    path += ` Q ${roundNumber(current[0])} ${roundNumber(current[1])} ${roundNumber(midX)} ${roundNumber(midY)}`;
  }
  const last = points[points.length - 1];
  path += ` Q ${roundNumber(last[0])} ${roundNumber(last[1])} ${roundNumber(first[0])} ${roundNumber(first[1])} Z`;
  return path;
}

function getStrokeProcessingProfile(tool: HandwrittenToolPreset): StrokeProcessingProfile {
  const smoothing = clampNumber(tool.smoothing, 0, 1);
  const width = Math.max(1, tool.width);
  const type = resolvePencilType(tool.type ?? tool.id) ?? "pen";
  const typeProfile = {
    pen: { distance: 0.08, position: 0.12, tolerance: 0.55 },
    fountain: { distance: 0.09, position: 0.16, tolerance: 0.65 },
    pencil: { distance: 0.1, position: 0.18, tolerance: 0.7 },
    marker: { distance: 0.13, position: 0.22, tolerance: 0.95 },
    highlighter: { distance: 0.18, position: 0.26, tolerance: 1.35 },
  }[type];

  return {
    minDistance: clampNumber(width * typeProfile.distance + smoothing * 0.85, 0.45, Math.max(1.4, width * 0.35)),
    positionSmoothing: clampNumber(smoothing * typeProfile.position, 0, 0.34),
    pressureSmoothing: clampNumber(0.18 + smoothing * 0.28, 0.18, 0.46),
    simplifyTolerance: clampNumber(typeProfile.tolerance + smoothing * typeProfile.tolerance, 0.35, Math.max(0.8, width * 0.45)),
  };
}

function filterCloseStrokePoints(points: HandwrittenPoint[], minDistance: number): HandwrittenPoint[] {
  if (points.length <= 2) return points;
  const filtered: HandwrittenPoint[] = [points[0]];
  let lastAcceptedPoint = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (distance(lastAcceptedPoint[0], lastAcceptedPoint[1], point[0], point[1]) < minDistance) continue;
    filtered.push(point);
    lastAcceptedPoint = point;
  }
  const lastPoint = points[points.length - 1];
  if (filtered[filtered.length - 1] !== lastPoint) filtered.push(lastPoint);
  return filtered;
}

function smoothStrokePositions(points: HandwrittenPoint[], smoothing: number, cornerIndexes = new Set<number>()): HandwrittenPoint[] {
  if (points.length <= 2 || smoothing <= 0) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1 || cornerIndexes.has(index)) return point;
    const previousPoint = points[index - 1];
    const nextPoint = points[index + 1];
    return [
      roundNumber(point[0] * (1 - smoothing) + ((previousPoint[0] + nextPoint[0]) / 2) * smoothing),
      roundNumber(point[1] * (1 - smoothing) + ((previousPoint[1] + nextPoint[1]) / 2) * smoothing),
      point[2],
      point[3],
      point[4],
      point[5],
    ] as HandwrittenPoint;
  });
}

function smoothStrokePressure(points: HandwrittenPoint[], smoothing: number): HandwrittenPoint[] {
  if (points.length <= 2 || smoothing <= 0) return points;
  let previousPressure = points[0][2] || 0.5;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const pressure = clampNumber(point[2] || 0.5, 0, 1);
    const smoothedPressure = previousPressure * smoothing + pressure * (1 - smoothing);
    previousPressure = smoothedPressure;
    return [point[0], point[1], roundNumber(smoothedPressure), point[3], point[4], point[5]] as HandwrittenPoint;
  });
}

function simplifyStrokePoints(points: HandwrittenPoint[], tolerance: number, cornerIndexes = new Set<number>()): HandwrittenPoint[] {
  if (points.length <= 4 || tolerance <= 0) return points;
  const totalDistance = getPolylineDistance(points);
  const bounds = getStrokeBounds(points, 1);
  if (totalDistance < tolerance * 8 || Math.max(bounds.width, bounds.height) < tolerance * 4) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  cornerIndexes.forEach((index) => {
    if (index > 0 && index < points.length - 1) keep[index] = true;
  });
  simplifyStrokeRange(points, 0, points.length - 1, tolerance, keep);
  const simplified = points.filter((_point, index) => keep[index]);
  return simplified.length >= 2 ? simplified : [points[0], points[points.length - 1]];
}

function getCornerPointIndexes(points: HandwrittenPoint[], tolerance: number) {
  const corners = new Set<number>();
  if (points.length < 3) return corners;
  const minLegLength = Math.max(4, tolerance * 3);
  for (let index = 1; index < points.length - 1; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];
    const nextPoint = points[index + 1];
    const incomingLength = distance(previousPoint[0], previousPoint[1], point[0], point[1]);
    const outgoingLength = distance(point[0], point[1], nextPoint[0], nextPoint[1]);
    if (incomingLength < minLegLength || outgoingLength < minLegLength) continue;
    const angle = getTurnAngle(previousPoint, point, nextPoint);
    if (angle >= Math.PI * 0.38) corners.add(index);
  }
  return corners;
}

function getTurnAngle(previousPoint: HandwrittenPoint, point: HandwrittenPoint, nextPoint: HandwrittenPoint) {
  const incomingX = point[0] - previousPoint[0];
  const incomingY = point[1] - previousPoint[1];
  const outgoingX = nextPoint[0] - point[0];
  const outgoingY = nextPoint[1] - point[1];
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength === 0 || outgoingLength === 0) return 0;
  const dot = (incomingX * outgoingX + incomingY * outgoingY) / (incomingLength * outgoingLength);
  return Math.acos(clampNumber(dot, -1, 1));
}

function simplifyStrokeRange(points: HandwrittenPoint[], startIndex: number, endIndex: number, tolerance: number, keep: boolean[]) {
  if (endIndex <= startIndex + 1) return;
  let maxDistance = 0;
  let maxIndex = -1;
  const start = points[startIndex];
  const end = points[endIndex];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const point = points[index];
    const pointDistance = distanceToSegment(point[0], point[1], start[0], start[1], end[0], end[1]);
    if (pointDistance > maxDistance) {
      maxDistance = pointDistance;
      maxIndex = index;
    }
  }
  if (maxDistance <= tolerance || maxIndex < 0) return;
  keep[maxIndex] = true;
  simplifyStrokeRange(points, startIndex, maxIndex, tolerance, keep);
  simplifyStrokeRange(points, maxIndex, endIndex, tolerance, keep);
}

function getPolylineDistance(points: HandwrittenPoint[]) {
  let totalDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalDistance += distance(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1]);
  }
  return totalDistance;
}

export function addPage(content: HandwrittenNoteContent, background = content.defaultPage.background) {
  const page = createHandwrittenPage(createId("page"), background, content.defaultPage.preset, content.defaultPage.orientation);
  return touchHandwrittenContent({ ...content, pages: [...content.pages, page] });
}

export function reorderPage(content: HandwrittenNoteContent, sourcePageId: string, targetPageId: string) {
  if (sourcePageId === targetPageId) return content;
  const sourceIndex = content.pages.findIndex((page) => page.id === sourcePageId);
  const targetIndex = content.pages.findIndex((page) => page.id === targetPageId);
  if (sourceIndex < 0 || targetIndex < 0) return content;
  const pages = [...content.pages];
  const [sourcePage] = pages.splice(sourceIndex, 1);
  if (!sourcePage) return content;
  pages.splice(targetIndex, 0, sourcePage);
  return touchHandwrittenContent({ ...content, pages });
}

export function removeStrokeIds(page: HandwrittenNotePage, strokeIds: Set<string>) {
  if (strokeIds.size === 0) return page;
  return { ...page, strokes: page.strokes.filter((stroke) => !strokeIds.has(stroke.id)) };
}

export function erasePartialStrokes(page: HandwrittenNotePage, eraserPoints: HandwrittenPoint[], width: number) {
  const normalizedEraserPoints = normalizeStrokePoints(eraserPoints);
  const eraserWidth = normalizeEraserWidth(width);
  if (normalizedEraserPoints.length === 0 || page.strokes.length === 0) return page;
  const eraserBounds = getStrokeBounds(normalizedEraserPoints, eraserWidth * 2);
  let changed = false;
  const strokes = page.strokes.flatMap((stroke) => {
    const strokeBounds = stroke.bounds ?? getStrokeBounds(stroke.points, stroke.width);
    if (!rectsIntersect(expandBounds(strokeBounds, eraserWidth), eraserBounds)) return [stroke];
    const fragments = erasePartialStroke(stroke, normalizedEraserPoints, eraserWidth);
    if (fragments.length === 1 && fragments[0] === stroke) return [stroke];
    changed = true;
    return fragments;
  });
  return changed ? { ...page, strokes } : page;
}

export function moveStrokeIds(page: HandwrittenNotePage, strokeIds: Set<string>, dx: number, dy: number) {
  if (strokeIds.size === 0 || (dx === 0 && dy === 0)) return page;
  return {
    ...page,
    strokes: page.strokes.map((stroke) => {
      if (!strokeIds.has(stroke.id)) return stroke;
      const movedPoints = stroke.points.map((point) => [
        roundNumber(point[0] + dx),
        roundNumber(point[1] + dy),
        point[2],
        point[3],
        point[4],
        point[5],
      ] as HandwrittenPoint);
      const preset: HandwrittenToolPreset = {
        id: stroke.tool,
        type: resolvePencilType(stroke.tool) ?? "pen",
        label: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        opacity: stroke.opacity,
        pressure: stroke.pressure,
        pressureSensitivity: stroke.pressureSensitivity ?? 0.55,
        smoothing: 0.5,
      };
      return {
        ...stroke,
        ...getStrokeTextureFields(stroke),
        points: movedPoints,
        bounds: getStrokeBounds(movedPoints, stroke.width),
        path: buildStrokeOutlinePath(movedPoints, preset),
      };
    }),
  };
}

export function transformStrokeIds(
  page: HandwrittenNotePage,
  sourceStrokes: HandwrittenStroke[],
  transform: {
    origin: { x: number; y: number };
    translateX?: number;
    translateY?: number;
    scaleX?: number;
    scaleY?: number;
    rotationRadians?: number;
  },
) {
  if (sourceStrokes.length === 0) return page;
  const sourceById = new Map(sourceStrokes.map((stroke) => [stroke.id, stroke]));
  const translateX = transform.translateX ?? 0;
  const translateY = transform.translateY ?? 0;
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  const rotation = transform.rotationRadians ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const widthScale = Math.max(0.2, Math.sqrt(Math.abs(scaleX * scaleY)));

  return {
    ...page,
    strokes: page.strokes.map((stroke) => {
      const sourceStroke = sourceById.get(stroke.id);
      if (!sourceStroke) return stroke;
      const points = sourceStroke.points.map((point) => {
        const scaledX = (point[0] - transform.origin.x) * scaleX;
        const scaledY = (point[1] - transform.origin.y) * scaleY;
        return [
          roundNumber(transform.origin.x + scaledX * cos - scaledY * sin + translateX),
          roundNumber(transform.origin.y + scaledX * sin + scaledY * cos + translateY),
          point[2],
          point[3],
          point[4],
          point[5],
        ] as HandwrittenPoint;
      });
      const width = roundNumber(sourceStroke.width * widthScale);
      const preset: HandwrittenToolPreset = {
        id: sourceStroke.tool,
        type: resolvePencilType(sourceStroke.tool) ?? "pen",
        label: sourceStroke.tool,
        color: sourceStroke.color,
        width,
        opacity: sourceStroke.opacity,
        pressure: sourceStroke.pressure,
        pressureSensitivity: sourceStroke.pressureSensitivity ?? 0.55,
        smoothing: 0.5,
      };
      return {
        ...sourceStroke,
        ...getStrokeTextureFields(sourceStroke),
        width,
        points,
        bounds: getStrokeBounds(points, width),
        path: buildStrokeOutlinePath(points, preset),
      };
    }),
  };
}

function normalizeToolPreset(
  rawPreset: Partial<HandwrittenToolPreset> | null | undefined,
  seenIds: Set<string> = new Set(),
  index = 0,
): HandwrittenToolPreset | null {
  if (!rawPreset || typeof rawPreset !== "object") return null;
  const type = resolvePencilType(rawPreset.type ?? rawPreset.id);
  if (!type) return null;
  const typeDefinition = getPencilTypeDefinition(type);
  const rawId = typeof rawPreset.id === "string" && rawPreset.id.trim() ? rawPreset.id.trim() : `pencil-${index + 1}`;
  const id = getUniquePresetId(rawId, seenIds);
  return {
    id,
    type,
    label: typeof rawPreset.label === "string" && rawPreset.label.trim() ? rawPreset.label.trim() : typeDefinition.label,
    color: isHexColor(rawPreset.color) ? rawPreset.color : typeDefinition.defaults.color,
    width: clampNumber(numberOrFallback(rawPreset.width, typeDefinition.defaults.width), 1, 38),
    opacity: clampNumber(numberOrFallback(rawPreset.opacity, typeDefinition.defaults.opacity), 0.1, 1),
    pressure: typeof rawPreset.pressure === "boolean" ? rawPreset.pressure : typeDefinition.defaults.pressure,
    pressureSensitivity: clampNumber(numberOrFallback(rawPreset.pressureSensitivity, typeDefinition.defaults.pressureSensitivity), 0, 1),
    smoothing: clampNumber(numberOrFallback(rawPreset.smoothing, typeDefinition.defaults.smoothing), 0, 1),
  };
}

function resolvePencilType(value: string | undefined): HandwrittenPencilType | null {
  return PENCIL_TYPES.some((type) => type.id === value) ? value as HandwrittenPencilType : null;
}

function getPencilTypeDefinition(type: HandwrittenPencilType) {
  return PENCIL_TYPES.find((candidate) => candidate.id === type) ?? PENCIL_TYPES[0];
}

function getUniquePresetId(baseId: string, seenIds: Set<string>) {
  if (!seenIds.has(baseId)) return baseId;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseId}-${index}`;
    if (!seenIds.has(candidate)) return candidate;
  }
  return createId("pencil");
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function numberOrFallback(value: unknown, fallback: number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function applyPressureSensitivity(pressure: number, sensitivity: number) {
  const clampedPressure = clampNumber(pressure, 0, 1);
  const clampedSensitivity = clampNumber(sensitivity, 0, 1);
  return clampNumber(0.5 + (clampedPressure - 0.5) * (0.35 + clampedSensitivity * 1.9), 0.05, 1);
}

export function getPageSize(preset: HandwrittenPageSizePreset, orientation: HandwrittenPageOrientation) {
  const normalizedPreset = normalizePageSizePreset(preset);
  const portraitSize = getPortraitPageSize(normalizedPreset);
  const width = orientation === "landscape" ? portraitSize.height : portraitSize.width;
  const height = orientation === "landscape" ? portraitSize.width : portraitSize.height;
  return { width, height, unit: "px" as const, preset: normalizedPreset };
}

export function getPageOrientation(page: HandwrittenNotePage): HandwrittenPageOrientation {
  return page.size.width > page.size.height ? "landscape" : "portrait";
}

function normalizePageSizePreset(preset: HandwrittenPageSizePreset): Exclude<HandwrittenPageSizePreset, "Letter" | "free"> {
  if (preset === "4:3" || preset === "16:9" || preset === "1:1") return preset;
  return "A4";
}

function getPortraitPageSize(preset: Exclude<HandwrittenPageSizePreset, "Letter" | "free">) {
  if (preset === "4:3") return { width: Math.round(RATIO_PAGE_LONG_SIDE * 3 / 4), height: RATIO_PAGE_LONG_SIDE };
  if (preset === "16:9") return { width: Math.round(RATIO_PAGE_LONG_SIDE * 9 / 16), height: RATIO_PAGE_LONG_SIDE };
  if (preset === "1:1") return { width: SQUARE_PAGE_SIZE, height: SQUARE_PAGE_SIZE };
  return A4_PORTRAIT;
}

function resizeHandwrittenPage(page: HandwrittenNotePage, targetSize: ReturnType<typeof getPageSize>): HandwrittenNotePage {
  const sourceWidth = page.size.width || targetSize.width;
  const sourceHeight = page.size.height || targetSize.height;
  if (sourceWidth === targetSize.width && sourceHeight === targetSize.height && page.size.preset === targetSize.preset) {
    return { ...page, size: targetSize };
  }
  const sourceCenter = { x: sourceWidth / 2, y: sourceHeight / 2 };
  const targetCenter = { x: targetSize.width / 2, y: targetSize.height / 2 };
  const contentBounds = getCombinedBounds(page.strokes);
  const margin = 24;
  const maxContentWidth = Math.max(1, targetSize.width - margin * 2);
  const maxContentHeight = Math.max(1, targetSize.height - margin * 2);
  const scale = contentBounds
    ? Math.min(
      1,
      contentBounds.width > 0 ? maxContentWidth / contentBounds.width : 1,
      contentBounds.height > 0 ? maxContentHeight / contentBounds.height : 1,
    )
    : 1;
  const transformedBounds = contentBounds
    ? {
      x: targetCenter.x + (contentBounds.x - sourceCenter.x) * scale,
      y: targetCenter.y + (contentBounds.y - sourceCenter.y) * scale,
      width: contentBounds.width * scale,
      height: contentBounds.height * scale,
    }
    : null;
  const fitOffsetX = transformedBounds
    ? getFitOffset(transformedBounds.x, transformedBounds.width, targetSize.width, margin)
    : 0;
  const fitOffsetY = transformedBounds
    ? getFitOffset(transformedBounds.y, transformedBounds.height, targetSize.height, margin)
    : 0;
  return {
    ...page,
    size: targetSize,
    strokes: page.strokes.map((stroke) => {
      const points = stroke.points.map((point) => [
        roundNumber(targetCenter.x + (point[0] - sourceCenter.x) * scale + fitOffsetX),
        roundNumber(targetCenter.y + (point[1] - sourceCenter.y) * scale + fitOffsetY),
        point[2],
        point[3],
        point[4],
        point[5],
      ] as HandwrittenPoint);
      const width = roundNumber(stroke.width * scale);
      const preset: HandwrittenToolPreset = {
        id: stroke.tool,
        type: resolvePencilType(stroke.tool) ?? "pen",
        label: stroke.tool,
        color: stroke.color,
        width,
        opacity: stroke.opacity,
        pressure: stroke.pressure,
        pressureSensitivity: stroke.pressureSensitivity ?? 0.55,
        smoothing: 0.5,
      };
      return {
        ...stroke,
        width,
        points,
        bounds: getStrokeBounds(points, width),
        path: buildStrokeOutlinePath(points, preset),
      };
    }),
  };
}

function getFitOffset(start: number, size: number, targetSize: number, margin: number) {
  const end = start + size;
  if (size >= targetSize - margin * 2) return margin - start;
  if (start < margin) return margin - start;
  if (end > targetSize - margin) return targetSize - margin - end;
  return 0;
}

function erasePartialStroke(stroke: HandwrittenStroke, eraserPoints: HandwrittenPoint[], eraserWidth: number): HandwrittenStroke[] {
  if (stroke.points.length === 0) return [stroke];
  const threshold = eraserWidth + stroke.width / 2;
  if (stroke.points.length === 1) {
    return pointIntersectsEraserPath(stroke.points[0], eraserPoints, threshold) ? [] : [stroke];
  }

  const sampledPoints = resampleStrokePoints(stroke.points, Math.max(2, Math.min(8, threshold / 3)));
  let touched = false;
  const fragments: HandwrittenPoint[][] = [];
  let currentFragment: HandwrittenPoint[] = [];

  for (const point of sampledPoints) {
    const erased = pointIntersectsEraserPath(point, eraserPoints, threshold);
    if (erased) {
      touched = true;
      if (currentFragment.length > 0) {
        fragments.push(currentFragment);
        currentFragment = [];
      }
    } else {
      currentFragment.push(point);
    }
  }

  if (!touched) return [stroke];
  if (currentFragment.length > 0) fragments.push(currentFragment);

  const visibleFragments = fragments.filter((fragment) => isVisibleStrokeFragment(fragment, stroke.width));
  return visibleFragments.map((points, index) => createStrokeFragment(stroke, points, index));
}

function resampleStrokePoints(points: HandwrittenPoint[], step: number): HandwrittenPoint[] {
  if (points.length <= 1) return points;
  const sampled: HandwrittenPoint[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const segmentLength = distance(from[0], from[1], to[0], to[1]);
    const sampleCount = Math.max(1, Math.ceil(segmentLength / step));
    for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
      sampled.push(interpolatePoint(from, to, sampleIndex / sampleCount));
    }
  }
  return sampled.map((point) => [
    roundNumber(point[0]),
    roundNumber(point[1]),
    clampNumber(point[2] || 0.5, 0, 1),
    roundNumber(point[3]),
    point[4],
    point[5],
  ] as HandwrittenPoint);
}

function interpolatePoint(from: HandwrittenPoint, to: HandwrittenPoint, ratio: number): HandwrittenPoint {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
    (from[2] || 0.5) + ((to[2] || 0.5) - (from[2] || 0.5)) * ratio,
    from[3] + (to[3] - from[3]) * ratio,
    interpolateOptionalNumber(from[4], to[4], ratio),
    interpolateOptionalNumber(from[5], to[5], ratio),
  ];
}

function interpolateOptionalNumber(from: number | undefined, to: number | undefined, ratio: number) {
  if (from === undefined && to === undefined) return undefined;
  const start = from ?? to ?? 0;
  const end = to ?? from ?? 0;
  return start + (end - start) * ratio;
}

function pointIntersectsEraserPath(point: HandwrittenPoint, eraserPoints: HandwrittenPoint[], threshold: number) {
  if (eraserPoints.length === 1) return distance(point[0], point[1], eraserPoints[0][0], eraserPoints[0][1]) <= threshold;
  for (let index = 1; index < eraserPoints.length; index += 1) {
    const previousPoint = eraserPoints[index - 1];
    const currentPoint = eraserPoints[index];
    if (distanceToSegment(point[0], point[1], previousPoint[0], previousPoint[1], currentPoint[0], currentPoint[1]) <= threshold) return true;
  }
  return false;
}

function isVisibleStrokeFragment(points: HandwrittenPoint[], strokeWidth: number) {
  if (points.length >= 2) return getPolylineDistance(points) >= Math.max(2, strokeWidth * 0.45);
  return false;
}

function createStrokeFragment(stroke: HandwrittenStroke, points: HandwrittenPoint[], index: number): HandwrittenStroke {
  const preset: HandwrittenToolPreset = {
    id: stroke.tool,
    type: resolvePencilType(stroke.tool) ?? "pen",
    label: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    opacity: stroke.opacity,
    pressure: stroke.pressure,
    pressureSensitivity: stroke.pressureSensitivity ?? 0.55,
    smoothing: 0.5,
  };
  return {
    ...stroke,
    id: createId(`${stroke.id}-fragment-${index + 1}`),
    ...getStrokeTextureFields(stroke, index),
    points,
    bounds: getStrokeBounds(points, stroke.width),
    path: buildStrokeOutlinePath(points, preset),
  };
}

function expandBounds(bounds: { x: number; y: number; width: number; height: number }, amount: number) {
  return {
    x: bounds.x - amount,
    y: bounds.y - amount,
    width: bounds.width + amount * 2,
    height: bounds.height + amount * 2,
  };
}

export function findIntersectingStrokeIds(page: HandwrittenNotePage, point: { x: number; y: number }, radius: number) {
  const hitIds = new Set<string>();
  const threshold = Math.max(4, radius);
  for (const stroke of page.strokes) {
    if (stroke.bounds && !circleIntersectsRect(point.x, point.y, threshold, stroke.bounds)) continue;
    if (strokeIntersectsCircle(stroke, point, threshold + stroke.width / 2)) {
      hitIds.add(stroke.id);
    }
  }
  return hitIds;
}

export function findLassoStrokeIds(page: HandwrittenNotePage, polygon: HandwrittenPoint[]) {
  if (polygon.length < 3) return new Set<string>();
  const ids = new Set<string>();
  const polygonBounds = getStrokeBounds(polygon, 1);
  for (const stroke of page.strokes) {
    const bounds = stroke.bounds ?? getStrokeBounds(stroke.points, stroke.width);
    if (!rectsIntersect(bounds, polygonBounds)) continue;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    if (pointInPolygon(center.x, center.y, polygon) || strokeIntersectsPolygon(stroke, polygon)) ids.add(stroke.id);
  }
  return ids;
}

export function getCombinedBounds(strokes: HandwrittenStroke[]) {
  const bounds = strokes.map((stroke) => stroke.bounds ?? getStrokeBounds(stroke.points, stroke.width)).filter((bound) => bound.width > 0 || bound.height > 0);
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function drawPageBackground(ctx: CanvasRenderingContext2D, page: HandwrittenNotePage) {
  const { width, height } = page.size;
  const spacing = Math.max(12, page.background.spacing ?? 32);
  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1;
  if (page.background.type === "ruled" || page.background.type === "cornell") {
    for (let y = spacing * 2; y < height; y += spacing) {
      drawCanvasLine(ctx, 0, y, width, y);
    }
  }
  if (page.background.type === "grid") {
    for (let x = spacing; x < width; x += spacing) drawCanvasLine(ctx, x, 0, x, height);
    for (let y = spacing; y < height; y += spacing) drawCanvasLine(ctx, 0, y, width, y);
  }
  if (page.background.type === "dots") {
    ctx.fillStyle = "#D1D5DB";
    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (page.background.type === "cornell") {
    ctx.strokeStyle = "#FED7AA";
    ctx.lineWidth = 2;
    drawCanvasLine(ctx, width * 0.32, 0, width * 0.32, height);
    drawCanvasLine(ctx, 0, height * 0.82, width, height * 0.82);
  }
  ctx.restore();
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: HandwrittenStroke, selected = false) {
  if (stroke.points.length === 0) return;
  if (!selected && stroke.tool === "pencil" && drawPencilStroke(ctx, stroke)) return;
  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = selected ? "#F37021" : stroke.color;
  ctx.fillStyle = selected ? "#F37021" : stroke.color;
  ctx.lineWidth = stroke.width;
  const cachedPath = getCachedStrokePath(stroke);
  if (cachedPath) {
    ctx.fill(cachedPath);
    ctx.restore();
    return;
  }
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    ctx.beginPath();
    ctx.arc(point[0], point[1], Math.max(1, stroke.width / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (const point of stroke.points.slice(1)) {
    const pressureWidth = stroke.pressure ? stroke.width * Math.max(0.24, applyPressureSensitivity(point[2] || 0.5, stroke.pressureSensitivity ?? 0.55)) : stroke.width;
    ctx.lineWidth = pressureWidth;
    ctx.lineTo(point[0], point[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point[0], point[1]);
  }
  ctx.restore();
}

function drawPencilStroke(ctx: CanvasRenderingContext2D, stroke: HandwrittenStroke) {
  const texture = getCachedPencilTexture(stroke);
  if (!texture) return false;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(
    texture.canvas as CanvasImageSource,
    texture.x,
    texture.y,
    texture.width,
    texture.height,
  );
  ctx.restore();
  return true;
}

export function drawLasso(ctx: CanvasRenderingContext2D, points: HandwrittenPoint[]) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "#F37021";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.stroke();
  ctx.restore();
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function drawCanvasLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function getCachedStrokePath(stroke: HandwrittenStroke) {
  if (typeof Path2D === "undefined") return null;
  const pathData = stroke.path || buildRenderedStrokePath(stroke);
  if (!pathData) return null;
  const cacheKey = stroke.path ? `${stroke.id}:stored:${stroke.path}` : getComputedStrokePathCacheKey(stroke, pathData);
  const cachedPath = strokePathCache.get(cacheKey);
  if (cachedPath) return cachedPath;
  try {
    const path = new Path2D(pathData);
    strokePathCache.set(cacheKey, path);
    if (strokePathCache.size > STROKE_PATH_CACHE_LIMIT) {
      const oldestKey = strokePathCache.keys().next().value;
      if (oldestKey) strokePathCache.delete(oldestKey);
    }
    return path;
  } catch {
    return null;
  }
}

function buildRenderedStrokePath(stroke: HandwrittenStroke) {
  if (stroke.points.length < 2) return "";
  return buildStrokeOutlinePath(stroke.points, {
    width: stroke.width,
    pressure: stroke.pressure,
    pressureSensitivity: stroke.pressureSensitivity ?? 0.55,
    smoothing: smoothingForStroke(stroke),
  });
}

function getComputedStrokePathCacheKey(stroke: HandwrittenStroke, pathData: string) {
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  return [
    stroke.id,
    "computed",
    stroke.points.length,
    roundNumber(first?.[0] ?? 0),
    roundNumber(first?.[1] ?? 0),
    roundNumber(last?.[0] ?? 0),
    roundNumber(last?.[1] ?? 0),
    roundNumber(stroke.width),
    stroke.pressure ? 1 : 0,
    roundNumber(stroke.pressureSensitivity ?? 0.55),
    pathData.length,
    hashString(pathData).toString(36),
  ].join(":");
}

function smoothingForStroke(stroke: HandwrittenStroke) {
  if (stroke.id.startsWith("ai-")) {
    if (stroke.tool === "pencil") return 0.74;
    if (stroke.tool === "marker") return 0.58;
    if (stroke.tool === "highlighter") return 0.42;
    return 0.68;
  }
  if (stroke.tool === "pencil") return 0.48;
  if (stroke.tool === "marker") return 0.56;
  if (stroke.tool === "highlighter") return 0.42;
  if (stroke.tool === "fountain") return 0.82;
  return 0.62;
}

function getCachedPencilTexture(stroke: HandwrittenStroke): PencilTextureCacheEntry | null {
  const path = getCachedStrokePath(stroke);
  if (!path || stroke.points.length === 0) return null;
  const bounds = stroke.bounds ?? getStrokeBounds(stroke.points, stroke.width);
  const padding = Math.max(PENCIL_TEXTURE_PADDING, stroke.width * 2);
  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  if (width <= 0 || height <= 0 || width * height > PENCIL_TEXTURE_MAX_AREA) return null;
  const cacheKey = getPencilTextureCacheKey(stroke);
  const cachedTexture = pencilTextureCache.get(cacheKey);
  if (cachedTexture) return cachedTexture;

  const canvas = createTextureCanvas(Math.ceil(width * PENCIL_TEXTURE_SCALE), Math.ceil(height * PENCIL_TEXTURE_SCALE));
  const textureCtx = canvas.getContext("2d");
  if (!textureCtx) return null;
  textureCtx.setTransform(PENCIL_TEXTURE_SCALE, 0, 0, PENCIL_TEXTURE_SCALE, 0, 0);
  textureCtx.translate(-(bounds.x - padding), -(bounds.y - padding));
  const color = parseHexColor(stroke.color);
  textureCtx.save();
  textureCtx.clip(path);
  drawPencilTextureBody(textureCtx, stroke, color);
  drawPencilTextureFibers(textureCtx, stroke, color);
  textureCtx.restore();

  const entry = {
    canvas,
    x: bounds.x - padding,
    y: bounds.y - padding,
    width,
    height,
    pixelCount: canvas.width * canvas.height,
  };
  pencilTextureCache.set(cacheKey, entry);
  trimPencilTextureCache();
  return entry;
}

export function getPencilTextureCacheKey(stroke: HandwrittenStroke) {
  return [
    "pencil-texture",
    PENCIL_TEXTURE_VERSION,
    getPencilTextureSeed(stroke),
    getPencilTexturePathFingerprint(stroke),
    stroke.color,
    roundNumber(stroke.width),
    roundNumber(stroke.opacity),
    stroke.pressure ? 1 : 0,
    roundNumber(stroke.pressureSensitivity ?? 0.55),
  ].join(":");
}

function getPencilTexturePathFingerprint(stroke: HandwrittenStroke) {
  const pathData = stroke.path || buildRenderedStrokePath(stroke);
  if (!pathData) return "empty";
  return `${stroke.path ? "stored" : "computed"}:${pathData.length}:${hashString(pathData).toString(36)}`;
}

function drawPencilTextureBody(ctx: PencilTextureContext, stroke: HandwrittenStroke, color: [number, number, number]) {
  const path = getCachedStrokePath(stroke);
  if (!path) return;
  ctx.fillStyle = rgbaString(color, Math.min(0.42, stroke.opacity * 0.42));
  ctx.fill(path);
}

function drawPencilTextureFibers(ctx: PencilTextureContext, stroke: HandwrittenStroke, color: [number, number, number]) {
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    ctx.fillStyle = rgbaString(color, Math.min(0.42, stroke.opacity * 0.42));
    ctx.beginPath();
    ctx.arc(point[0], point[1], Math.max(1, stroke.width / 2), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const random = createSeededRandom(hashString(getPencilTextureSeed(stroke)));
  const length = getPolylineDistance(stroke.points);
  const densityScale = length > 1600 ? 0.55 : length > 900 ? 0.72 : 1;
  const step = Math.max(2.6, Math.min(8, stroke.width * 1.25)) / densityScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let pointIndex = 1; pointIndex < stroke.points.length; pointIndex += 1) {
    const from = stroke.points[pointIndex - 1];
    const to = stroke.points[pointIndex];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 0.5) continue;
    const nx = -dy / segmentLength;
    const ny = dx / segmentLength;
    const samples = Math.max(1, Math.floor(segmentLength / step));
    for (let sampleIndex = 0; sampleIndex < samples; sampleIndex += 1) {
      const ratio = (sampleIndex + random() * 0.85) / samples;
      const pressure = stroke.pressure
        ? applyPressureSensitivity(from[2] + (to[2] - from[2]) * ratio, stroke.pressureSensitivity ?? 0.55)
        : 0.5;
      const radius = Math.max(0.8, stroke.width * (0.28 + pressure * 0.34));
      const centerX = from[0] + dx * ratio + (random() - 0.5) * stroke.width * 0.32;
      const centerY = from[1] + dy * ratio + (random() - 0.5) * stroke.width * 0.32;
      const fiberCount = Math.max(1, Math.min(3, Math.round(1 + pressure * 2)));
      for (let fiberIndex = 0; fiberIndex < fiberCount; fiberIndex += 1) {
        const offset = (random() - 0.5) * radius * 1.85;
        const jitter = (random() - 0.5) * radius * 0.22;
        const startX = centerX + nx * offset - (dx / segmentLength) * jitter;
        const startY = centerY + ny * offset - (dy / segmentLength) * jitter;
        const fiberLength = Math.max(1.2, Math.min(7, stroke.width * (0.55 + random() * 0.9)));
        const alpha = stroke.opacity * (0.08 + pressure * 0.18 + random() * 0.1);
        ctx.strokeStyle = rgbaString(color, Math.min(0.38, alpha));
        ctx.lineWidth = Math.max(0.35, Math.min(1.5, stroke.width * (0.08 + random() * 0.08)));
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + (dx / segmentLength) * fiberLength + nx * jitter, startY + (dy / segmentLength) * fiberLength + ny * jitter);
        ctx.stroke();
      }
    }
  }
}

function getStrokeTextureFields(stroke: HandwrittenStroke, fragmentIndex?: number): Pick<HandwrittenStroke, "textureSeed" | "textureVersion"> {
  if (stroke.tool !== "pencil") return {};
  const baseSeed = getPencilTextureSeed(stroke);
  return {
    textureSeed: fragmentIndex === undefined ? baseSeed : `${baseSeed}:fragment:${fragmentIndex + 1}`,
    textureVersion: PENCIL_TEXTURE_VERSION,
  };
}

function getPencilTextureSeed(stroke: HandwrittenStroke) {
  return stroke.textureSeed || stablePencilTextureSeed(stroke);
}

function stablePencilTextureSeed(stroke: HandwrittenStroke) {
  const firstPoint = stroke.points[0];
  return [
    stroke.id,
    stroke.path ?? "",
    stroke.color,
    roundNumber(stroke.width),
    firstPoint ? `${roundNumber(firstPoint[0])},${roundNumber(firstPoint[1])}` : "empty",
  ].join(":");
}

function createTextureCanvas(width: number, height: number): PencilTextureCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function trimPencilTextureCache() {
  let pixelCount = 0;
  for (const entry of pencilTextureCache.values()) pixelCount += entry.pixelCount;
  while (pencilTextureCache.size > PENCIL_TEXTURE_CACHE_LIMIT || pixelCount > PENCIL_TEXTURE_CACHE_MAX_PIXELS) {
    const oldestKey = pencilTextureCache.keys().next().value;
    if (!oldestKey) break;
    const entry = pencilTextureCache.get(oldestKey);
    if (entry) pixelCount -= entry.pixelCount;
    pencilTextureCache.delete(oldestKey);
  }
}

function parseHexColor(value: string): [number, number, number] {
  const normalized = isHexColor(value) ? value.slice(1) : "111827";
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbaString(color: [number, number, number], alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${clampNumber(alpha, 0, 1)})`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function strokeIntersectsCircle(stroke: HandwrittenStroke, point: { x: number; y: number }, radius: number) {
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    const strokePoint = stroke.points[0];
    return distance(point.x, point.y, strokePoint[0], strokePoint[1]) <= radius;
  }
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previousPoint = stroke.points[index - 1];
    const currentPoint = stroke.points[index];
    if (distanceToSegment(point.x, point.y, previousPoint[0], previousPoint[1], currentPoint[0], currentPoint[1]) <= radius) return true;
  }
  return false;
}

function strokeIntersectsPolygon(stroke: HandwrittenStroke, polygon: HandwrittenPoint[]) {
  if (stroke.points.some((point) => pointInPolygon(point[0], point[1], polygon))) return true;
  if (stroke.points.length < 2) return false;
  for (let strokeIndex = 1; strokeIndex < stroke.points.length; strokeIndex += 1) {
    const strokeStart = stroke.points[strokeIndex - 1];
    const strokeEnd = stroke.points[strokeIndex];
    for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
      const polygonStart = polygon[polygonIndex];
      const polygonEnd = polygon[(polygonIndex + 1) % polygon.length];
      if (segmentsIntersect(
        strokeStart[0],
        strokeStart[1],
        strokeEnd[0],
        strokeEnd[1],
        polygonStart[0],
        polygonStart[1],
        polygonEnd[0],
        polygonEnd[1],
      )) {
        return true;
      }
    }
  }
  return false;
}

function circleIntersectsRect(x: number, y: number, radius: number, rect: { x: number; y: number; width: number; height: number }) {
  const nearestX = clampNumber(x, rect.x, rect.x + rect.width);
  const nearestY = clampNumber(y, rect.y, rect.y + rect.height);
  return distance(x, y, nearestX, nearestY) <= radius;
}

function rectsIntersect(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y;
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return distance(px, py, x1, y1);
  const t = clampNumber(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return distance(px, py, x1 + t * dx, y1 + t * dy);
}

function segmentsIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  const direction1 = segmentDirection(x3, y3, x4, y4, x1, y1);
  const direction2 = segmentDirection(x3, y3, x4, y4, x2, y2);
  const direction3 = segmentDirection(x1, y1, x2, y2, x3, y3);
  const direction4 = segmentDirection(x1, y1, x2, y2, x4, y4);
  if (((direction1 > 0 && direction2 < 0) || (direction1 < 0 && direction2 > 0))
    && ((direction3 > 0 && direction4 < 0) || (direction3 < 0 && direction4 > 0))) {
    return true;
  }
  return direction1 === 0 && pointOnSegment(x1, y1, x3, y3, x4, y4)
    || direction2 === 0 && pointOnSegment(x2, y2, x3, y3, x4, y4)
    || direction3 === 0 && pointOnSegment(x3, y3, x1, y1, x2, y2)
    || direction4 === 0 && pointOnSegment(x4, y4, x1, y1, x2, y2);
}

function segmentDirection(x1: number, y1: number, x2: number, y2: number, px: number, py: number) {
  const value = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  return Math.abs(value) < 0.000001 ? 0 : value;
}

function pointOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  return px >= Math.min(x1, x2) - 0.000001
    && px <= Math.max(x1, x2) + 0.000001
    && py >= Math.min(y1, y2) - 0.000001
    && py <= Math.max(y1, y2) + 0.000001;
}

function pointInPolygon(x: number, y: number, polygon: HandwrittenPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}
