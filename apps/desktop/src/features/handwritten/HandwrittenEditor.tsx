import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  Eraser,
  FilePlus2,
  Grid3X3,
  Highlighter,
  Lasso,
  Paintbrush,
  PanelLeft,
  PanelTop,
  Pencil,
  PenLine,
  Plus,
  Redo2,
  Settings2,
  Trash2,
  Undo2,
  Maximize2,
  X,
  ZoomIn,
} from "lucide-react";
import type {
  HandwrittenEraserConfig,
  HandwrittenNoteContent,
  HandwrittenNotePage,
  HandwrittenPageBackground,
  HandwrittenPageOrientation,
  HandwrittenPageSizePreset,
  HandwrittenPencilType,
  HandwrittenPoint,
  HandwrittenStroke,
  HandwrittenToolPreset,
} from "../../types/domain";
import {
  addPencilPresetToList,
  addPage,
  buildStrokeOutlinePath,
  cloneHandwrittenValue,
  createStrokeFromPoints,
  drawLasso,
  drawPageBackground,
  drawStroke,
  erasePartialStrokes,
  findIntersectingStrokeIds,
  findLassoStrokeIds,
  getCombinedBounds,
  getPageOrientation,
  getPencilTypeLabel,
  MAX_PENCIL_PRESETS,
  MAX_ERASER_WIDTH,
  MIN_ERASER_WIDTH,
  MIN_PENCIL_PRESETS,
  normalizeEraserConfig,
  normalizeToolPresets,
  PAGE_BACKGROUNDS,
  PAGE_ORIENTATIONS,
  PAGE_SIZE_PRESETS,
  PENCIL_TYPES,
  removePencilPresetFromList,
  removeStrokeIds,
  reorderPage,
  transformStrokeIds,
  updateHandwrittenPage,
  updateHandwrittenPageLayout,
  updateToolPresetList,
} from "./handwrittenModel";

type HandwrittenEditorProps = {
  noteId: string;
  name: string;
  content: HandwrittenNoteContent | null;
  toolPresets: HandwrittenToolPreset[];
  eraserConfig: HandwrittenEraserConfig;
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onChange: (content: HandwrittenNoteContent) => void;
  onToolPresetsChange: (toolPresets: HandwrittenToolPreset[]) => void;
  onEraserConfigChange: (eraserConfig: HandwrittenEraserConfig) => void;
};

type PageViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PendingMiniMapNavigation = {
  pageId: string;
  ratioX: number;
  ratioY: number;
};

type ActivePointer = {
  pointerId: number;
  pageId: string;
  kind: "draw" | "erase" | "lasso" | "move-selection" | "scale-selection" | "rotate-selection";
  points: HandwrittenPoint[];
  startedAt: number;
  movedStrokeIds: Set<string>;
  lastPoint?: { x: number; y: number } | null;
  sourcePage?: HandwrittenNotePage;
  transform?: SelectionInteractionState;
};

type UtilityTool = "draw" | "eraser" | "lasso";
type ToolbarPlacement = "top" | "left";
type PopoverPreferredPlacement = "bottom" | "right";
type PopoverResolvedPlacement = PopoverPreferredPlacement | "top" | "left";
type SelectionCorner = "nw" | "ne" | "se" | "sw";
type SelectionHandleMode = "scale" | "rotate";
type SelectionBounds = { x: number; y: number; width: number; height: number };
type SelectionInteractionMode = "move" | "scale" | "rotate";
type SelectionInteractionTransform = {
  origin: { x: number; y: number };
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotationRadians: number;
};
type SelectionInteractionState = {
  mode: SelectionInteractionMode;
  sourcePage: HandwrittenNotePage;
  sourceStrokes: HandwrittenStroke[];
  sourceBounds: SelectionBounds;
  startPoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
  origin: { x: number; y: number };
  startAngle: number;
  startSelectionRotation: number;
  selectedStrokeIds: Set<string>;
  handle?: { corner: SelectionCorner; mode: SelectionHandleMode };
};

const pencilTypeIcons: Record<HandwrittenPencilType, typeof PenLine> = {
  pen: PenLine,
  fountain: Paintbrush,
  pencil: Pencil,
  marker: Paintbrush,
  highlighter: Highlighter,
};

const pencilColorSwatches = [
  { label: "Negro", value: "#111827" },
  { label: "Gris carbon", value: "#374151" },
  { label: "Azul boligrafo", value: "#1D4ED8" },
  { label: "Rojo boligrafo", value: "#DC2626" },
  { label: "Verde boligrafo", value: "#15803D" },
  { label: "Fosforito amarillo", value: "#FACC15" },
  { label: "Fosforito lima", value: "#A3E635" },
  { label: "Fosforito rosa", value: "#FB7185" },
];

const PAGE_LAYER_THUMBNAIL_MAX_WIDTH = 86;
const PAGE_LAYER_THUMBNAIL_MAX_HEIGHT = 108;
const ZOOM_THUMBNAIL_MAX_WIDTH = 180;
const ZOOM_THUMBNAIL_MAX_HEIGHT = 150;
const SHEET_SETTINGS_PREVIEW_MAX_WIDTH = 84;
const SHEET_SETTINGS_PREVIEW_MAX_HEIGHT = 112;
const THUMBNAIL_RENDER_DELAY_MS = 140;
const ZOOM_MIN = 20;
const ZOOM_MAX = 180;
const POPOVER_GAP = 10;
const POPOVER_MARGIN = 8;
const POPOVER_ARROW_SIZE = 12;

export function HandwrittenEditor({
  noteId,
  content,
  toolPresets,
  eraserConfig,
  onChange,
  onToolPresetsChange,
  onEraserConfigChange,
}: HandwrittenEditorProps) {
  const [activePencilId, setActivePencilId] = useState("pencil-1");
  const [activeUtilityTool, setActiveUtilityTool] = useState<UtilityTool>("draw");
  const [configuringPencilId, setConfiguringPencilId] = useState<string | null>(null);
  const [eraserSettingsOpen, setEraserSettingsOpen] = useState(false);
  const [pendingDeletePencilId, setPendingDeletePencilId] = useState<string | null>(null);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [pagesLayerOpen, setPagesLayerOpen] = useState(false);
  const [zoomSettingsOpen, setZoomSettingsOpen] = useState(false);
  const [toolbarPlacement, setToolbarPlacement] = useState<ToolbarPlacement>("top");
  const [activePageId, setActivePageId] = useState("");
  const [zoomPercent, setZoomPercent] = useState(72);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<Set<string>>(() => new Set());
  const [selectionFrameBounds, setSelectionFrameBounds] = useState<SelectionBounds | null>(null);
  const [selectionRotationRadians, setSelectionRotationRadians] = useState(0);
  const [pageViewports, setPageViewports] = useState<Record<string, PageViewport>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const overlayCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const thumbnailCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const editorBoundaryRef = useRef<HTMLDivElement | null>(null);
  const pencilConfigAnchorRef = useRef<HTMLElement | null>(null);
  const eraserConfigAnchorRef = useRef<HTMLElement | null>(null);
  const pagesLayerAnchorRef = useRef<HTMLElement | null>(null);
  const pageSettingsAnchorRef = useRef<HTMLElement | null>(null);
  const zoomSettingsAnchorRef = useRef<HTMLElement | null>(null);
  const pendingMiniMapNavigationRef = useRef<PendingMiniMapNavigation | null>(null);
  const livePointsRef = useRef<HandwrittenPoint[]>([]);
  const activePointerRef = useRef<ActivePointer | null>(null);
  const overlayFrameRef = useRef<number | null>(null);
  const liveRenderIndexRef = useRef(0);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const contentRef = useRef<HandwrittenNoteContent | null>(content);
  const noteIdRef = useRef(noteId);

  useEffect(() => {
    if (noteIdRef.current !== noteId) {
      noteIdRef.current = noteId;
      undoStackRef.current = [];
      redoStackRef.current = [];
      contentRef.current = content;
      if (!content) return;
      if (!activePageId || !content.pages.some((page) => page.id === activePageId)) {
        setActivePageId(content.pages[0]?.id ?? "");
      }
      return;
    }
    const previousContent = contentRef.current;
    if (previousContent && content) {
      const previousJson = JSON.stringify(previousContent);
      const nextJson = JSON.stringify(content);
      if (previousJson !== nextJson) {
        undoStackRef.current = [...undoStackRef.current.slice(-39), previousJson];
        redoStackRef.current = [];
      }
    }
    contentRef.current = content;
    if (!content) return;
    if (!activePageId || !content.pages.some((page) => page.id === activePageId)) {
      setActivePageId(content.pages[0]?.id ?? "");
    }
  }, [activePageId, content, noteId]);

  useEffect(() => {
    const pencils = normalizeToolPresets(toolPresets);
    if (!pencils.some((pencil) => pencil.id === activePencilId)) {
      setActivePencilId(pencils[0]?.id ?? "pencil-1");
    }
  }, [activePencilId, toolPresets]);

  useEffect(() => {
    const page = content?.pages.find((candidate) => candidate.id === activePageId) ?? content?.pages[0] ?? null;
    if (!page) return;
    renderPage(page);
  }, [activePageId, content, selectedStrokeIds, selectionFrameBounds, selectionRotationRadians, zoomPercent]);

  useEffect(() => {
    if (!content) return;
    const timeoutId = window.setTimeout(() => renderAllThumbnails(content), THUMBNAIL_RENDER_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [content]);

  useEffect(() => {
    if (!content) return;
    const frameId = window.requestAnimationFrame(() => renderAllThumbnails(content));
    return () => window.cancelAnimationFrame(frameId);
  }, [content?.pages.length, pagesLayerOpen, zoomSettingsOpen]);

  useEffect(() => {
    updatePageViewports();
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    scrollContainer.addEventListener("scroll", updatePageViewports, { passive: true });
    window.addEventListener("resize", updatePageViewports);
    return () => {
      scrollContainer.removeEventListener("scroll", updatePageViewports);
      window.removeEventListener("resize", updatePageViewports);
    };
  }, [activePageId, content?.pages.length, zoomPercent]);

  useEffect(() => () => {
    if (overlayFrameRef.current !== null) window.cancelAnimationFrame(overlayFrameRef.current);
  }, []);

  const activePage = useMemo(() => content?.pages.find((page) => page.id === activePageId) ?? content?.pages[0] ?? null, [activePageId, content]);
  const activePageIndex = useMemo(() => activePage && content ? content.pages.findIndex((page) => page.id === activePage.id) : -1, [activePage, content]);
  const pencilPresets = useMemo(() => normalizeToolPresets(toolPresets), [toolPresets]);
  const activeTool = pencilPresets.find((pencil) => pencil.id === activePencilId) ?? pencilPresets[0];
  const activeEraserConfig = useMemo(() => normalizeEraserConfig(eraserConfig), [eraserConfig]);
  const configuringPencil = pencilPresets.find((pencil) => pencil.id === configuringPencilId) ?? null;
  const selectedBounds = useMemo(() => {
    if (!activePage || selectedStrokeIds.size === 0) return null;
    return getCombinedBounds(activePage.strokes.filter((stroke) => selectedStrokeIds.has(stroke.id)));
  }, [activePage, selectedStrokeIds]);
  const visibleSelectionBounds = selectionFrameBounds ?? selectedBounds;

  useEffect(() => {
    if (!activePage) return;
    const pendingNavigation = pendingMiniMapNavigationRef.current;
    if (!pendingNavigation || pendingNavigation.pageId !== activePage.id) return;
    const frameId = window.requestAnimationFrame(() => {
      const latestNavigation = pendingMiniMapNavigationRef.current;
      if (!latestNavigation || latestNavigation.pageId !== activePage.id) return;
      scrollPageToRatio(activePage, latestNavigation.ratioX, latestNavigation.ratioY);
      pendingMiniMapNavigationRef.current = null;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activePage, zoomPercent]);

  if (!content) {
    return (
      <div className="grid h-full place-items-center bg-panel text-[11px] text-ink-secondary">
        Cargando nota manuscrita...
      </div>
    );
  }

  function commitChange(nextContent: HandwrittenNoteContent, options: { pushUndo?: boolean } = {}) {
    const previousContent = contentRef.current;
    if (options.pushUndo !== false && previousContent) {
      undoStackRef.current = [...undoStackRef.current.slice(-39), JSON.stringify(previousContent)];
      redoStackRef.current = [];
    }
    contentRef.current = nextContent;
    onChange(nextContent);
  }

  function handleUndo() {
    const previous = undoStackRef.current.pop();
    const current = contentRef.current;
    if (!previous || !current) return;
    redoStackRef.current.push(JSON.stringify(current));
    commitChange(JSON.parse(previous) as HandwrittenNoteContent, { pushUndo: false });
  }

  function handleRedo() {
    const next = redoStackRef.current.pop();
    const current = contentRef.current;
    if (!next || !current) return;
    undoStackRef.current.push(JSON.stringify(current));
    commitChange(JSON.parse(next) as HandwrittenNoteContent, { pushUndo: false });
  }

  function renderPage(page: HandwrittenNotePage) {
    renderBasePage(page);
    renderOverlayState(page);
  }

  function renderBasePage(page: HandwrittenNotePage) {
    const canvas = canvasRefs.current[page.id];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setCanvasPixelSize(canvas, page);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPageBackground(ctx, page);
    const activePointer = activePointerRef.current;
    const hiddenStrokeIds = getBaseHiddenStrokeIds(activePointer, page.id);
    for (const stroke of page.strokes) {
      if (hiddenStrokeIds?.has(stroke.id)) continue;
      drawStroke(ctx, stroke, selectedStrokeIds.has(stroke.id));
    }
  }

  function getBaseHiddenStrokeIds(activePointer: ActivePointer | null, pageId: string) {
    if (!activePointer || activePointer.pageId !== pageId) return null;
    if (activePointer.kind === "erase" && activeEraserConfig.mode === "stroke") return activePointer.movedStrokeIds;
    if (isSelectionPointerKind(activePointer.kind) && activePointer.transform) return activePointer.transform.selectedStrokeIds;
    return null;
  }

  function renderOverlayState(page: HandwrittenNotePage) {
    const canvas = overlayCanvasRefs.current[page.id];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setCanvasPixelSize(canvas, page);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const activePointer = activePointerRef.current;
    if (activePointer?.pageId === page.id && activePointer.kind === "lasso") {
      drawLasso(ctx, activePointer.points);
      return;
    }
    if (activePointer?.pageId === page.id && activePointer.kind === "erase" && activePointer.lastPoint) {
      drawEraserTip(ctx, activePointer.lastPoint, activeEraserConfig.width);
      return;
    }
    if (!activePointer && visibleSelectionBounds && page.id === activePageId) {
      drawSelectionControls(ctx, visibleSelectionBounds, selectionRotationRadians);
    }
  }

  function clearOverlay(page: HandwrittenNotePage) {
    const canvas = overlayCanvasRefs.current[page.id];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setCanvasPixelSize(canvas, page);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function setCanvasPixelSize(canvas: HTMLCanvasElement, page: HandwrittenNotePage) {
    if (canvas.width !== page.size.width || canvas.height !== page.size.height) {
      canvas.width = page.size.width;
      canvas.height = page.size.height;
    }
  }

  function renderAllThumbnails(nextContent: HandwrittenNoteContent) {
    for (const page of nextContent.pages) renderThumbnail(page);
  }

  function renderThumbnail(page: HandwrittenNotePage) {
    const canvas = thumbnailCanvasRefs.current[page.id];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform((rect.width * pixelRatio) / page.size.width, 0, 0, (rect.height * pixelRatio) / page.size.height, 0, 0);
    for (const stroke of page.strokes) drawStroke(ctx, stroke);
  }

  function pointerToPagePoint(page: HandwrittenNotePage, event: ReactPointerEvent<HTMLCanvasElement> | PointerEvent): HandwrittenPoint {
    const canvas = overlayCanvasRefs.current[page.id] ?? canvasRefs.current[page.id];
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return [0, 0, 0.5, 0];
    const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
    const pressure = nativeEvent.pointerType === "mouse" ? 0.55 : nativeEvent.pressure || 0.5;
    return [
      ((nativeEvent.clientX - rect.left) / rect.width) * page.size.width,
      ((nativeEvent.clientY - rect.top) / rect.height) * page.size.height,
      pressure,
      performance.now(),
      nativeEvent.tiltX,
      nativeEvent.tiltY,
    ];
  }

  function getCoalescedPointerEvents(event: ReactPointerEvent<HTMLCanvasElement>) {
    const nativeEvent = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    return typeof nativeEvent.getCoalescedEvents === "function" ? nativeEvent.getCoalescedEvents() : [nativeEvent];
  }

  function appendLivePoint(activePointer: ActivePointer, point: HandwrittenPoint) {
    if (activePointer.kind !== "draw" && activePointer.kind !== "lasso") {
      activePointer.points.push(point);
      return true;
    }
    const previousPoint = activePointer.points[activePointer.points.length - 1];
    if (!previousPoint) {
      activePointer.points.push(point);
      return true;
    }
    const minDistance = activePointer.kind === "draw" ? getLivePointMinDistance(activeTool) : 1.2;
    if (Math.hypot(point[0] - previousPoint[0], point[1] - previousPoint[1]) < minDistance) return false;
    activePointer.points.push(activePointer.kind === "draw" ? smoothLivePoint(previousPoint, point, activeTool) : point);
    return true;
  }

  function getLivePointMinDistance(tool: HandwrittenToolPreset) {
    return Math.max(0.55, Math.min(3.2, tool.width * 0.08 + tool.smoothing * 0.9));
  }

  function smoothLivePoint(previousPoint: HandwrittenPoint, point: HandwrittenPoint, tool: HandwrittenToolPreset): HandwrittenPoint {
    const smoothing = Math.min(0.28, Math.max(0, tool.smoothing * (tool.type === "highlighter" ? 0.2 : 0.12)));
    if (smoothing <= 0) return point;
    return [
      point[0] * (1 - smoothing) + previousPoint[0] * smoothing,
      point[1] * (1 - smoothing) + previousPoint[1] * smoothing,
      (point[2] || 0.5) * 0.7 + (previousPoint[2] || 0.5) * 0.3,
      point[3],
      point[4],
      point[5],
    ];
  }

  function scheduleOverlayRender(page: HandwrittenNotePage) {
    if (overlayFrameRef.current !== null) return;
    overlayFrameRef.current = window.requestAnimationFrame(() => {
      overlayFrameRef.current = null;
      renderLiveOverlay(page);
    });
  }

  function cancelOverlayRender() {
    if (overlayFrameRef.current === null) return;
    window.cancelAnimationFrame(overlayFrameRef.current);
    overlayFrameRef.current = null;
  }

  function renderLiveOverlay(page: HandwrittenNotePage) {
    const activePointer = activePointerRef.current;
    if (!activePointer || activePointer.pageId !== page.id) return;
    if (activePointer.kind !== "draw" && activePointer.kind !== "lasso" && activePointer.kind !== "erase" && !isSelectionPointerKind(activePointer.kind)) return;
    const canvas = overlayCanvasRefs.current[page.id];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setCanvasPixelSize(canvas, page);
    if (isSelectionPointerKind(activePointer.kind)) {
      renderSelectionPreview(ctx, activePointer);
      return;
    }
    if (activePointer.kind === "erase") {
      if (activeEraserConfig.mode === "partial" && activePointer.sourcePage) {
        renderBasePage(erasePartialStrokes(activePointer.sourcePage, activePointer.points, activeEraserConfig.width));
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (activePointer.lastPoint) drawEraserTip(ctx, activePointer.lastPoint, activeEraserConfig.width);
      return;
    }
    if (activePointer.kind === "lasso") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawLasso(ctx, activePointer.points);
      liveRenderIndexRef.current = activePointer.points.length;
      return;
    }
    if (liveRenderIndexRef.current === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (activePointer.points.length === 1) drawLivePoint(ctx, activeTool, activePointer.points[0]);
      liveRenderIndexRef.current = 1;
    }
    for (let index = Math.max(1, liveRenderIndexRef.current); index < activePointer.points.length; index += 1) {
      drawLiveSegment(ctx, activeTool, activePointer.points[index - 1], activePointer.points[index]);
    }
    liveRenderIndexRef.current = activePointer.points.length;
  }

  function drawLivePoint(ctx: CanvasRenderingContext2D, tool: HandwrittenToolPreset, point: HandwrittenPoint) {
    ctx.save();
    ctx.globalAlpha = tool.opacity;
    ctx.fillStyle = tool.color;
    ctx.beginPath();
    ctx.arc(point[0], point[1], Math.max(1, tool.width / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLiveSegment(ctx: CanvasRenderingContext2D, tool: HandwrittenToolPreset, from: HandwrittenPoint, to: HandwrittenPoint) {
    const pressure = tool.pressure ? Math.max(0.24, ((from[2] || 0.5) + (to[2] || 0.5)) / 2) : 1;
    ctx.save();
    ctx.globalAlpha = tool.opacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = tool.color;
    ctx.lineWidth = Math.max(1, tool.width * pressure);
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    ctx.restore();
  }

  function drawEraserTip(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, width: number) {
    ctx.save();
    ctx.fillStyle = "rgba(243, 112, 33, 0.08)";
    ctx.strokeStyle = "rgba(216, 90, 18, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, width, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function handlePointerDown(page: HandwrittenNotePage, event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "touch") return;
    if (event.pointerType === "pen" && event.width > 42 && event.height > 42) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActivePageId(page.id);

    const point = pointerToPagePoint(page, event);
    const selectionHandle = visibleSelectionBounds && selectedStrokeIds.size > 0 && activeUtilityTool !== "eraser"
      ? getSelectionHandleAtPoint({ x: point[0], y: point[1] }, visibleSelectionBounds, selectionRotationRadians)
      : null;
    const insideSelection = visibleSelectionBounds
      ? pointInRotatedBounds({ x: point[0], y: point[1] }, visibleSelectionBounds, selectionRotationRadians, 8)
      : false;
    const kind: ActivePointer["kind"] = selectionHandle?.mode === "scale"
      ? "scale-selection"
      : selectionHandle?.mode === "rotate"
        ? "rotate-selection"
        : activeUtilityTool !== "eraser" && insideSelection && selectedStrokeIds.size > 0
          ? "move-selection"
          : activeUtilityTool === "eraser"
      ? "erase"
      : activeUtilityTool === "lasso"
        ? "lasso"
        : "draw";
    const movedStrokeIds = kind === "erase" && activeEraserConfig.mode === "stroke"
      ? findIntersectingStrokeIds(page, { x: point[0], y: point[1] }, activeEraserConfig.width)
      : new Set<string>();
    const selectionInteraction = isSelectionPointerKind(kind) && visibleSelectionBounds
      ? createSelectionInteractionState(
        page,
        visibleSelectionBounds,
        selectedStrokeIds,
        kind === "move-selection" ? "move" : kind === "scale-selection" ? "scale" : "rotate",
        selectionHandle,
        { x: point[0], y: point[1] },
        selectionRotationRadians,
      )
      : undefined;
    livePointsRef.current = [point];
    liveRenderIndexRef.current = 0;
    clearOverlay(page);
    activePointerRef.current = {
      pointerId: event.pointerId,
      pageId: page.id,
      kind,
      points: [point],
      startedAt: performance.now(),
      movedStrokeIds,
      lastPoint: { x: point[0], y: point[1] },
      sourcePage: kind === "erase" && activeEraserConfig.mode === "partial" ? cloneHandwrittenValue(page) : undefined,
      transform: selectionInteraction,
    };
    if (isSelectionPointerKind(kind)) {
      renderBasePage(page);
      scheduleOverlayRender(page);
    }
    if (kind === "draw" || kind === "lasso" || kind === "erase") scheduleOverlayRender(page);
    if (kind === "erase" && movedStrokeIds.size > 0) renderBasePage(page);
  }

  function handlePointerMove(page: HandwrittenNotePage, event: ReactPointerEvent<HTMLCanvasElement>) {
    const activePointer = activePointerRef.current;
    if (!activePointer || activePointer.pointerId !== event.pointerId || activePointer.pageId !== page.id) return;
    event.preventDefault();
    event.stopPropagation();
    const coalescedEvents = getCoalescedPointerEvents(event);
    if (isSelectionPointerKind(activePointer.kind) && activePointer.transform) {
      const latestEvent = coalescedEvents[coalescedEvents.length - 1] ?? event.nativeEvent;
      const point = pointerToPagePoint(page, latestEvent);
      activePointer.points.push(point);
      activePointer.lastPoint = { x: point[0], y: point[1] };
      activePointer.transform.currentPoint = { x: point[0], y: point[1] };
      scheduleOverlayRender(page);
      return;
    }
    let eraserChanged = false;
    for (const coalescedEvent of coalescedEvents) {
      const point = pointerToPagePoint(page, coalescedEvent);
      if (activePointer.kind === "erase") {
        activePointer.points.push(point);
        activePointer.lastPoint = { x: point[0], y: point[1] };
        if (activeEraserConfig.mode === "stroke") {
          const hitIds = findIntersectingStrokeIds(page, { x: point[0], y: point[1] }, activeEraserConfig.width);
          hitIds.forEach((id) => {
            if (activePointer.movedStrokeIds.has(id)) return;
            activePointer.movedStrokeIds.add(id);
            eraserChanged = true;
          });
        } else {
          eraserChanged = true;
        }
      } else {
        appendLivePoint(activePointer, point);
      }
    }
    livePointsRef.current = activePointer.points;
    if (activePointer.kind === "draw" || activePointer.kind === "lasso") {
      scheduleOverlayRender(page);
    } else if (activePointer.kind === "erase") {
      if (eraserChanged && activeEraserConfig.mode === "stroke") renderBasePage(page);
      scheduleOverlayRender(page);
    }
  }

  function handlePointerUp(page: HandwrittenNotePage, event: ReactPointerEvent<HTMLCanvasElement>) {
    const activePointer = activePointerRef.current;
    if (!activePointer || activePointer.pointerId !== event.pointerId || activePointer.pageId !== page.id) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Best effort only.
    }
    activePointerRef.current = null;
    cancelOverlayRender();
    clearOverlay(page);
    const currentContent = contentRef.current;
    if (!currentContent) return;

    if (activePointer.kind === "draw") {
      if (activePointer.points.length < 2) {
        renderPage(page);
        return;
      }
      const stroke = createStrokeFromPoints(activeTool, activePointer.points);
      const nextContent = updateHandwrittenPage(currentContent, page.id, (currentPage) => ({ ...currentPage, strokes: [...currentPage.strokes, stroke] }));
      const nextPage = nextContent.pages.find((candidate) => candidate.id === page.id);
      setSelectedStrokeIds(new Set());
      setSelectionFrameBounds(null);
      setSelectionRotationRadians(0);
      commitChange(nextContent);
      if (nextPage) renderPage(nextPage);
      return;
    }

    if (activePointer.kind === "erase") {
      if (activeEraserConfig.mode === "stroke" && activePointer.movedStrokeIds.size === 0) {
        renderPage(page);
        return;
      }
      let partialChanged = false;
      const nextContent = updateHandwrittenPage(currentContent, page.id, (currentPage) => {
        if (activeEraserConfig.mode === "stroke") return removeStrokeIds(currentPage, activePointer.movedStrokeIds);
        const nextPage = erasePartialStrokes(activePointer.sourcePage ?? currentPage, activePointer.points, activeEraserConfig.width);
        partialChanged = nextPage !== (activePointer.sourcePage ?? currentPage);
        return nextPage;
      });
      if (activeEraserConfig.mode === "partial" && !partialChanged) {
        renderPage(page);
        return;
      }
      const nextPage = nextContent.pages.find((candidate) => candidate.id === page.id);
      if (activeEraserConfig.mode === "partial") {
        setSelectedStrokeIds(new Set());
        setSelectionFrameBounds(null);
        setSelectionRotationRadians(0);
      } else {
        setSelectedStrokeIds((currentIds) => {
          const nextIds = new Set(currentIds);
          activePointer.movedStrokeIds.forEach((id) => nextIds.delete(id));
          if (nextIds.size === 0) {
            setSelectionFrameBounds(null);
            setSelectionRotationRadians(0);
          }
          return nextIds;
        });
      }
      commitChange(nextContent);
      if (nextPage) renderPage(nextPage);
      return;
    }

    if (activePointer.kind === "lasso") {
      const nextSelection = findLassoStrokeIds(page, activePointer.points);
      setSelectedStrokeIds(nextSelection);
      setSelectionFrameBounds(getCombinedBounds(page.strokes.filter((stroke) => nextSelection.has(stroke.id))));
      setSelectionRotationRadians(0);
      renderPage(page);
      return;
    }

    if (isSelectionPointerKind(activePointer.kind) && activePointer.transform) {
      commitSelectionInteraction(activePointer.transform, page, currentContent);
    }
  }

  function handlePointerCancel(page: HandwrittenNotePage, event: ReactPointerEvent<HTMLCanvasElement>) {
    const activePointer = activePointerRef.current;
    if (!activePointer || activePointer.pointerId !== event.pointerId || activePointer.pageId !== page.id) return;
    if (isSelectionPointerKind(activePointer.kind) && activePointer.transform) {
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Best effort only.
      }
      cancelSelectionInteraction(page);
      return;
    }
    handlePointerUp(page, event);
  }

  function commitSelectionInteraction(interaction: SelectionInteractionState, page: HandwrittenNotePage, currentContent: HandwrittenNoteContent) {
    const transform = getSelectionInteractionTransform(interaction);
    if (!hasMeaningfulSelectionTransform(interaction.mode, transform)) {
      renderPage(page);
      return;
    }
    const nextContent = updateHandwrittenPage(currentContent, page.id, (currentPage) => transformStrokeIds(currentPage, interaction.sourceStrokes, transform));
    const nextPage = nextContent.pages.find((candidate) => candidate.id === page.id);
    const nextSelectedStrokeIds = new Set(interaction.selectedStrokeIds);
    const nextBounds = nextPage ? getCombinedBounds(nextPage.strokes.filter((stroke) => nextSelectedStrokeIds.has(stroke.id))) : null;
    setSelectedStrokeIds(nextSelectedStrokeIds);
    setSelectionFrameBounds(nextBounds);
    setSelectionRotationRadians(interaction.startSelectionRotation + transform.rotationRadians);
    commitChange(nextContent);
    if (nextPage) renderBasePage(nextPage);
  }

  function cancelSelectionInteraction(page: HandwrittenNotePage) {
    activePointerRef.current = null;
    cancelOverlayRender();
    clearOverlay(page);
    renderPage(page);
  }

  function updatePageViewports() {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !contentRef.current) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const nextViewports: Record<string, PageViewport> = {};

    for (const page of contentRef.current.pages) {
      const canvas = canvasRefs.current[page.id];
      if (!canvas) continue;
      const canvasRect = canvas.getBoundingClientRect();
      const visibleLeft = Math.max(containerRect.left, canvasRect.left);
      const visibleTop = Math.max(containerRect.top, canvasRect.top);
      const visibleRight = Math.min(containerRect.right, canvasRect.right);
      const visibleBottom = Math.min(containerRect.bottom, canvasRect.bottom);
      if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) continue;
      nextViewports[page.id] = {
        x: clampRatio((visibleLeft - canvasRect.left) / canvasRect.width),
        y: clampRatio((visibleTop - canvasRect.top) / canvasRect.height),
        width: clampRatio((visibleRight - visibleLeft) / canvasRect.width),
        height: clampRatio((visibleBottom - visibleTop) / canvasRect.height),
      };
    }

    setPageViewports((currentViewports) => (
      arePageViewportsEqual(currentViewports, nextViewports) ? currentViewports : nextViewports
    ));
  }

  function navigatePageFromMiniMap(page: HandwrittenNotePage, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const miniMapRect = event.currentTarget.getBoundingClientRect();
    const ratioX = clampRatio((event.clientX - miniMapRect.left) / miniMapRect.width);
    const ratioY = clampRatio((event.clientY - miniMapRect.top) / miniMapRect.height);
    setActivePageId(page.id);
    if (canvasRefs.current[page.id]) {
      scrollPageToRatio(page, ratioX, ratioY);
      return;
    }
    pendingMiniMapNavigationRef.current = { pageId: page.id, ratioX, ratioY };
  }

  function scrollPageToRatio(page: HandwrittenNotePage, ratioX: number, ratioY: number) {
    const scrollContainer = scrollContainerRef.current;
    const canvas = canvasRefs.current[page.id];
    if (!scrollContainer || !canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const canvasLeftInScroll = scrollContainer.scrollLeft + canvasRect.left - containerRect.left;
    const canvasTopInScroll = scrollContainer.scrollTop + canvasRect.top - containerRect.top;

    scrollContainer.scrollTo({
      left: Math.max(0, canvasLeftInScroll + ratioX * canvasRect.width - scrollContainer.clientWidth / 2),
      top: Math.max(0, canvasTopInScroll + ratioY * canvasRect.height - scrollContainer.clientHeight / 2),
      behavior: "auto",
    });
    window.requestAnimationFrame(updatePageViewports);
  }

  function handleDeleteSelection() {
    if (!activePage || selectedStrokeIds.size === 0) return;
    const nextContent = updateHandwrittenPage(content!, activePage.id, (page) => removeStrokeIds(page, selectedStrokeIds));
    setSelectedStrokeIds(new Set());
    setSelectionFrameBounds(null);
    setSelectionRotationRadians(0);
    commitChange(nextContent);
  }

  function handleAddPage() {
    const nextContent = addPage(content!, content!.defaultPage.background);
    commitChange(nextContent);
    setActivePageId(nextContent.pages[nextContent.pages.length - 1]?.id ?? activePageId);
  }

  function handleReorderPage(sourcePageId: string, targetPageId: string) {
    if (!content || sourcePageId === targetPageId) return;
    const nextContent = reorderPage(content, sourcePageId, targetPageId);
    if (nextContent === content) return;
    setSelectedStrokeIds(new Set());
    setSelectionFrameBounds(null);
    setSelectionRotationRadians(0);
    commitChange(nextContent);
  }

  function handleBackgroundChange(pageId: string, background: string) {
    const nextContent = updateHandwrittenPage(content!, pageId, (page) => ({
      ...page,
      background: { ...page.background, type: background as HandwrittenNotePage["background"]["type"] },
    }));
    commitChange(nextContent);
  }

  function handlePageLayoutChange(pageId: string, preset: HandwrittenPageSizePreset, orientation: HandwrittenPageOrientation) {
    const nextContent = updateHandwrittenPageLayout(content!, pageId, preset, orientation);
    setSelectedStrokeIds(new Set());
    setSelectionFrameBounds(null);
    setSelectionRotationRadians(0);
    commitChange(nextContent);
  }

  function handleZoomChange(nextZoomPercent: number) {
    setZoomPercent(clampZoom(nextZoomPercent));
    window.requestAnimationFrame(updatePageViewports);
  }

  function handleFitZoom(mode: "width" | "height" | "page") {
    if (!activePage || !scrollContainerRef.current) return;
    const scrollContainer = scrollContainerRef.current;
    const availableWidth = Math.max(160, scrollContainer.clientWidth - 64);
    const availableHeight = Math.max(160, scrollContainer.clientHeight - 92);
    const widthZoom = (availableWidth / activePage.size.width) * 100;
    const heightZoom = (availableHeight / activePage.size.height) * 100;
    const nextZoom = mode === "width"
      ? widthZoom
      : mode === "height"
        ? heightZoom
        : Math.min(widthZoom, heightZoom);
    handleZoomChange(nextZoom);
  }

  function handleSelectPencil(presetId: string) {
    setActivePencilId(presetId);
    setActiveUtilityTool("draw");
    setEraserSettingsOpen(false);
  }

  function handleAddPencil(anchorElement: HTMLElement | null) {
    const result = addPencilPresetToList(pencilPresets);
    pencilConfigAnchorRef.current = anchorElement;
    onToolPresetsChange(result.toolPresets);
    setActivePencilId(result.presetId);
    setActiveUtilityTool("draw");
    setConfiguringPencilId(result.presetId);
    setEraserSettingsOpen(false);
    setPendingDeletePencilId(null);
  }

  function handleUpdatePencil(presetId: string, patch: Partial<HandwrittenToolPreset>) {
    onToolPresetsChange(updateToolPresetList(pencilPresets, presetId, patch));
  }

  function handleUpdateEraser(patch: Partial<HandwrittenEraserConfig>) {
    onEraserConfigChange(normalizeEraserConfig({ ...activeEraserConfig, ...patch }));
  }

  function handleDeletePencil(presetId: string) {
    const nextPencils = removePencilPresetFromList(pencilPresets, presetId);
    onToolPresetsChange(nextPencils);
    setActivePencilId(nextPencils[0]?.id ?? "pencil-1");
    setActiveUtilityTool("draw");
    setConfiguringPencilId(null);
    setPendingDeletePencilId(null);
  }

  const pageCount = content.pages.length;

  function renderToolbarContent(vertical: boolean) {
    const groupClass = vertical ? "flex shrink-0 flex-col items-center gap-0.5" : "flex shrink-0 items-center gap-0.5";
    const ToggleIcon = vertical ? PanelTop : PanelLeft;

    return (
      <>
        <div className={groupClass}>
          <button
            className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
            aria-label={vertical ? "Mover barra arriba" : "Mover barra a la izquierda"}
            data-tooltip={vertical ? "Barra arriba" : "Barra izquierda"}
            onClick={() => setToolbarPlacement(vertical ? "top" : "left")}
          >
            <ToggleIcon size={16} />
          </button>
        </div>
        <div className={groupClass}>
          {pencilPresets.map((pencil) => {
            const Icon = pencilTypeIcons[pencil.type ?? "pen"];
            return (
              <button
                key={pencil.id}
                className={["relative grid h-8 w-8 place-items-center rounded-md transition", activeUtilityTool === "draw" && activePencilId === pencil.id ? "bg-brand-hover" : "hover:bg-brand-hover"].join(" ")}
                aria-label={pencil.label}
                data-tooltip={`${pencil.label} · doble click configura`}
                onClick={() => handleSelectPencil(pencil.id)}
                onDoubleClick={(event) => {
                  pencilConfigAnchorRef.current = event.currentTarget;
                  setConfiguringPencilId(pencil.id);
                  setEraserSettingsOpen(false);
                }}
              >
                <Icon size={16} style={{ color: pencil.color }} />
                <span className="absolute bottom-1 h-1 w-5 rounded-full" style={{ backgroundColor: pencil.color, opacity: pencil.opacity }} />
              </button>
            );
          })}
          {pencilPresets.length < MAX_PENCIL_PRESETS ? (
            <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Añadir pencil" data-tooltip="Añadir pencil" onClick={(event) => handleAddPencil(event.currentTarget)}>
              <Plus size={16} />
            </button>
          ) : null}
        </div>
        <div className={groupClass}>
          <button
            className={["grid h-8 w-8 place-items-center rounded-md transition", activeUtilityTool === "eraser" ? "bg-brand-hover text-brand-orange" : "text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"].join(" ")}
            aria-label="Borrador"
            data-tooltip="Borrador · doble click configura"
            onClick={() => setActiveUtilityTool("eraser")}
            onDoubleClick={(event) => {
              eraserConfigAnchorRef.current = event.currentTarget;
              setActiveUtilityTool("eraser");
              setEraserSettingsOpen(true);
              setConfiguringPencilId(null);
              setPendingDeletePencilId(null);
              setPagesLayerOpen(false);
              setPageSettingsOpen(false);
              setZoomSettingsOpen(false);
            }}
          >
            <Eraser size={16} />
          </button>
          <button
            className={["grid h-8 w-8 place-items-center rounded-md transition", activeUtilityTool === "lasso" ? "bg-brand-hover text-brand-orange" : "text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"].join(" ")}
            aria-label="Lazo"
            data-tooltip="Lazo"
            onClick={() => {
              setActiveUtilityTool("lasso");
              setEraserSettingsOpen(false);
            }}
          >
            <Lasso size={16} />
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-40" aria-label="Eliminar selección" data-tooltip="Eliminar selección" disabled={selectedStrokeIds.size === 0} onClick={handleDeleteSelection}>
            <Trash2 size={16} />
          </button>
        </div>
        <div className={groupClass}>
          <button
            className={["grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange", pagesLayerOpen ? "bg-brand-hover text-brand-orange" : ""].join(" ")}
            aria-label="Mostrar hojas"
            data-tooltip={`Hojas · ${Math.max(1, activePageIndex + 1)}/${pageCount}`}
            onClick={(event) => {
              pagesLayerAnchorRef.current = event.currentTarget;
              setPagesLayerOpen((open) => !open);
              setZoomSettingsOpen(false);
              setPageSettingsOpen(false);
              setEraserSettingsOpen(false);
            }}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            className={["grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange disabled:cursor-not-allowed disabled:opacity-40", pageSettingsOpen ? "bg-brand-hover text-brand-orange" : ""].join(" ")}
            aria-label="Configurar hoja"
            data-tooltip="Configurar hoja"
            disabled={!activePage}
            onClick={(event) => {
              pageSettingsAnchorRef.current = event.currentTarget;
              setPageSettingsOpen((open) => !open);
              setPagesLayerOpen(false);
              setZoomSettingsOpen(false);
              setEraserSettingsOpen(false);
            }}
          >
            <Settings2 size={16} />
          </button>
        </div>
        <div className={groupClass}>
          <button
            className={["grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange", zoomSettingsOpen ? "bg-brand-hover text-brand-orange" : ""].join(" ")}
            aria-label="Configurar zoom"
            data-tooltip={`Zoom · ${zoomPercent}%`}
            onClick={(event) => {
              zoomSettingsAnchorRef.current = event.currentTarget;
              setZoomSettingsOpen((open) => !open);
              setPagesLayerOpen(false);
              setPageSettingsOpen(false);
              setEraserSettingsOpen(false);
            }}
          >
            <ZoomIn size={16} />
          </button>
        </div>
        <div className={groupClass}>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Deshacer" data-tooltip="Deshacer" onClick={handleUndo}>
            <Undo2 size={16} />
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Rehacer" data-tooltip="Rehacer" onClick={handleRedo}>
            <Redo2 size={16} />
          </button>
        </div>
      </>
    );
  }

  const toolbarIsVertical = toolbarPlacement === "left";
  const popoverPlacement: PopoverPreferredPlacement = toolbarIsVertical ? "right" : "bottom";

  return (
    <div ref={editorBoundaryRef} className="flex h-full min-h-0 flex-col bg-white">
      {!toolbarIsVertical ? (
        <div className="flex h-10 shrink-0 items-center border-b border-line bg-white px-2">
          <div className="min-w-0 flex flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain py-1">
            {renderToolbarContent(false)}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {toolbarIsVertical ? (
          <aside className="flex w-10 shrink-0 flex-col items-center border-r border-line bg-white py-1">
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overscroll-y-contain">
              {renderToolbarContent(true)}
            </div>
          </aside>
        ) : null}
        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-panel px-6 py-6">
            <div className="mx-auto flex w-max min-w-full flex-col items-center gap-6">
              {activePage ? (
                <div key={activePage.id} className="flex flex-col items-center">
                  <div
                    className="relative rounded-sm border border-orange-200 bg-white shadow-[0_18px_48px_rgba(17,24,39,0.12)]"
                    style={{ width: activePage.size.width * (zoomPercent / 100), height: activePage.size.height * (zoomPercent / 100), touchAction: "none" }}
                  >
                    <canvas
                      ref={(canvas) => {
                        canvasRefs.current[activePage.id] = canvas;
                        if (canvas) renderBasePage(activePage);
                      }}
                      className="absolute inset-0 h-full w-full rounded-sm"
                      width={activePage.size.width}
                      height={activePage.size.height}
                      aria-hidden="true"
                    />
                    <canvas
                      ref={(canvas) => {
                        overlayCanvasRefs.current[activePage.id] = canvas;
                        if (canvas) renderOverlayState(activePage);
                      }}
                      className="absolute inset-0 h-full w-full rounded-sm"
                      width={activePage.size.width}
                      height={activePage.size.height}
                      aria-label={`Página manuscrita ${Math.max(1, activePageIndex + 1)}`}
                      onPointerDown={(event) => handlePointerDown(activePage, event)}
                      onPointerMove={(event) => handlePointerMove(activePage, event)}
                      onPointerUp={(event) => handlePointerUp(activePage, event)}
                      onPointerCancel={(event) => handlePointerCancel(activePage, event)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
      {configuringPencil ? (
        <PencilConfigurationLayer
          anchorElement={pencilConfigAnchorRef.current}
          boundaryElement={editorBoundaryRef.current}
          preferredPlacement={popoverPlacement}
          pencil={configuringPencil}
          pencilCount={pencilPresets.length}
          pendingDelete={pendingDeletePencilId === configuringPencil.id}
          onClose={() => {
            setConfiguringPencilId(null);
            setPendingDeletePencilId(null);
          }}
          onChange={(patch) => handleUpdatePencil(configuringPencil.id, patch)}
          onRequestDelete={() => setPendingDeletePencilId(configuringPencil.id)}
          onCancelDelete={() => setPendingDeletePencilId(null)}
          onConfirmDelete={() => handleDeletePencil(configuringPencil.id)}
        />
      ) : null}
      {eraserSettingsOpen ? (
        <EraserConfigurationLayer
          anchorElement={eraserConfigAnchorRef.current}
          boundaryElement={editorBoundaryRef.current}
          preferredPlacement={popoverPlacement}
          eraser={activeEraserConfig}
          onClose={() => setEraserSettingsOpen(false)}
          onChange={handleUpdateEraser}
        />
      ) : null}
      {pageSettingsOpen && activePage ? (
        <SheetSettingsLayer
          anchorElement={pageSettingsAnchorRef.current}
          boundaryElement={editorBoundaryRef.current}
          preferredPlacement={popoverPlacement}
          page={activePage}
          onClose={() => setPageSettingsOpen(false)}
          onLayoutChange={(preset, orientation) => handlePageLayoutChange(activePage.id, preset, orientation)}
          onBackgroundChange={(background) => handleBackgroundChange(activePage.id, background)}
        />
      ) : null}
      {pagesLayerOpen ? (
        <PagesLayer
          anchorElement={pagesLayerAnchorRef.current}
          boundaryElement={editorBoundaryRef.current}
          preferredPlacement={popoverPlacement}
          pages={content.pages}
          activePageId={activePage?.id ?? ""}
          pageViewports={pageViewports}
          onClose={() => setPagesLayerOpen(false)}
          onActivatePage={setActivePageId}
          onAddPage={handleAddPage}
          onReorderPage={handleReorderPage}
          onNavigate={navigatePageFromMiniMap}
          onThumbnailCanvas={(page, canvas) => {
            thumbnailCanvasRefs.current[page.id] = canvas;
            if (canvas) window.requestAnimationFrame(() => renderThumbnail(page));
          }}
        />
      ) : null}
      {zoomSettingsOpen ? (
        <ZoomSettingsLayer
          anchorElement={zoomSettingsAnchorRef.current}
          boundaryElement={editorBoundaryRef.current}
          preferredPlacement={popoverPlacement}
          zoomPercent={zoomPercent}
          activePage={activePage}
          viewport={activePage ? pageViewports[activePage.id] : undefined}
          onClose={() => setZoomSettingsOpen(false)}
          onZoomChange={handleZoomChange}
          onFitWidth={() => handleFitZoom("width")}
          onFitHeight={() => handleFitZoom("height")}
          onFitPage={() => handleFitZoom("page")}
          onNavigate={navigatePageFromMiniMap}
          onThumbnailCanvas={(page, canvas) => {
            thumbnailCanvasRefs.current[page.id] = canvas;
            if (canvas) window.requestAnimationFrame(() => renderThumbnail(page));
          }}
        />
      ) : null}
    </div>
  );
}

function AnchoredConfigurationLayer({
  anchorElement,
  boundaryElement,
  preferredPlacement,
  width,
  className = "",
  backdropClassName = "bg-black/5",
  ariaLabel,
  onClose,
  children,
}: {
  anchorElement: HTMLElement | null;
  boundaryElement: HTMLElement | null;
  preferredPlacement: PopoverPreferredPlacement;
  width: number;
  className?: string;
  backdropClassName?: string;
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measuredPanel = panel;

    function updatePosition() {
      const nextPosition = getAnchoredPopoverPosition(anchorElement, boundaryElement, measuredPanel, preferredPlacement, width);
      setPosition((currentPosition) => (
        arePopoverPositionsEqual(currentPosition, nextPosition) ? currentPosition : nextPosition
      ));
    }

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(measuredPanel);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement, boundaryElement, preferredPlacement, width]);

  const panelStyle = {
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    width,
    maxWidth: `calc(100vw - ${POPOVER_MARGIN * 2}px)`,
    visibility: position ? "visible" as const : "hidden" as const,
  };

  return (
    <div className={["fixed inset-0 z-[70]", backdropClassName].join(" ")} onPointerDown={onClose}>
      <section
        ref={panelRef}
        className={["absolute rounded-md border border-line bg-white shadow-[0_18px_60px_rgba(17,24,39,0.18)]", className].join(" ")}
        style={panelStyle}
        aria-label={ariaLabel}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {position ? <span className={getPopoverArrowClassName(position.placement)} style={getPopoverArrowStyle(position)} /> : null}
        {children}
      </section>
    </div>
  );
}

type PopoverPosition = {
  left: number;
  top: number;
  placement: PopoverResolvedPlacement;
  arrowLeft?: number;
  arrowTop?: number;
};

type PopoverBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function getAnchoredPopoverPosition(
  anchorElement: HTMLElement | null,
  boundaryElement: HTMLElement | null,
  panel: HTMLElement,
  preferredPlacement: PopoverPreferredPlacement,
  fallbackWidth: number,
): PopoverPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const bounds = getPopoverBounds(boundaryElement, viewportWidth, viewportHeight);
  const panelRect = panel.getBoundingClientRect();
  const panelWidth = Math.min(panelRect.width || fallbackWidth, bounds.right - bounds.left);
  const panelHeight = Math.min(panelRect.height || 1, bounds.bottom - bounds.top);
  const anchorRect = anchorElement?.isConnected ? anchorElement.getBoundingClientRect() : null;

  if (!anchorRect) {
    return {
      left: clampPopoverValue(bounds.right - panelWidth - 16, bounds.left, bounds.right - panelWidth),
      top: clampPopoverValue(bounds.top + 48, bounds.top, bounds.bottom - panelHeight),
      placement: preferredPlacement,
    };
  }

  if (preferredPlacement === "right") {
    return getHorizontalPopoverPosition(anchorRect, panelWidth, panelHeight, bounds);
  }

  return getVerticalPopoverPosition(anchorRect, panelWidth, panelHeight, bounds);
}

function getVerticalPopoverPosition(
  anchorRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
  bounds: PopoverBounds,
): PopoverPosition {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  let placement: PopoverResolvedPlacement = "bottom";
  let top = anchorRect.bottom + POPOVER_GAP;

  if (top + panelHeight > bounds.bottom && anchorRect.top - POPOVER_GAP - panelHeight >= bounds.top) {
    placement = "top";
    top = anchorRect.top - POPOVER_GAP - panelHeight;
  }

  const left = clampPopoverValue(anchorCenterX - panelWidth / 2, bounds.left, bounds.right - panelWidth);
  top = clampPopoverValue(top, bounds.top, bounds.bottom - panelHeight);

  return {
    left,
    top,
    placement,
    arrowLeft: clampPopoverValue(anchorCenterX - left, POPOVER_ARROW_SIZE, panelWidth - POPOVER_ARROW_SIZE),
  };
}

function getHorizontalPopoverPosition(
  anchorRect: DOMRect,
  panelWidth: number,
  panelHeight: number,
  bounds: PopoverBounds,
): PopoverPosition {
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  let placement: PopoverResolvedPlacement = "right";
  let left = anchorRect.right + POPOVER_GAP;

  if (left + panelWidth > bounds.right && anchorRect.left - POPOVER_GAP - panelWidth >= bounds.left) {
    placement = "left";
    left = anchorRect.left - POPOVER_GAP - panelWidth;
  }

  left = clampPopoverValue(left, bounds.left, bounds.right - panelWidth);
  const top = clampPopoverValue(anchorCenterY - panelHeight / 2, bounds.top, bounds.bottom - panelHeight);

  return {
    left,
    top,
    placement,
    arrowTop: clampPopoverValue(anchorCenterY - top, POPOVER_ARROW_SIZE, panelHeight - POPOVER_ARROW_SIZE),
  };
}

function getPopoverBounds(boundaryElement: HTMLElement | null, viewportWidth: number, viewportHeight: number): PopoverBounds {
  const boundaryRect = boundaryElement?.isConnected ? boundaryElement.getBoundingClientRect() : null;
  const left = boundaryRect ? Math.max(POPOVER_MARGIN, boundaryRect.left + POPOVER_MARGIN) : POPOVER_MARGIN;
  const right = boundaryRect ? Math.min(viewportWidth - POPOVER_MARGIN, boundaryRect.right - POPOVER_MARGIN) : viewportWidth - POPOVER_MARGIN;
  const top = POPOVER_MARGIN;
  const bottom = viewportHeight - POPOVER_MARGIN;

  return {
    left,
    right: Math.max(left + 1, right),
    top,
    bottom: Math.max(top + 1, bottom),
  };
}

function getPopoverArrowClassName(placement: PopoverResolvedPlacement) {
  const baseClass = "pointer-events-none absolute h-3 w-3 rotate-45 border border-line bg-white";
  if (placement === "top") return `${baseClass} -bottom-1.5`;
  if (placement === "right") return `${baseClass} -left-1.5`;
  if (placement === "left") return `${baseClass} -right-1.5`;
  return `${baseClass} -top-1.5`;
}

function getPopoverArrowStyle(position: PopoverPosition) {
  if (position.placement === "left" || position.placement === "right") {
    return { top: (position.arrowTop ?? POPOVER_ARROW_SIZE) - POPOVER_ARROW_SIZE / 2 };
  }
  return { left: (position.arrowLeft ?? POPOVER_ARROW_SIZE) - POPOVER_ARROW_SIZE / 2 };
}

function arePopoverPositionsEqual(currentPosition: PopoverPosition | null, nextPosition: PopoverPosition) {
  if (!currentPosition) return false;
  return currentPosition.placement === nextPosition.placement
    && Math.abs(currentPosition.left - nextPosition.left) < 0.5
    && Math.abs(currentPosition.top - nextPosition.top) < 0.5
    && Math.abs((currentPosition.arrowLeft ?? 0) - (nextPosition.arrowLeft ?? 0)) < 0.5
    && Math.abs((currentPosition.arrowTop ?? 0) - (nextPosition.arrowTop ?? 0)) < 0.5;
}

function clampPopoverValue(value: number, min: number, max: number) {
  const resolvedMax = Math.max(min, max);
  return Math.min(resolvedMax, Math.max(min, value));
}

function ZoomSettingsLayer({
  anchorElement,
  boundaryElement,
  preferredPlacement,
  zoomPercent,
  activePage,
  viewport,
  onClose,
  onZoomChange,
  onFitWidth,
  onFitHeight,
  onFitPage,
  onNavigate,
  onThumbnailCanvas,
}: {
  anchorElement: HTMLElement | null;
  boundaryElement: HTMLElement | null;
  preferredPlacement: PopoverPreferredPlacement;
  zoomPercent: number;
  activePage: HandwrittenNotePage | null;
  viewport?: PageViewport;
  onClose: () => void;
  onZoomChange: (zoomPercent: number) => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onFitPage: () => void;
  onNavigate: (page: HandwrittenNotePage, event: ReactPointerEvent<HTMLDivElement>) => void;
  onThumbnailCanvas: (page: HandwrittenNotePage, canvas: HTMLCanvasElement | null) => void;
}) {
  return (
    <AnchoredConfigurationLayer
      anchorElement={anchorElement}
      boundaryElement={boundaryElement}
      preferredPlacement={preferredPlacement}
      width={320}
      ariaLabel="Configurar zoom"
      onClose={onClose}
    >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
            <ZoomIn size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-ink-primary">Zoom</div>
            <div className="truncate text-[10px] text-ink-secondary">{zoomPercent}%</div>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-panel hover:text-ink-primary" aria-label="Cerrar configuración de zoom" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="space-y-3 px-3 py-3">
          {activePage ? (
            <div className="flex items-center justify-center rounded-md border border-line bg-panel/70 p-2">
              <HandwrittenPageThumbnail
                page={activePage}
                viewport={viewport}
                maxWidth={ZOOM_THUMBNAIL_MAX_WIDTH}
                maxHeight={ZOOM_THUMBNAIL_MAX_HEIGHT}
                onCanvas={onThumbnailCanvas}
                onNavigate={onNavigate}
              />
            </div>
          ) : null}
          <label className="flex h-10 items-center gap-2 rounded-md border border-line px-2 text-[10px] font-semibold uppercase text-ink-secondary">
            Nivel
            <input
              className="min-w-0 flex-1 accent-[rgb(var(--accent))]"
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              value={zoomPercent}
              onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
              aria-label="Nivel de zoom"
            />
            <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-ink-primary">{zoomPercent}%</span>
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-line bg-white text-ink-secondary transition hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange"
              aria-label="Ajustar en anchura"
              data-tooltip="Ajustar en anchura"
              onClick={onFitWidth}
            >
              <ArrowLeftRight size={18} />
              <span className="text-[10px] font-semibold">Ancho</span>
            </button>
            <button
              type="button"
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-line bg-white text-ink-secondary transition hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange"
              aria-label="Ajustar en altura"
              data-tooltip="Ajustar en altura"
              onClick={onFitHeight}
            >
              <ArrowUpDown size={18} />
              <span className="text-[10px] font-semibold">Alto</span>
            </button>
            <button
              type="button"
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-md border border-line bg-white text-ink-secondary transition hover:border-orange-200 hover:bg-brand-hover hover:text-brand-orange"
              aria-label="Mostrar completo ajustado"
              data-tooltip="Mostrar completo"
              onClick={onFitPage}
            >
              <Maximize2 size={18} />
              <span className="text-[10px] font-semibold">Completo</span>
            </button>
          </div>
        </div>
    </AnchoredConfigurationLayer>
  );
}

function PagesLayer({
  anchorElement,
  boundaryElement,
  preferredPlacement,
  pages,
  activePageId,
  pageViewports,
  onClose,
  onActivatePage,
  onAddPage,
  onReorderPage,
  onNavigate,
  onThumbnailCanvas,
}: {
  anchorElement: HTMLElement | null;
  boundaryElement: HTMLElement | null;
  preferredPlacement: PopoverPreferredPlacement;
  pages: HandwrittenNotePage[];
  activePageId: string;
  pageViewports: Record<string, PageViewport>;
  onClose: () => void;
  onActivatePage: (pageId: string) => void;
  onAddPage: () => void;
  onReorderPage: (sourcePageId: string, targetPageId: string) => void;
  onNavigate: (page: HandwrittenNotePage, event: ReactPointerEvent<HTMLDivElement>) => void;
  onThumbnailCanvas: (page: HandwrittenNotePage, canvas: HTMLCanvasElement | null) => void;
}) {
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);

  return (
    <AnchoredConfigurationLayer
      anchorElement={anchorElement}
      boundaryElement={boundaryElement}
      preferredPlacement={preferredPlacement}
      width={420}
      className="flex max-h-[min(560px,calc(100vh-32px))] flex-col"
      ariaLabel="Hojas de la nota"
      onClose={onClose}
    >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
            <Grid3X3 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-ink-primary">Hojas</div>
            <div className="truncate text-[10px] text-ink-secondary">{pages.length} página(s)</div>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Añadir página" data-tooltip="Añadir página" onClick={onAddPage}>
            <FilePlus2 size={15} />
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-panel hover:text-ink-primary" aria-label="Cerrar hojas" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2">
            {pages.map((page, index) => {
              const selected = page.id === activePageId;
              const dragging = page.id === draggedPageId;
              const dropTarget = Boolean(draggedPageId && page.id === dropTargetPageId && page.id !== draggedPageId);
              return (
                <div
                  key={page.id}
                  className={[
                    "rounded-md border bg-white p-2 transition",
                    selected ? "border-brand-orange ring-1 ring-brand-orange" : "border-line hover:border-orange-200 hover:bg-panel/60",
                    dragging ? "opacity-45" : "",
                    dropTarget ? "border-brand-orange bg-brand-hover shadow-[0_0_0_1px_rgba(243,112,33,0.45)]" : "",
                  ].join(" ")}
                  role="button"
                  tabIndex={0}
                  aria-label={`Página ${index + 1}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", page.id);
                    setDraggedPageId(page.id);
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (draggedPageId && draggedPageId !== page.id) setDropTargetPageId(page.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (draggedPageId && draggedPageId !== page.id) setDropTargetPageId(page.id);
                  }}
                  onDragLeave={() => {
                    if (dropTargetPageId === page.id) setDropTargetPageId(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourcePageId = event.dataTransfer.getData("text/plain") || draggedPageId;
                    setDraggedPageId(null);
                    setDropTargetPageId(null);
                    if (sourcePageId && sourcePageId !== page.id) onReorderPage(sourcePageId, page.id);
                  }}
                  onDragEnd={() => {
                    setDraggedPageId(null);
                    setDropTargetPageId(null);
                  }}
                  onClick={() => onActivatePage(page.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onActivatePage(page.id);
                    }
                  }}
                >
                  <div className="flex h-[112px] items-center justify-center rounded bg-panel/70">
                    <HandwrittenPageThumbnail
                      page={page}
                      viewport={pageViewports[page.id]}
                      maxWidth={PAGE_LAYER_THUMBNAIL_MAX_WIDTH}
                      maxHeight={PAGE_LAYER_THUMBNAIL_MAX_HEIGHT}
                      onCanvas={onThumbnailCanvas}
                      onNavigate={onNavigate}
                    />
                  </div>
                  <div className={["mt-1 text-center text-[10px] font-semibold", selected ? "text-brand-orange" : "text-ink-secondary"].join(" ")}>
                    {index + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
    </AnchoredConfigurationLayer>
  );
}

function HandwrittenPageThumbnail({
  page,
  viewport,
  maxWidth,
  maxHeight,
  onCanvas,
  onNavigate,
}: {
  page: HandwrittenNotePage;
  viewport?: PageViewport;
  maxWidth: number;
  maxHeight: number;
  onCanvas: (page: HandwrittenNotePage, canvas: HTMLCanvasElement | null) => void;
  onNavigate: (page: HandwrittenNotePage, event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[2px] border border-line bg-white shadow-[0_1px_3px_rgba(17,24,39,0.12)]"
      style={{ ...getScaledPageStyle(page, maxWidth, maxHeight), ...getThumbnailBackgroundStyle(page) }}
      data-tooltip="Mover vista de la página"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onNavigate(page, event);
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return;
        onNavigate(page, event);
      }}
    >
      <canvas
        ref={(canvas) => onCanvas(page, canvas)}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      />
      {viewport ? (
        <span
          className="pointer-events-none absolute rounded-[2px] border border-brand-orange bg-brand-orange/10 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
          style={getViewportIndicatorStyle(viewport)}
        />
      ) : null}
    </div>
  );
}

function SheetSettingsLayer({
  anchorElement,
  boundaryElement,
  preferredPlacement,
  page,
  onClose,
  onLayoutChange,
  onBackgroundChange,
}: {
  anchorElement: HTMLElement | null;
  boundaryElement: HTMLElement | null;
  preferredPlacement: PopoverPreferredPlacement;
  page: HandwrittenNotePage;
  onClose: () => void;
  onLayoutChange: (preset: HandwrittenPageSizePreset, orientation: HandwrittenPageOrientation) => void;
  onBackgroundChange: (background: HandwrittenPageBackground) => void;
}) {
  const currentPreset = PAGE_SIZE_PRESETS.some((preset) => preset.id === page.size.preset) ? page.size.preset : "A4";
  const currentOrientation = getPageOrientation(page);
  const currentPresetLabel = PAGE_SIZE_PRESETS.find((preset) => preset.id === currentPreset)?.label ?? "DinA4";
  const currentBackgroundLabel = PAGE_BACKGROUNDS.find((background) => background.id === page.background.type)?.label ?? "Blanco";

  return (
    <AnchoredConfigurationLayer
      anchorElement={anchorElement}
      boundaryElement={boundaryElement}
      preferredPlacement={preferredPlacement}
      width={360}
      ariaLabel="Configurar hoja"
      onClose={onClose}
    >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
            <Settings2 size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-ink-primary">Hoja</div>
            <div className="truncate text-[10px] text-ink-secondary">{currentPresetLabel} · {currentOrientation === "portrait" ? "Vertical" : "Horizontal"} · {currentBackgroundLabel}</div>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-panel hover:text-ink-primary" aria-label="Cerrar configuración de hoja" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="grid grid-cols-[112px_1fr] gap-3 px-3 py-3">
          <div className="flex min-h-[156px] items-center justify-center rounded-md border border-line bg-panel/70">
            <div
              className="rounded-[3px] border border-line bg-white shadow-[0_8px_22px_rgba(17,24,39,0.14)]"
              style={{ ...getSheetSettingsPreviewStyle(page), ...getThumbnailBackgroundStyle(page) }}
            />
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-ink-secondary">
                <Grid3X3 size={12} />
                Formato
              </div>
              <div className="grid grid-cols-4 gap-1">
                {PAGE_SIZE_PRESETS.map((preset) => {
                  const selected = currentPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={["h-9 rounded-md border px-1.5 text-[11px] font-semibold transition", selected ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-panel hover:text-ink-primary"].join(" ")}
                      onClick={() => onLayoutChange(preset.id, currentOrientation)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase text-ink-secondary">Orientación</div>
              <div className="grid grid-cols-2 gap-1">
                {PAGE_ORIENTATIONS.map((orientation) => {
                  const selected = currentOrientation === orientation.id;
                  return (
                    <button
                      key={orientation.id}
                      type="button"
                      className={["flex h-10 items-center justify-center gap-2 rounded-md border px-2 text-[11px] font-semibold transition", selected ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-panel hover:text-ink-primary"].join(" ")}
                      onClick={() => onLayoutChange(currentPreset, orientation.id)}
                    >
                      <span className={["rounded-[2px] border", orientation.id === "portrait" ? "h-5 w-3.5" : "h-3.5 w-5", selected ? "border-brand-orange" : "border-ink-secondary/60"].join(" ")} />
                      {orientation.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase text-ink-secondary">Plantilla</div>
              <div className="grid grid-cols-5 gap-1">
                {PAGE_BACKGROUNDS.map((background) => {
                  const selected = page.background.type === background.id;
                  return (
                    <button
                      key={background.id}
                      type="button"
                      className={["h-10 rounded-md border p-1 transition", selected ? "border-brand-orange bg-brand-hover ring-1 ring-brand-orange" : "border-line bg-white hover:border-orange-200 hover:bg-panel"].join(" ")}
                      aria-label={background.label}
                      data-tooltip={background.label}
                      onClick={() => onBackgroundChange(background.id)}
                    >
                      <span className="block h-full rounded-[2px] border border-line bg-white" style={getBackgroundPreviewStyle(background.id)} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
    </AnchoredConfigurationLayer>
  );
}

function EraserConfigurationLayer({
  anchorElement,
  boundaryElement,
  preferredPlacement,
  eraser,
  onClose,
  onChange,
}: {
  anchorElement: HTMLElement | null;
  boundaryElement: HTMLElement | null;
  preferredPlacement: PopoverPreferredPlacement;
  eraser: HandwrittenEraserConfig;
  onClose: () => void;
  onChange: (patch: Partial<HandwrittenEraserConfig>) => void;
}) {
  const modeOptions: Array<{ id: HandwrittenEraserConfig["mode"]; label: string }> = [
    { id: "stroke", label: "Trazo" },
    { id: "partial", label: "Parcial" },
  ];

  return (
    <AnchoredConfigurationLayer
      anchorElement={anchorElement}
      boundaryElement={boundaryElement}
      preferredPlacement={preferredPlacement}
      width={292}
      ariaLabel="Configurar borrador"
      onClose={onClose}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-hover text-brand-orange">
          <Eraser size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ink-primary">Borrador</div>
          <div className="truncate text-[10px] text-ink-secondary">{eraser.width}px · {eraser.mode === "partial" ? "Parcial" : "Trazo"}</div>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-panel hover:text-ink-primary" aria-label="Cerrar configuración de borrador" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <div className="space-y-2 px-3 py-3">
        <RangeControl label="Anchura" min={MIN_ERASER_WIDTH} max={MAX_ERASER_WIDTH} value={eraser.width} onChange={(width) => onChange({ width })} />
        <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel p-1">
          {modeOptions.map((mode) => {
            const selected = eraser.mode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={["h-8 rounded-[5px] text-[11px] font-semibold transition", selected ? "bg-white text-brand-orange shadow-sm" : "text-ink-secondary hover:bg-white/70 hover:text-ink-primary"].join(" ")}
                onClick={() => onChange({ mode: mode.id })}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center rounded-md border border-line bg-panel py-3">
          <span
            className="rounded-full border border-brand-orange bg-brand-orange/10"
            style={{ width: Math.max(14, Math.min(58, eraser.width * 1.2)), height: Math.max(14, Math.min(58, eraser.width * 1.2)) }}
            aria-hidden="true"
          />
        </div>
      </div>
    </AnchoredConfigurationLayer>
  );
}

function PencilConfigurationLayer({
  anchorElement,
  boundaryElement,
  preferredPlacement,
  pencil,
  pencilCount,
  pendingDelete,
  onClose,
  onChange,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  anchorElement: HTMLElement | null;
  boundaryElement: HTMLElement | null;
  preferredPlacement: PopoverPreferredPlacement;
  pencil: HandwrittenToolPreset;
  pencilCount: number;
  pendingDelete: boolean;
  onClose: () => void;
  onChange: (patch: Partial<HandwrittenToolPreset>) => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const Icon = pencilTypeIcons[pencil.type ?? "pen"];
  const canDelete = pencilCount > MIN_PENCIL_PRESETS;

  function handleTypeChange(nextType: HandwrittenPencilType) {
    const currentTypeLabel = getPencilTypeLabel(pencil.type);
    const nextTypeDefinition = PENCIL_TYPES.find((type) => type.id === nextType);
    onChange({
      ...nextTypeDefinition?.defaults,
      type: nextType,
      label: pencil.label === currentTypeLabel ? getPencilTypeLabel(nextType) : pencil.label,
    });
  }

  return (
    <AnchoredConfigurationLayer
      anchorElement={anchorElement}
      boundaryElement={boundaryElement}
      preferredPlacement={preferredPlacement}
      width={360}
      backdropClassName="bg-black/10"
      ariaLabel="Configurar pencil"
      onClose={onClose}
    >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-hover">
            <Icon size={17} style={{ color: pencil.color }} />
            <span className="absolute bottom-1 h-1 w-6 rounded-full" style={{ backgroundColor: pencil.color, opacity: pencil.opacity }} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              className="h-6 w-full rounded-md border border-transparent px-1 text-[12px] font-semibold text-ink-primary outline-none hover:border-line focus:border-brand-orange"
              value={pencil.label}
              aria-label="Nombre del pencil"
              onChange={(event) => onChange({ label: event.currentTarget.value })}
            />
            <div className="flex items-center gap-2 px-1 text-[10px] text-ink-secondary">
              <span>{getPencilTypeLabel(pencil.type)}</span>
              <span className="h-1.5 w-20 rounded-full" style={{ backgroundColor: pencil.color, opacity: pencil.opacity }} />
            </div>
          </div>
          {canDelete ? (
            <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-red-50 hover:text-red-600" aria-label="Eliminar pencil" data-tooltip="Eliminar pencil" onClick={onRequestDelete}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
        <div className="space-y-2 px-3 py-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold text-ink-secondary">Tipo</div>
            <div className="grid grid-cols-5 gap-1">
              {PENCIL_TYPES.map((type) => {
                const TypeIcon = pencilTypeIcons[type.id];
                const selected = (pencil.type ?? "pen") === type.id;
                return (
                  <button
                    key={type.id}
                    className={["flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-center transition", selected ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line bg-white text-ink-secondary hover:border-orange-200 hover:bg-panel hover:text-ink-primary"].join(" ")}
                    type="button"
                    aria-label={type.label}
                    onClick={() => handleTypeChange(type.id)}
                  >
                    <TypeIcon size={16} />
                    <span className="max-w-full truncate text-[9px] font-semibold leading-none">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold text-ink-secondary">Color</div>
            <div className="grid grid-cols-8 gap-1">
              {pencilColorSwatches.map((swatch) => {
                const selected = pencil.color.toLowerCase() === swatch.value.toLowerCase();
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    className={["relative h-7 rounded-md border transition", selected ? "border-brand-orange ring-1 ring-brand-orange" : "border-line hover:border-orange-200"].join(" ")}
                    style={{ backgroundColor: swatch.value }}
                    aria-label={swatch.label}
                    data-tooltip={swatch.label}
                    onClick={() => onChange({ color: swatch.value })}
                  >
                    {selected ? (
                      <span className="absolute inset-0 grid place-items-center text-white drop-shadow">
                        <Check size={15} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <label className="mt-1.5 flex h-8 cursor-default items-center justify-between rounded-md border border-line px-2 text-[10px] font-semibold text-ink-secondary">
              Color propio
              <span className="flex items-center gap-2 text-[11px] font-medium normal-case text-ink-primary">
                {pencil.color.toUpperCase()}
                <input
                  type="color"
                  className="h-6 w-8 cursor-default rounded border border-line bg-white p-0.5"
                  value={pencil.color}
                  onChange={(event) => onChange({ color: event.currentTarget.value })}
                />
              </span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <RangeControl label="Grosor" min={1} max={38} value={Math.round(pencil.width)} onChange={(width) => onChange({ width })} />
            <RangeControl label="Opacidad" min={10} max={100} value={Math.round(pencil.opacity * 100)} onChange={(opacity) => onChange({ opacity: opacity / 100 })} />
            <RangeControl label="Suavizado" min={0} max={100} value={Math.round(pencil.smoothing * 100)} onChange={(smoothing) => onChange({ smoothing: smoothing / 100 })} />
            <label className="flex h-8 cursor-default items-center justify-between rounded-md border border-line px-2 text-[10px] font-semibold text-ink-secondary">
              Presión
              <input
                type="checkbox"
                className="cursor-default accent-[rgb(var(--accent))]"
                checked={pencil.pressure}
                onChange={(event) => onChange({ pressure: event.currentTarget.checked })}
              />
            </label>
            {pencil.pressure ? (
              <div className="col-span-2">
                <RangeControl label="Sensibilidad" min={0} max={100} value={Math.round((pencil.pressureSensitivity ?? 0.55) * 100)} onChange={(pressureSensitivity) => onChange({ pressureSensitivity: pressureSensitivity / 100 })} />
              </div>
            ) : null}
          </div>
          <PencilPreviewSample pencil={pencil} />
          {pendingDelete ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2">
              <div className="mb-2 text-[11px] font-semibold text-red-700">Eliminar este pencil?</div>
              <div className="flex justify-end gap-2">
                <button className="h-7 rounded-md border border-line bg-white px-2 text-[11px] font-medium text-ink-secondary hover:bg-panel" onClick={onCancelDelete}>
                  Cancelar
                </button>
                <button className="h-7 rounded-md bg-red-600 px-2 text-[11px] font-semibold text-white hover:bg-red-700" onClick={onConfirmDelete}>
                  Eliminar
                </button>
              </div>
            </div>
          ) : null}
        </div>
    </AnchoredConfigurationLayer>
  );
}

function drawSelectionControls(ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }, rotationRadians: number) {
  const handles = getSelectionHandles(bounds, rotationRadians);
  const rotationHandle = getSelectionRotationHandle(bounds, rotationRadians);
  drawSelectionControlGeometry(ctx, handles, rotationHandle);
}

function drawSelectionControlGeometry(
  ctx: CanvasRenderingContext2D,
  handles: Array<{ corner: SelectionCorner; scale: { x: number; y: number } }>,
  rotationHandle: { anchor: { x: number; y: number }; rotate: { x: number; y: number } },
) {
  ctx.save();
  ctx.strokeStyle = "#F37021";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  const corners = handles.map((handle) => handle.scale);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (const corner of corners.slice(1)) ctx.lineTo(corner.x, corner.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(rotationHandle.anchor.x, rotationHandle.anchor.y);
  ctx.lineTo(rotationHandle.rotate.x, rotationHandle.rotate.y);
  ctx.strokeStyle = "rgba(243,112,33,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (const handle of handles) {
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#F37021";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(handle.scale.x - 7, handle.scale.y - 7, 14, 14);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(rotationHandle.rotate.x, rotationHandle.rotate.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function getSelectionHandleAtPoint(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  rotationRadians: number,
): { corner: SelectionCorner; mode: SelectionHandleMode } | null {
  const rotationHandle = getSelectionRotationHandle(bounds, rotationRadians);
  if (distanceBetween(point, rotationHandle.rotate) <= 17) return { corner: "ne", mode: "rotate" };
  const handles = getSelectionHandles(bounds, rotationRadians);
  for (const handle of handles) {
    if (Math.abs(point.x - handle.scale.x) <= 13 && Math.abs(point.y - handle.scale.y) <= 13) return { corner: handle.corner, mode: "scale" };
  }
  return null;
}

function isSelectionPointerKind(kind: ActivePointer["kind"]) {
  return kind === "move-selection" || kind === "scale-selection" || kind === "rotate-selection";
}

function createSelectionInteractionState(
  page: HandwrittenNotePage,
  bounds: SelectionBounds,
  selectedStrokeIds: Set<string>,
  mode: SelectionInteractionMode,
  handle: { corner: SelectionCorner; mode: SelectionHandleMode } | null,
  startPoint: { x: number; y: number },
  selectionRotationRadians: number,
): SelectionInteractionState {
  const origin = mode === "rotate"
    ? getBoundsCenter(bounds)
    : mode === "scale" && handle
      ? getOppositeCorner(bounds, handle.corner)
      : getBoundsCenter(bounds);
  return {
    mode,
    sourcePage: cloneHandwrittenValue(page),
    sourceStrokes: cloneHandwrittenValue(page.strokes.filter((stroke) => selectedStrokeIds.has(stroke.id))),
    sourceBounds: { ...bounds },
    startPoint,
    currentPoint: startPoint,
    origin,
    startAngle: Math.atan2(startPoint.y - origin.y, startPoint.x - origin.x),
    startSelectionRotation: selectionRotationRadians,
    selectedStrokeIds: new Set(selectedStrokeIds),
    handle: handle ?? undefined,
  };
}

function getSelectionInteractionTransform(interaction: SelectionInteractionState): SelectionInteractionTransform {
  if (interaction.mode === "move") {
    return {
      origin: interaction.origin,
      translateX: interaction.currentPoint.x - interaction.startPoint.x,
      translateY: interaction.currentPoint.y - interaction.startPoint.y,
      scaleX: 1,
      scaleY: 1,
      rotationRadians: 0,
    };
  }
  if (interaction.mode === "rotate") {
    const currentAngle = Math.atan2(interaction.currentPoint.y - interaction.origin.y, interaction.currentPoint.x - interaction.origin.x);
    return {
      origin: interaction.origin,
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
      rotationRadians: currentAngle - interaction.startAngle,
    };
  }
  return {
    origin: interaction.origin,
    translateX: 0,
    translateY: 0,
    scaleX: clampScale((interaction.currentPoint.x - interaction.origin.x) / safeDenominator(interaction.startPoint.x - interaction.origin.x)),
    scaleY: clampScale((interaction.currentPoint.y - interaction.origin.y) / safeDenominator(interaction.startPoint.y - interaction.origin.y)),
    rotationRadians: 0,
  };
}

function hasMeaningfulSelectionTransform(mode: SelectionInteractionMode, transform: SelectionInteractionTransform) {
  if (mode === "move") return Math.hypot(transform.translateX, transform.translateY) >= 1;
  if (mode === "rotate") return Math.abs(transform.rotationRadians) >= 0.003;
  return Math.abs(transform.scaleX - 1) >= 0.003 || Math.abs(transform.scaleY - 1) >= 0.003;
}

function renderSelectionPreview(ctx: CanvasRenderingContext2D, activePointer: ActivePointer) {
  const interaction = activePointer.transform;
  if (!interaction) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const transform = getSelectionInteractionTransform(interaction);
  drawSelectionPreviewStrokes(ctx, interaction.sourceStrokes, transform);
  drawTransformedSelectionControls(ctx, interaction, transform);
}

function drawSelectionPreviewStrokes(ctx: CanvasRenderingContext2D, strokes: HandwrittenStroke[], transform: SelectionInteractionTransform) {
  ctx.save();
  applySelectionCanvasTransform(ctx, transform);
  for (const stroke of strokes) drawStroke(ctx, stroke, true);
  ctx.restore();
}

function applySelectionCanvasTransform(ctx: CanvasRenderingContext2D, transform: SelectionInteractionTransform) {
  ctx.translate(transform.translateX, transform.translateY);
  ctx.translate(transform.origin.x, transform.origin.y);
  ctx.rotate(transform.rotationRadians);
  ctx.scale(transform.scaleX, transform.scaleY);
  ctx.translate(-transform.origin.x, -transform.origin.y);
}

function drawTransformedSelectionControls(ctx: CanvasRenderingContext2D, interaction: SelectionInteractionState, transform: SelectionInteractionTransform) {
  const handles = getSelectionHandles(interaction.sourceBounds, interaction.startSelectionRotation)
    .map((handle) => ({ ...handle, scale: transformSelectionPoint(handle.scale, transform) }));
  const rotationHandle = getSelectionRotationHandle(interaction.sourceBounds, interaction.startSelectionRotation);
  const transformedRotationHandle = {
    anchor: transformSelectionPoint(rotationHandle.anchor, transform),
    rotate: transformSelectionPoint(rotationHandle.rotate, transform),
  };
  drawSelectionControlGeometry(ctx, handles, transformedRotationHandle);
}

function transformSelectionPoint(point: { x: number; y: number }, transform: SelectionInteractionTransform) {
  const scaledX = (point.x - transform.origin.x) * transform.scaleX;
  const scaledY = (point.y - transform.origin.y) * transform.scaleY;
  const cos = Math.cos(transform.rotationRadians);
  const sin = Math.sin(transform.rotationRadians);
  return {
    x: transform.origin.x + scaledX * cos - scaledY * sin + transform.translateX,
    y: transform.origin.y + scaledX * sin + scaledY * cos + transform.translateY,
  };
}

function getSelectionHandles(bounds: { x: number; y: number; width: number; height: number }, rotationRadians: number) {
  const center = getBoundsCenter(bounds);
  const corners: Array<{ corner: SelectionCorner; scale: { x: number; y: number } }> = [
    { corner: "nw", scale: { x: bounds.x, y: bounds.y } },
    { corner: "ne", scale: { x: bounds.x + bounds.width, y: bounds.y } },
    { corner: "se", scale: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } },
    { corner: "sw", scale: { x: bounds.x, y: bounds.y + bounds.height } },
  ];
  return corners.map((handle) => ({ ...handle, scale: rotatePoint(handle.scale, center, rotationRadians) }));
}

function getSelectionRotationHandle(bounds: { x: number; y: number; width: number; height: number }, rotationRadians: number) {
  const center = getBoundsCenter(bounds);
  const anchor = rotatePoint({ x: bounds.x + bounds.width / 2, y: bounds.y - 6 }, center, rotationRadians);
  const rotate = rotatePoint({ x: bounds.x + bounds.width / 2, y: bounds.y - 42 }, center, rotationRadians);
  return { anchor, rotate };
}

function getBoundsCenter(bounds: { x: number; y: number; width: number; height: number }) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function pointInRotatedBounds(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  rotationRadians: number,
  padding = 0,
) {
  const center = getBoundsCenter(bounds);
  const unrotatedPoint = rotatePoint(point, center, -rotationRadians);
  return unrotatedPoint.x >= bounds.x - padding
    && unrotatedPoint.x <= bounds.x + bounds.width + padding
    && unrotatedPoint.y >= bounds.y - padding
    && unrotatedPoint.y <= bounds.y + bounds.height + padding;
}

function getOppositeCorner(bounds: { x: number; y: number; width: number; height: number }, corner: SelectionCorner) {
  if (corner === "nw") return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
  if (corner === "ne") return { x: bounds.x, y: bounds.y + bounds.height };
  if (corner === "se") return { x: bounds.x, y: bounds.y };
  return { x: bounds.x + bounds.width, y: bounds.y };
}

function distanceBetween(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function rotatePoint(point: { x: number; y: number }, origin: { x: number; y: number }, rotationRadians: number) {
  if (rotationRadians === 0) return point;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

function safeDenominator(value: number) {
  return Math.abs(value) < 0.001 ? 1 : value;
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(0.15, value));
}

function RangeControl({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex h-8 cursor-default items-center gap-1.5 rounded-md border border-line px-2 text-[10px] font-medium text-ink-secondary">
      <span className="min-w-12">{label}</span>
      <input className="min-w-0 flex-1 cursor-default accent-[rgb(var(--accent))]" type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <span className="w-6 text-right tabular-nums text-ink-primary">{value}</span>
    </label>
  );
}

function PencilPreviewSample({ pencil }: { pencil: HandwrittenToolPreset }) {
  const samplePath = buildStrokeOutlinePath(PENCIL_PREVIEW_POINTS, {
    width: getPreviewStrokeWidth(pencil),
    smoothing: pencil.smoothing,
    pressure: pencil.pressure,
    pressureSensitivity: pencil.pressureSensitivity,
  });
  const isHighlighter = pencil.type === "highlighter";
  const isPencil = pencil.type === "pencil";

  return (
    <div className="rounded-md border border-line bg-panel px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-ink-secondary">
        <span>Muestra</span>
        <span className="font-medium text-ink-secondary">{getPencilTypeLabel(pencil.type)}</span>
      </div>
      <svg className="block h-12 w-full rounded bg-white" viewBox="0 0 300 54" role="img" aria-label="Muestra del pencil configurado">
        {isPencil ? (
          <defs>
            <clipPath id="pencil-preview-clip">
              <path d={samplePath} />
            </clipPath>
          </defs>
        ) : null}
        <path d="M 16 36 C 54 12, 82 42, 122 25 S 202 16, 284 30" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeLinecap="round" />
        {isHighlighter ? (
          <path d="M 18 32 C 58 18, 92 36, 130 26 S 210 20, 282 29" fill="none" stroke={pencil.color} strokeWidth={Math.max(10, pencil.width * 0.55)} strokeLinecap="round" strokeLinejoin="round" opacity={Math.min(0.68, Math.max(0.24, pencil.opacity))} />
        ) : null}
        {isPencil ? (
          <g clipPath="url(#pencil-preview-clip)">
            <path d={samplePath} fill={pencil.color} opacity={Math.min(0.38, pencil.opacity * 0.46)} />
            {PENCIL_PREVIEW_GRAIN.map((grain) => (
              <line
                key={grain.id}
                x1={grain.x}
                y1={grain.y}
                x2={grain.x + grain.length}
                y2={grain.y + grain.slope}
                stroke={pencil.color}
                strokeWidth={grain.width}
                strokeLinecap="round"
                opacity={Math.min(0.52, pencil.opacity * grain.opacity)}
              />
            ))}
          </g>
        ) : (
          <path d={samplePath} fill={pencil.color} opacity={isHighlighter ? Math.min(0.55, pencil.opacity) : pencil.opacity} />
        )}
      </svg>
    </div>
  );
}

const PENCIL_PREVIEW_POINTS: HandwrittenPoint[] = [
  [18, 35, 0.28, 0],
  [40, 24, 0.38, 12],
  [70, 20, 0.62, 24],
  [102, 32, 0.82, 36],
  [138, 28, 0.58, 48],
  [178, 18, 0.42, 60],
  [220, 22, 0.68, 72],
  [282, 30, 0.5, 84],
];

const PENCIL_PREVIEW_GRAIN = [
  { id: "g1", x: 22, y: 35, length: 32, slope: -3, width: 0.9, opacity: 0.58 },
  { id: "g2", x: 48, y: 25, length: 28, slope: 1, width: 0.7, opacity: 0.42 },
  { id: "g3", x: 76, y: 22, length: 38, slope: 5, width: 1.1, opacity: 0.64 },
  { id: "g4", x: 106, y: 32, length: 30, slope: -2, width: 0.8, opacity: 0.46 },
  { id: "g5", x: 140, y: 27, length: 44, slope: -8, width: 1, opacity: 0.62 },
  { id: "g6", x: 178, y: 19, length: 34, slope: 2, width: 0.75, opacity: 0.44 },
  { id: "g7", x: 216, y: 23, length: 52, slope: 5, width: 1.05, opacity: 0.68 },
  { id: "g8", x: 236, y: 31, length: 38, slope: -1, width: 0.7, opacity: 0.38 },
];

function getPreviewStrokeWidth(pencil: HandwrittenToolPreset) {
  if (pencil.type === "highlighter") return Math.max(10, Math.min(20, pencil.width * 0.6));
  if (pencil.type === "marker") return Math.max(5, Math.min(16, pencil.width * 0.5));
  if (pencil.type === "pencil") return Math.max(2, Math.min(11, pencil.width * 0.42));
  return Math.max(2, Math.min(13, pencil.width * 0.5));
}

function getThumbnailBackgroundStyle(page: HandwrittenNotePage) {
  return getBackgroundPreviewStyle(page.background.type);
}

function getBackgroundPreviewStyle(background: HandwrittenPageBackground) {
  if (background === "grid") {
    return {
      backgroundImage: "linear-gradient(#E5E7EB 1px, transparent 1px), linear-gradient(90deg, #E5E7EB 1px, transparent 1px)",
      backgroundSize: "12px 12px",
    };
  }
  if (background === "ruled" || background === "cornell") {
    return {
      backgroundImage: "linear-gradient(#E5E7EB 1px, transparent 1px)",
      backgroundSize: "100% 14px",
    };
  }
  if (background === "dots") {
    return {
      backgroundImage: "radial-gradient(#D1D5DB 1px, transparent 1px)",
      backgroundSize: "12px 12px",
    };
  }
  return {};
}

function getSheetSettingsPreviewStyle(page: HandwrittenNotePage) {
  return getScaledPageStyle(page, SHEET_SETTINGS_PREVIEW_MAX_WIDTH, SHEET_SETTINGS_PREVIEW_MAX_HEIGHT);
}

function getScaledPageStyle(page: HandwrittenNotePage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / page.size.width, maxHeight / page.size.height);
  return {
    width: Math.max(1, Math.round(page.size.width * scale)),
    height: Math.max(1, Math.round(page.size.height * scale)),
  };
}

function getViewportIndicatorStyle(viewport: PageViewport) {
  const width = Math.min(100, Math.max(6, viewport.width * 100));
  const height = Math.min(100, Math.max(6, viewport.height * 100));
  return {
    left: `${Math.min(100 - width, viewport.x * 100)}%`,
    top: `${Math.min(100 - height, viewport.y * 100)}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)));
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function arePageViewportsEqual(left: Record<string, PageViewport>, right: Record<string, PageViewport>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const leftViewport = left[key];
    const rightViewport = right[key];
    return Boolean(rightViewport)
      && Math.abs(leftViewport.x - rightViewport.x) < 0.001
      && Math.abs(leftViewport.y - rightViewport.y) < 0.001
      && Math.abs(leftViewport.width - rightViewport.width) < 0.001
      && Math.abs(leftViewport.height - rightViewport.height) < 0.001;
  });
}

export function cloneHandwrittenContentForEditor(content: HandwrittenNoteContent) {
  return cloneHandwrittenValue(content);
}
