import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, prosePluginsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { historyProviderConfig } from "@milkdown/kit/plugin/history";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Maximize2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent as ReactSyntheticEvent } from "react";
import {
  createMarkdownEditorController,
  readMarkdownEditorHistoryState,
  readMarkdownEditorFormatState,
} from "./editorCommands";
import { extractKnownextDiagramMetadata, stripKnownextDiagramMetadata, updateKnownextDiagramMetadata } from "./mermaidDiagrams";
import {
  configureUnderlineMarkdownSerialization,
  remarkUnderlineHtmlPlugin,
  toggleUnderlineCommand,
  underlineSchema,
} from "./underlineExtension";
import { createMermaidDiagramPlugin, createMermaidDiagramViewPlugin } from "./mermaidNodeView";
import { VisualMediaViewer, type VisualMediaViewerMedia } from "./VisualMediaViewer";
import type { MarkdownEditorChangeSource, MarkdownEditorController, MarkdownEditorDiagramEditTarget, MarkdownEditorFormatState, MarkdownEditorHistoryState, MarkdownEditorImageEditTarget } from "./editorTypes";
import type { MarkdownEditorSelection } from "./editorTypes";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./MarkdownEditor.css";

type MarkdownEditorProps = {
  documentKey: string;
  markdown: string;
  onChange: (markdown: string, source?: MarkdownEditorChangeSource) => void;
  onControllerChange: (controller: MarkdownEditorController | null) => void;
  onFormatStateChange: (formatState: MarkdownEditorFormatState) => void;
  onHistoryStateChange: (historyState: MarkdownEditorHistoryState) => void;
  onSelectionChange: (selection: MarkdownEditorSelection | null) => void;
  onImageEditRequest?: (target: MarkdownEditorImageEditTarget) => void;
  onDiagramEditRequest?: (target: MarkdownEditorDiagramEditTarget) => void;
  selectionFocus?: MarkdownEditorSelection | null;
  zoomPercent: number;
};

type MarkdownEditorCallbacks = {
  onChange: (markdown: string, source?: MarkdownEditorChangeSource) => void;
  onControllerChange: (controller: MarkdownEditorController | null) => void;
  onFormatStateChange: (formatState: MarkdownEditorFormatState) => void;
  onHistoryStateChange: (historyState: MarkdownEditorHistoryState) => void;
  onSelectionChange: (selection: MarkdownEditorSelection | null) => void;
  onImageEditRequest?: (target: MarkdownEditorImageEditTarget) => void;
  onDiagramEditRequest?: (target: MarkdownEditorDiagramEditTarget) => void;
};

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <MilkdownProvider key={props.documentKey}>
      <MilkdownInstance {...props} />
    </MilkdownProvider>
  );
}

const selectionFocusPluginKey = new PluginKey<SelectionFocusRange | null>("knownext-selection-focus");
const transientTextPluginKey = new PluginKey<TransientTextPreview | null>("knownext-transient-text-preview");
const persistentCaretPluginKey = new PluginKey<PersistentCaretState>("knownext-persistent-caret");

function MilkdownInstance({ markdown, onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest, onDiagramEditRequest, selectionFocus, zoomPercent }: MarkdownEditorProps) {
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const skipInitialUpdate = useRef(true);
  const lastMarkdownRef = useRef(markdown);
  const lastFormatStateRef = useRef<MarkdownEditorFormatState>({});
  const lastHistoryStateRef = useRef<MarkdownEditorHistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  const lastSelectionRef = useRef<MarkdownEditorSelection | null>(null);
  const callbacksRef = useRef<MarkdownEditorCallbacks>({ onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest, onDiagramEditRequest });
  const controllerReadyRef = useRef(false);
  const imageEditOverlayElementRef = useRef<HTMLImageElement | null>(null);
  const diagramEditOverlayElementRef = useRef<HTMLElement | null>(null);
  const [imageEditOverlay, setImageEditOverlay] = useState<ImageEditOverlayState | null>(null);
  const [diagramEditOverlay, setDiagramEditOverlay] = useState<DiagramEditOverlayState | null>(null);
  const [mediaViewer, setMediaViewer] = useState<VisualMediaViewerMedia | null>(null);

  useEffect(() => {
    callbacksRef.current = { onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest, onDiagramEditRequest };
  }, [onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest, onDiagramEditRequest]);

  const { loading, get } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: markdown,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.LinkTooltip]: false,
        [Crepe.Feature.Toolbar]: false,
      },
    });

    crepe.editor.config((ctx) => {
      ctx.update(historyProviderConfig.key, (config) => ({ ...config, depth: 100, newGroupDelay: 500 }));
      ctx.update(prosePluginsCtx, (plugins) => [
        createMermaidDiagramPlugin((target) => callbacksRef.current.onDiagramEditRequest?.(target)),
        ...plugins,
        createSelectionFocusPlugin(),
        createTransientTextPreviewPlugin(),
        createPersistentCaretPlugin(),
      ]);
      configureUnderlineMarkdownSerialization(ctx);
    });
    crepe.editor.use(createMermaidDiagramViewPlugin((target) => callbacksRef.current.onDiagramEditRequest?.(target)));
    crepe.editor.use(remarkUnderlineHtmlPlugin).use(underlineSchema).use(toggleUnderlineCommand);

    crepe.on((listener) => {
      const syncFormatState = (ctx: Ctx, selection?: Selection) => {
        let view: EditorView | undefined;
        try {
          view = ctx.get(editorViewCtx);
        } catch {
          return;
        }

        if (!view?.state) return;

        viewRef.current = view;
        const state = getStateForFormat(view.state, selection);
        notifyFormatState(readMarkdownEditorFormatState(state));
        notifyHistoryState(readMarkdownEditorHistoryState(view.state));
        syncSelectionFocus(view, state);
      };

      listener.mounted((ctx) => {
        syncFormatState(ctx);
        normalizeRenderedImageBlocks(viewRef.current);
      });
      listener.selectionUpdated((ctx, selection) => syncFormatState(ctx, selection));
      listener.updated((ctx) => {
        syncFormatState(ctx);
        normalizeRenderedImageBlocks(viewRef.current);
      });
      listener.markdownUpdated((_ctx, nextMarkdown) => {
        const initialUpdate = skipInitialUpdate.current;
        if (skipInitialUpdate.current) {
          skipInitialUpdate.current = false;
          if (nextMarkdown === lastMarkdownRef.current) return;
        }
        if (nextMarkdown === lastMarkdownRef.current) return;

        lastMarkdownRef.current = nextMarkdown;
        callbacksRef.current.onChange(nextMarkdown, initialUpdate ? "initial-normalization" : "user");
      });
    });

    return crepe;
  }, []);

  useEffect(() => {
    if (loading || controllerReadyRef.current) return;

    const editor = get();
    if (editor) {
      controllerReadyRef.current = true;
      const controller = createMarkdownEditorController(editor, selectionFocusPluginKey, transientTextPluginKey);
      callbacksRef.current.onControllerChange(controller);
      notifyFormatState(controller.getFormatState());
      notifyHistoryState(controller.getHistoryState());
    }
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    const editor = get();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      applySelectionFocusDecoration(view, selectionFocus ?? null);
    });
  }, [get, loading, selectionFocus?.from, selectionFocus?.to]);

  useEffect(() => {
    return () => callbacksRef.current.onControllerChange(null);
  }, []);

  useEffect(() => {
    const normalizeImages = () => normalizeRenderedImageBlocks(viewRef.current);
    window.addEventListener("resize", normalizeImages);
    return () => window.removeEventListener("resize", normalizeImages);
  }, []);

  useEffect(() => {
    if (!imageEditOverlay) return;

    const syncImageEditOverlayPosition = () => {
      const imageElement = imageEditOverlayElementRef.current;
      const view = viewRef.current;
      if (!imageElement || !view || !document.contains(imageElement)) {
        imageEditOverlayElementRef.current = null;
        setImageEditOverlay(null);
        return;
      }

      const target = findImageEditTarget(view, imageElement);
      if (!target) {
        imageEditOverlayElementRef.current = null;
        setImageEditOverlay(null);
        return;
      }

      const nextOverlay = buildImageEditOverlayState(imageElement, target);
      setImageEditOverlay((currentOverlay) => (imageEditOverlayStatesAreEqual(currentOverlay, nextOverlay) ? currentOverlay : nextOverlay));
    };

    window.addEventListener("scroll", syncImageEditOverlayPosition, true);
    window.addEventListener("resize", syncImageEditOverlayPosition);
    return () => {
      window.removeEventListener("scroll", syncImageEditOverlayPosition, true);
      window.removeEventListener("resize", syncImageEditOverlayPosition);
    };
  }, [imageEditOverlay]);

  useEffect(() => {
    if (!diagramEditOverlay) return;

    const syncDiagramEditOverlayPosition = () => {
      const diagramElement = diagramEditOverlayElementRef.current;
      const view = viewRef.current;
      if (!diagramElement || !view || !document.contains(diagramElement)) {
        diagramEditOverlayElementRef.current = null;
        setDiagramEditOverlay(null);
        return;
      }

      const target = findDiagramEditTarget(view, diagramElement);
      if (!target) {
        diagramEditOverlayElementRef.current = null;
        setDiagramEditOverlay(null);
        return;
      }

      const nextOverlay = buildDiagramEditOverlayState(diagramElement, target);
      setDiagramEditOverlay((currentOverlay) => (diagramEditOverlayStatesAreEqual(currentOverlay, nextOverlay) ? currentOverlay : nextOverlay));
    };

    window.addEventListener("scroll", syncDiagramEditOverlayPosition, true);
    window.addEventListener("resize", syncDiagramEditOverlayPosition);
    return () => {
      window.removeEventListener("scroll", syncDiagramEditOverlayPosition, true);
      window.removeEventListener("resize", syncDiagramEditOverlayPosition);
    };
  }, [diagramEditOverlay]);

  return (
    <div
      ref={editorShellRef}
      className="knownext-editor"
      style={{ "--knownext-markdown-zoom": String(zoomPercent / 100) } as CSSProperties}
      onMouseMove={handleEditorMouseMove}
      onMouseLeave={() => {
        imageEditOverlayElementRef.current = null;
        diagramEditOverlayElementRef.current = null;
        setImageEditOverlay(null);
        setDiagramEditOverlay(null);
      }}
      onPointerDownCapture={handleEditorPointerDown}
      onLoadCapture={handleEditorMediaLoad}
    >
      <Milkdown />
      {imageEditOverlay ? (
        <div
          className="knownext-image-edit-overlay"
          data-knownext-media-overlay="true"
          role="toolbar"
          aria-label="Acciones de imagen"
          style={{ left: imageEditOverlay.left, top: imageEditOverlay.top }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="knownext-image-edit-action"
            title="Editar imagen"
            aria-label="Editar imagen"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              callbacksRef.current.onImageEditRequest?.(imageEditOverlay.target);
            }}
          >
            <Pencil size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="knownext-image-edit-action"
            title="Resetear tamaño"
            aria-label="Resetear tamaño"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resetImageSizeAtPosition(viewRef.current, imageEditOverlay.target.position);
            }}
          >
            <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="knownext-image-edit-action"
            title="Pantalla completa"
            aria-label="Pantalla completa"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const media = buildImageViewerMedia(imageEditOverlayElementRef.current, imageEditOverlay.target);
              if (media) setMediaViewer(media);
            }}
          >
            <Maximize2 size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="knownext-image-edit-action knownext-image-edit-action-danger"
            title="Eliminar imagen"
            aria-label="Eliminar imagen"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (deleteImageAtPosition(viewRef.current, imageEditOverlay.target.position)) {
                setImageEditOverlay(null);
              }
            }}
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {diagramEditOverlay ? (
        <div
          className="knownext-image-edit-overlay"
          data-knownext-media-overlay="true"
          role="toolbar"
          aria-label="Acciones de diagrama"
          style={{ left: diagramEditOverlay.left, top: diagramEditOverlay.top }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="knownext-image-edit-action"
            title="Editar diagrama"
            aria-label="Editar diagrama"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              callbacksRef.current.onDiagramEditRequest?.(diagramEditOverlay.target);
            }}
          >
            <Pencil size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="knownext-image-edit-action"
            title="Resetear tamaño"
            aria-label="Resetear tamaño"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              resetDiagramSizeAtPosition(viewRef.current, diagramEditOverlay.target.position);
            }}
          >
            <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="knownext-image-edit-action"
            title="Pantalla completa"
            aria-label="Pantalla completa"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const media = buildDiagramViewerMedia(diagramEditOverlayElementRef.current, diagramEditOverlay.target);
              if (media) setMediaViewer(media);
            }}
          >
            <Maximize2 size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="knownext-image-edit-action knownext-image-edit-action-danger"
            title="Eliminar diagrama"
            aria-label="Eliminar diagrama"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (deleteDiagramAtPosition(viewRef.current, diagramEditOverlay.target.position, diagramEditOverlay.target.nodeSize)) {
                setDiagramEditOverlay(null);
              }
            }}
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {mediaViewer ? <VisualMediaViewer media={mediaViewer} onClose={() => setMediaViewer(null)} /> : null}
    </div>
  );

  function handleEditorMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    if (eventTarget.closest("[data-knownext-media-viewer]")) return;
    if (eventTarget.closest(".knownext-image-edit-overlay")) return;

    const imageElement = eventTarget.closest("img");
    const view = viewRef.current;
    if (!view) return;

    if (callbacksRef.current.onImageEditRequest && imageElement instanceof HTMLImageElement && event.currentTarget.contains(imageElement)) {
      const target = findImageEditTarget(view, imageElement);
      if (!target) {
        imageEditOverlayElementRef.current = null;
        setImageEditOverlay(null);
        return;
      }

      imageEditOverlayElementRef.current = imageElement;
      diagramEditOverlayElementRef.current = null;
      setDiagramEditOverlay(null);
      const nextOverlay = buildImageEditOverlayState(imageElement, target);
      setImageEditOverlay((currentOverlay) => (imageEditOverlayStatesAreEqual(currentOverlay, nextOverlay) ? currentOverlay : nextOverlay));
      return;
    }

    const diagramElement = eventTarget.closest(".knownext-mermaid-diagram");
    if (callbacksRef.current.onDiagramEditRequest && diagramElement instanceof HTMLElement && event.currentTarget.contains(diagramElement)) {
      const target = findDiagramEditTarget(view, diagramElement);
      if (!target) {
        diagramEditOverlayElementRef.current = null;
        setDiagramEditOverlay(null);
        return;
      }

      diagramEditOverlayElementRef.current = diagramElement;
      imageEditOverlayElementRef.current = null;
      setImageEditOverlay(null);
      const nextOverlay = buildDiagramEditOverlayState(diagramElement, target);
      setDiagramEditOverlay((currentOverlay) => (diagramEditOverlayStatesAreEqual(currentOverlay, nextOverlay) ? currentOverlay : nextOverlay));
      return;
    }

    imageEditOverlayElementRef.current = null;
    diagramEditOverlayElementRef.current = null;
    setImageEditOverlay(null);
    setDiagramEditOverlay(null);
  }

  function handleEditorPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    if (eventTarget.closest("[data-knownext-media-viewer]")) return;

    const resizeHandle = eventTarget.closest(".image-resize-handle");
    if (!resizeHandle || !event.currentTarget.contains(resizeHandle)) return;

    const imageElement = resizeHandle.closest(".image-wrapper")?.querySelector("img[data-type='image-block'], img");
    if (!(imageElement instanceof HTMLImageElement)) return;

    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    const view = viewRef.current;
    const image = view ? findImageEditTarget(view, imageElement) : null;
    const metrics = calculateImageSizingMetrics(imageElement);
    if (!metrics) return;

    const startPointerY = event.clientY;
    const startRect = imageElement.getBoundingClientRect();
    const startWidth = clampNumber(startRect.width || metrics.defaultWidth, metrics.minWidth, metrics.availableWidth);
    const widthPerHeightPixel = imageElement.naturalWidth / imageElement.naturalHeight;
    const restoreCursor = document.body.style.cursor;
    const restoreUserSelect = document.body.style.userSelect;
    let latestRatio = calculateImageVisualRatio(startWidth, metrics);

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    applyManualImageSize(imageElement, startWidth);

    const syncOverlay = () => {
      if (!image) return;
      const nextOverlay = buildImageEditOverlayState(imageElement, image);
      setImageEditOverlay((currentOverlay) => (imageEditOverlayStatesAreEqual(currentOverlay, nextOverlay) ? currentOverlay : nextOverlay));
    };

    const resize = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const nextWidth = clampNumber(startWidth + (moveEvent.clientY - startPointerY) * widthPerHeightPixel, metrics.minWidth, metrics.availableWidth);
      applyManualImageSize(imageElement, nextWidth);
      latestRatio = calculateImageVisualRatio(nextWidth, metrics);
      syncOverlay();
    };

    const stop = () => {
      document.body.style.cursor = restoreCursor;
      document.body.style.userSelect = restoreUserSelect;
      if (view && image && latestRatio) {
        updateImageRatioAtPosition(view, image.position, latestRatio);
      }
      syncOverlay();
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    syncOverlay();
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function handleEditorMediaLoad(event: ReactSyntheticEvent<HTMLDivElement>) {
    const eventTarget = event.target;
    if (!(eventTarget instanceof HTMLImageElement) || eventTarget.dataset.type !== "image-block") return;
    window.requestAnimationFrame(() => normalizeRenderedImageElementSize(eventTarget, { view: viewRef.current }));
  }

  function notifyFormatState(formatState: MarkdownEditorFormatState) {
    if (formatStatesAreEqual(lastFormatStateRef.current, formatState)) return;

    lastFormatStateRef.current = formatState;
    callbacksRef.current.onFormatStateChange(formatState);
  }

  function notifyHistoryState(historyState: MarkdownEditorHistoryState) {
    if (historyStatesAreEqual(lastHistoryStateRef.current, historyState)) return;

    lastHistoryStateRef.current = historyState;
    callbacksRef.current.onHistoryStateChange(historyState);
  }

  function syncSelectionFocus(view: EditorView, state: EditorState) {
    const selection = readEditorSelection(state);
    if (selection) {
      notifySelection(selection);
      applySelectionFocusDecoration(view, selection);
      return;
    }

    if (view.hasFocus()) {
      notifySelection(null);
      applySelectionFocusDecoration(view, null);
    }
  }

  function notifySelection(selection: MarkdownEditorSelection | null) {
    if (editorSelectionsAreEqual(lastSelectionRef.current, selection)) return;

    lastSelectionRef.current = selection;
    callbacksRef.current.onSelectionChange(selection);
  }
}

type SelectionFocusRange = {
  from: number;
  to: number;
};

type TransientTextPreview = {
  position: number;
  text: string;
};

type PersistentCaretState = {
  focused: boolean;
  collapsed: boolean;
  position: number | null;
};

function createSelectionFocusPlugin() {
  return new Plugin<SelectionFocusRange | null>({
    key: selectionFocusPluginKey,
    state: {
      init: () => null,
      apply(transaction, value) {
        const meta = transaction.getMeta(selectionFocusPluginKey);
        if (meta !== undefined) return meta as SelectionFocusRange | null;
        if (!value || !transaction.docChanged) return value;

        const from = transaction.mapping.map(value.from, -1);
        const to = transaction.mapping.map(value.to, 1);
        return from < to && from >= 0 && to <= transaction.doc.content.size ? { from, to } : null;
      },
    },
    props: {
      decorations(state) {
        const range = selectionFocusPluginKey.getState(state);
        if (!range) return null;
        const decorations = [
          Decoration.inline(range.from, range.to, { class: "knownext-selection-focus" }),
        ];

        state.doc.nodesBetween(range.from, range.to, (node, position) => {
          if (position < range.to && position + node.nodeSize > range.from && isSelectionMediaNode(node)) {
            decorations.push(Decoration.node(position, position + node.nodeSize, { class: "knownext-selection-media" }));
          }
          return true;
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

function createTransientTextPreviewPlugin() {
  return new Plugin<TransientTextPreview | null>({
    key: transientTextPluginKey,
    state: {
      init: () => null,
      apply(transaction, value) {
        const meta = transaction.getMeta(transientTextPluginKey);
        if (meta !== undefined) return meta as TransientTextPreview | null;
        if (!value || !transaction.docChanged) return value;

        const position = transaction.mapping.map(value.position, 1);
        return position >= 0 && position <= transaction.doc.content.size ? { ...value, position } : null;
      },
    },
    props: {
      decorations(state) {
        const preview = transientTextPluginKey.getState(state);
        if (!preview?.text) return null;
        const widget = Decoration.widget(preview.position, () => {
          const span = document.createElement("span");
          span.className = "knownext-dictation-preview";
          span.textContent = preview.text;
          return span;
        }, { side: 1 });
        return DecorationSet.create(state.doc, [widget]);
      },
    },
  });
}

function createPersistentCaretPlugin() {
  return new Plugin<PersistentCaretState>({
    key: persistentCaretPluginKey,
    state: {
      init: (_config, state) => ({
        focused: false,
        collapsed: state.selection.empty,
        position: state.selection.empty ? state.selection.from : null,
      }),
      apply(transaction, value) {
        const meta = transaction.getMeta(persistentCaretPluginKey) as { focused?: boolean } | undefined;
        const mappedPosition = value.position === null ? null : clampDocumentPosition(transaction.mapping.map(value.position, -1), transaction.doc.content.size);
        const nextState: PersistentCaretState = {
          focused: meta?.focused ?? value.focused,
          collapsed: value.collapsed,
          position: mappedPosition,
        };

        if (transaction.selectionSet) {
          nextState.collapsed = transaction.selection.empty;
          nextState.position = transaction.selection.empty ? transaction.selection.from : null;
        }

        return nextState;
      },
    },
    props: {
      handleDOMEvents: {
        focus(view) {
          view.dispatch(view.state.tr.setMeta(persistentCaretPluginKey, { focused: true }));
          return false;
        },
        focusin(view) {
          view.dispatch(view.state.tr.setMeta(persistentCaretPluginKey, { focused: true }));
          return false;
        },
        blur(view) {
          view.dispatch(view.state.tr.setMeta(persistentCaretPluginKey, { focused: false }));
          return false;
        },
        focusout(view) {
          view.dispatch(view.state.tr.setMeta(persistentCaretPluginKey, { focused: false }));
          return false;
        },
      },
      decorations(state) {
        const caret = persistentCaretPluginKey.getState(state);
        if (!caret || caret.focused || !caret.collapsed || caret.position === null) return null;

        const widget = Decoration.widget(
          caret.position,
          () => {
            const span = document.createElement("span");
            span.className = "knownext-editor-static-caret";
            span.setAttribute("aria-hidden", "true");
            return span;
          },
          { side: -1 },
        );

        return DecorationSet.create(state.doc, [widget]);
      },
    },
  });
}

type ImageEditOverlayState = {
  left: number;
  top: number;
  target: MarkdownEditorImageEditTarget;
};

type DiagramEditOverlayState = {
  left: number;
  top: number;
  target: MarkdownEditorDiagramEditTarget;
};

function buildImageEditOverlayState(imageElement: HTMLImageElement, target: MarkdownEditorImageEditTarget): ImageEditOverlayState {
  const imageRect = imageElement.getBoundingClientRect();
  return {
    left: Math.round(imageRect.right - 8),
    top: Math.round(imageRect.top + 8),
    target,
  };
}

function buildDiagramEditOverlayState(diagramElement: HTMLElement, target: MarkdownEditorDiagramEditTarget): DiagramEditOverlayState {
  const diagramRect = diagramElement.getBoundingClientRect();
  return {
    left: Math.round(diagramRect.right - 8),
    top: Math.round(diagramRect.top + 8),
    target,
  };
}

function isEditableImageNode(node: EditorState["doc"]) {
  const typeName = node.type.name.toLowerCase();
  return typeName.includes("image") && (typeof node.attrs.src === "string" || typeof node.attrs.url === "string");
}

function isMermaidDiagramNode(node: ProseMirrorNode) {
  return node.type.name === "code_block" && readStringNodeAttribute(node.attrs.language).trim().toLowerCase() === "mermaid";
}

function isSelectionMediaNode(node: ProseMirrorNode) {
  const typeName = node.type.name.toLowerCase();
  if (typeName.includes("image") && (typeof node.attrs.src === "string" || typeof node.attrs.url === "string")) return true;
  return typeName === "code_block" && readStringNodeAttribute(node.attrs.language).trim().toLowerCase() === "mermaid";
}

function findImageEditTarget(view: EditorView, imageElement: HTMLImageElement): MarkdownEditorImageEditTarget | null {
  const positionMatch = findImageNodeNearDomPosition(view, imageElement);
  if (positionMatch) return imageNodeToEditTarget(positionMatch.node, positionMatch.position);

  const sourceMatch = findImageNodeByRenderedSource(view.state, imageElement);
  return sourceMatch ? imageNodeToEditTarget(sourceMatch.node, sourceMatch.position) : null;
}

function findDiagramEditTarget(view: EditorView, diagramElement: HTMLElement): MarkdownEditorDiagramEditTarget | null {
  const positionMatch = findDiagramNodeNearDomPosition(view, diagramElement);
  return positionMatch ? diagramNodeToEditTarget(positionMatch.node, positionMatch.position) : null;
}

function findDiagramNodeNearDomPosition(view: EditorView, diagramElement: HTMLElement) {
  try {
    const position = view.posAtDOM(diagramElement, 0);
    return findDiagramNodeNearPosition(view.state, position);
  } catch {
    return null;
  }
}

function findDiagramNodeNearPosition(state: EditorState, position: number): { node: EditorState["doc"]; position: number } | null {
  const boundedPosition = clampDocumentPosition(position, state.doc.content.size);
  const directPositions = [boundedPosition, boundedPosition - 1, boundedPosition + 1]
    .filter((candidatePosition) => candidatePosition >= 0 && candidatePosition <= state.doc.content.size);

  for (const candidatePosition of directPositions) {
    const candidateNode = state.doc.nodeAt(candidatePosition);
    if (candidateNode && isMermaidDiagramNode(candidateNode)) return { node: candidateNode, position: candidatePosition };
  }

  let match: { node: EditorState["doc"]; position: number } | null = null;
  const from = Math.max(0, boundedPosition - 8);
  const to = Math.min(state.doc.content.size, boundedPosition + 8);
  state.doc.nodesBetween(from, to, (node, nodePosition) => {
    if (!match && isMermaidDiagramNode(node)) {
      match = { node, position: nodePosition };
      return false;
    }
    return !match;
  });

  return match;
}

function diagramNodeToEditTarget(node: EditorState["doc"], position: number): MarkdownEditorDiagramEditTarget {
  const code = node.textContent;
  const metadata = extractKnownextDiagramMetadata(code);
  return {
    position,
    nodeSize: node.nodeSize,
    code: stripKnownextDiagramMetadata(code),
    caption: metadata.caption ?? null,
    width: metadata.width ?? null,
    widthRatio: metadata.widthRatio ?? null,
  };
}

function findImageNodeNearDomPosition(view: EditorView, imageElement: HTMLImageElement) {
  try {
    const position = view.posAtDOM(imageElement, 0);
    return findImageNodeNearPosition(view.state, position);
  } catch {
    return null;
  }
}

function findImageNodeNearPosition(state: EditorState, position: number): { node: EditorState["doc"]; position: number } | null {
  const boundedPosition = clampDocumentPosition(position, state.doc.content.size);
  const directPositions = [boundedPosition, boundedPosition - 1, boundedPosition + 1]
    .filter((candidatePosition) => candidatePosition >= 0 && candidatePosition <= state.doc.content.size);

  for (const candidatePosition of directPositions) {
    const candidateNode = state.doc.nodeAt(candidatePosition);
    if (candidateNode && isEditableImageNode(candidateNode)) return { node: candidateNode, position: candidatePosition };
  }

  let match: { node: EditorState["doc"]; position: number } | null = null;
  const from = Math.max(0, boundedPosition - 8);
  const to = Math.min(state.doc.content.size, boundedPosition + 8);
  state.doc.nodesBetween(from, to, (node, nodePosition) => {
    if (!match && isEditableImageNode(node)) {
      match = { node, position: nodePosition };
      return false;
    }
    return !match;
  });

  return match;
}

function resetImageSizeAtPosition(view: EditorView | null, position: number) {
  if (!view) return false;

  const image = findImageNodeNearPosition(view.state, position);
  if (!image) return false;

  const resetRenderedImage = () => resetRenderedImageElementSize(view, image.node, image.position);
  const attrs = { ...image.node.attrs };
  let changed = false;

  if ("ratio" in attrs) {
    changed = attrs.ratio !== 1;
    attrs.ratio = 1;
  }

  for (const attributeName of ["width", "height", "style"]) {
    if (attributeName in attrs) {
      delete attrs[attributeName];
      changed = true;
    }
  }

  resetRenderedImage();

  if (!changed) {
    view.focus();
    return true;
  }

  const transaction = view.state.tr.setNodeMarkup(image.position, undefined, attrs).scrollIntoView();
  view.dispatch(transaction);
  window.requestAnimationFrame(resetRenderedImage);
  view.focus();
  return true;
}

function resetDiagramSizeAtPosition(view: EditorView | null, position: number) {
  if (!view) return false;

  const diagram = findDiagramNodeNearPosition(view.state, position);
  if (!diagram) return false;

  const nextCode = updateKnownextDiagramMetadata(diagram.node.textContent, {
    width: null,
    widthRatio: null,
  });
  const from = diagram.position + 1;
  const to = diagram.position + diagram.node.nodeSize - 1;
  const transaction = view.state.tr.replaceWith(from, to, view.state.schema.text(nextCode)).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
}

function buildImageViewerMedia(imageElement: HTMLImageElement | null, target: MarkdownEditorImageEditTarget): VisualMediaViewerMedia | null {
  const src = imageElement?.currentSrc || imageElement?.src || target.src;
  if (!src) return null;
  return {
    kind: "image",
    src,
    alt: target.alt,
  };
}

function buildDiagramViewerMedia(diagramElement: HTMLElement | null, target: MarkdownEditorDiagramEditTarget): VisualMediaViewerMedia | null {
  const svg = diagramElement?.querySelector(".knownext-mermaid-diagram-viewport svg");
  if (!(svg instanceof SVGElement) && !target.code.trim()) return null;
  return {
    kind: "diagram",
    svg: svg instanceof SVGElement ? svg.outerHTML : null,
    code: target.code,
    label: target.caption || "Diagrama",
  };
}

function resetRenderedImageElementSize(view: EditorView, node: EditorState["doc"], position: number) {
  const renderedImage = findRenderedImageElement(view, node, position);
  if (!renderedImage) return false;

  applyAutomaticImageSize(renderedImage);
  return true;
}

type RenderedImageSizeResult = {
  ratio: number;
  width: number;
};

function normalizeRenderedImageBlocks(view: EditorView | null) {
  if (!view?.dom) return;

  const images = Array.from(view.dom.querySelectorAll("img[data-type='image-block']"));
  for (const imageElement of images) {
    if (!(imageElement instanceof HTMLImageElement)) continue;
    normalizeRenderedImageElementSize(imageElement, { view });
  }
}

function normalizeRenderedImageElementSize(
  imageElement: HTMLImageElement,
  options: { view?: EditorView | null; forceManual?: boolean } = {},
): RenderedImageSizeResult | null {
  if (!imageElement.naturalWidth || !imageElement.naturalHeight) return null;

  const metrics = calculateImageSizingMetrics(imageElement);
  if (!metrics) return null;

  const nodeRatio = options.view ? findImageNodeNearDomPosition(options.view, imageElement)?.node.attrs.ratio : null;
  const storedRatio = readImageRatio(nodeRatio);
  const proposedHeight = options.forceManual ? readRenderedImageHeight(imageElement) : null;
  const proposedWidth = proposedHeight ? proposedHeight * (imageElement.naturalWidth / imageElement.naturalHeight) : metrics.defaultWidth * storedRatio;
  const targetWidth = clampNumber(proposedWidth, metrics.minWidth, metrics.availableWidth);

  if (!options.forceManual && Math.abs(storedRatio - 1) < 0.01) {
    applyAutomaticImageSize(imageElement);
    return { ratio: 1, width: metrics.defaultWidth };
  }

  applyManualImageSize(imageElement, targetWidth);
  return { ratio: calculateImageVisualRatio(targetWidth, metrics), width: targetWidth };
}

function calculateImageSizingMetrics(imageElement: HTMLImageElement) {
  const naturalWidth = imageElement.naturalWidth;
  const naturalHeight = imageElement.naturalHeight;
  if (!naturalWidth || !naturalHeight) return null;

  const imageBlock = imageElement.closest(".milkdown-image-block");
  const availableWidth = imageBlock?.getBoundingClientRect().width ?? imageElement.parentElement?.getBoundingClientRect().width ?? imageElement.getBoundingClientRect().width;
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return null;

  const defaultWidth = Math.max(1, availableWidth * getResponsiveImageDefaultWidthRatio());
  const minWidth = Math.min(100 * (naturalWidth / naturalHeight), defaultWidth, availableWidth);

  return {
    availableWidth,
    defaultWidth,
    minWidth: Math.max(48, minWidth),
  };
}

function applyAutomaticImageSize(imageElement: HTMLImageElement) {
  const wrapper = imageElement.closest(".image-wrapper");
  if (wrapper instanceof HTMLElement) {
    wrapper.dataset.knownextImageSize = "auto";
    wrapper.style.removeProperty("width");
    wrapper.style.removeProperty("height");
    wrapper.style.removeProperty("min-height");
    wrapper.style.removeProperty("max-height");
    wrapper.style.removeProperty("aspect-ratio");
  }

  imageElement.dataset.knownextImageSize = "auto";
  imageElement.style.removeProperty("width");
  imageElement.style.removeProperty("height");
  imageElement.style.removeProperty("min-height");
  imageElement.style.removeProperty("max-height");
  imageElement.style.removeProperty("aspect-ratio");
  delete imageElement.dataset.height;
  imageElement.setAttribute("ratio", "1");
}

function applyManualImageSize(imageElement: HTMLImageElement, targetWidth: number) {
  const wrapper = imageElement.closest(".image-wrapper");
  const width = Math.max(48, targetWidth);
  const height = width * (imageElement.naturalHeight / imageElement.naturalWidth);

  if (wrapper instanceof HTMLElement) {
    wrapper.dataset.knownextImageSize = "manual";
    wrapper.style.width = `${width.toFixed(2)}px`;
    wrapper.style.height = "auto";
    wrapper.style.removeProperty("min-height");
    wrapper.style.removeProperty("max-height");
    wrapper.style.removeProperty("aspect-ratio");
  }

  imageElement.dataset.knownextImageSize = "manual";
  imageElement.dataset.height = height.toFixed(2);
  imageElement.style.width = "100%";
  imageElement.style.height = "auto";
  imageElement.style.removeProperty("min-height");
  imageElement.style.removeProperty("max-height");
  imageElement.style.removeProperty("aspect-ratio");
}

function updateImageRatioAtPosition(view: EditorView, position: number, ratio: number) {
  const image = findImageNodeNearPosition(view.state, position);
  if (!image) return false;

  const nextRatio = Number.parseFloat(ratio.toFixed(2));
  const currentRatio = readImageRatio(image.node.attrs.ratio);
  if (Math.abs(currentRatio - nextRatio) < 0.01) return false;

  const attrs = { ...image.node.attrs, ratio: nextRatio };
  view.dispatch(view.state.tr.setNodeMarkup(image.position, undefined, attrs).scrollIntoView());
  window.requestAnimationFrame(() => normalizeRenderedImageBlocks(view));
  return true;
}

function calculateImageVisualRatio(width: number, metrics: NonNullable<ReturnType<typeof calculateImageSizingMetrics>>) {
  const visualRatio = clampNumber(width / metrics.defaultWidth, 0.25, metrics.availableWidth / metrics.defaultWidth);
  return Number.parseFloat(visualRatio.toFixed(2));
}

function readRenderedImageHeight(imageElement: HTMLImageElement) {
  const height = Number.parseFloat(imageElement.style.height) || Number(imageElement.dataset.height) || imageElement.getBoundingClientRect().height;
  return Number.isFinite(height) && height > 0 ? height : null;
}

function readImageRatio(value: unknown) {
  const ratio = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : 1;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function getResponsiveImageDefaultWidthRatio() {
  const viewportWidth = window.innerWidth;
  if (viewportWidth >= 1536) return 0.5;
  if (viewportWidth >= 1280) return 0.6;
  if (viewportWidth >= 1024) return 0.7;
  if (viewportWidth >= 768) return 0.82;
  return 1;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function findRenderedImageElement(view: EditorView, node: EditorState["doc"], position: number): HTMLImageElement | null {
  const nodeDom = view.nodeDOM(position);
  if (nodeDom instanceof HTMLImageElement) return nodeDom;
  if (nodeDom instanceof Element) {
    const image = nodeDom.querySelector("img[data-type='image-block'], img");
    if (image instanceof HTMLImageElement) return image;
  }

  const nodeSource = readStringNodeAttribute(node.attrs.src || node.attrs.url);
  if (!nodeSource) return null;

  const images = Array.from(view.dom.querySelectorAll("img"));
  return images.find((image): image is HTMLImageElement => image instanceof HTMLImageElement && imageElementMatchesNodeSource(image, node)) ?? null;
}

function deleteImageAtPosition(view: EditorView | null, position: number) {
  if (!view) return false;

  const image = findImageNodeNearPosition(view.state, position);
  if (!image) return false;

  const transaction = view.state.tr.delete(image.position, image.position + image.node.nodeSize).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
}

function deleteDiagramAtPosition(view: EditorView | null, position: number, nodeSize: number) {
  if (!view) return false;

  const safeFrom = clampDocumentPosition(position, view.state.doc.content.size);
  const safeTo = clampDocumentPosition(position + nodeSize, view.state.doc.content.size);
  if (safeFrom >= safeTo) return false;

  const transaction = view.state.tr.delete(safeFrom, safeTo).scrollIntoView();
  view.dispatch(transaction);
  view.focus();
  return true;
}

function findImageNodeByRenderedSource(state: EditorState, imageElement: HTMLImageElement): { node: EditorState["doc"]; position: number } | null {
  let match: { node: EditorState["doc"]; position: number } | null = null;

  state.doc.descendants((node, position) => {
    if (!isEditableImageNode(node) || !imageElementMatchesNodeSource(imageElement, node)) return true;

    match = { node, position };
    return false;
  });

  return match;
}

function imageElementMatchesNodeSource(imageElement: HTMLImageElement, node: EditorState["doc"]) {
  const nodeSource = readStringNodeAttribute(node.attrs.src || node.attrs.url);
  if (!nodeSource) return false;

  const renderedSources = [imageElement.getAttribute("src"), imageElement.currentSrc, imageElement.src]
    .filter((source): source is string => Boolean(source));

  return renderedSources.some((renderedSource) => renderedSource === nodeSource || renderedSource.endsWith(nodeSource));
}

function imageNodeToEditTarget(node: EditorState["doc"], position: number): MarkdownEditorImageEditTarget {
  return {
    position,
    src: readStringNodeAttribute(node.attrs.src || node.attrs.url),
    alt: readStringNodeAttribute(node.attrs.alt),
    title: readNullableStringNodeAttribute(node.attrs.title),
  };
}

function imageEditOverlayStatesAreEqual(currentOverlay: ImageEditOverlayState | null, nextOverlay: ImageEditOverlayState) {
  return (
    currentOverlay?.left === nextOverlay.left &&
    currentOverlay.top === nextOverlay.top &&
    currentOverlay.target.position === nextOverlay.target.position &&
    currentOverlay.target.src === nextOverlay.target.src &&
    currentOverlay.target.alt === nextOverlay.target.alt &&
    currentOverlay.target.title === nextOverlay.target.title
  );
}

function diagramEditOverlayStatesAreEqual(currentOverlay: DiagramEditOverlayState | null, nextOverlay: DiagramEditOverlayState) {
  return (
    currentOverlay?.left === nextOverlay.left &&
    currentOverlay.top === nextOverlay.top &&
    currentOverlay.target.position === nextOverlay.target.position &&
    currentOverlay.target.nodeSize === nextOverlay.target.nodeSize &&
    currentOverlay.target.code === nextOverlay.target.code &&
    currentOverlay.target.caption === nextOverlay.target.caption &&
    currentOverlay.target.width === nextOverlay.target.width &&
    currentOverlay.target.widthRatio === nextOverlay.target.widthRatio
  );
}

function clampDocumentPosition(position: number, maxPosition: number) {
  return Math.max(0, Math.min(position, maxPosition));
}

function readEditorSelection(state: EditorState): MarkdownEditorSelection | null {
  const { from, to, empty } = state.selection;
  if (empty || from >= to) {
    const position = from;
    const nearTextBefore = state.doc.textBetween(Math.max(0, position - 260), position, "\n", "\n").trim();
    const nearTextAfter = state.doc.textBetween(position, Math.min(state.doc.content.size, position + 260), "\n", "\n").trim();
    return {
      focusType: "cursor",
      from: position,
      to: position,
      position,
      text: "",
      nearTextBefore,
      nearTextAfter,
      blockType: blockTypeAtSelection(state),
      blockHash: stableTextHash(`${nearTextBefore}|${nearTextAfter}`),
    };
  }

  const text = state.doc.textBetween(from, to, "\n", "\n").trim();
  if (!text) return null;

  const nearTextBefore = state.doc.textBetween(Math.max(0, from - 260), from, "\n", "\n").trim();
  const nearTextAfter = state.doc.textBetween(to, Math.min(state.doc.content.size, to + 260), "\n", "\n").trim();
  return {
    focusType: "selection",
    from,
    to,
    position: null,
    text,
    nearTextBefore,
    nearTextAfter,
    blockType: blockTypeAtSelection(state),
    blockHash: stableTextHash(`${nearTextBefore}|${text}|${nearTextAfter}`),
  };
}

function applySelectionFocusDecoration(view: EditorView, selection: MarkdownEditorSelection | null) {
  const nextRange = selection?.focusType !== "cursor" && selection?.text ? { from: selection.from, to: selection.to } : null;
  const currentRange = selectionFocusPluginKey.getState(view.state);
  if (selectionRangesAreEqual(currentRange, nextRange)) return;

  view.dispatch(view.state.tr.setMeta(selectionFocusPluginKey, nextRange));
}

function blockTypeAtSelection(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.isTextblock) return node.type.name;
  }
  return "document";
}

function stableTextHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function readStringNodeAttribute(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableStringNodeAttribute(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function formatStatesAreEqual(currentFormatState: MarkdownEditorFormatState, nextFormatState: MarkdownEditorFormatState) {
  const currentKeys = Object.keys(currentFormatState) as Array<keyof MarkdownEditorFormatState>;
  const nextKeys = Object.keys(nextFormatState) as Array<keyof MarkdownEditorFormatState>;

  if (currentKeys.length !== nextKeys.length) return false;

  return nextKeys.every((key) => currentFormatState[key] === nextFormatState[key]);
}

function historyStatesAreEqual(currentHistoryState: MarkdownEditorHistoryState, nextHistoryState: MarkdownEditorHistoryState) {
  return (
    currentHistoryState.canUndo === nextHistoryState.canUndo &&
    currentHistoryState.canRedo === nextHistoryState.canRedo &&
    currentHistoryState.undoDepth === nextHistoryState.undoDepth &&
    currentHistoryState.redoDepth === nextHistoryState.redoDepth
  );
}

function editorSelectionsAreEqual(currentSelection: MarkdownEditorSelection | null, nextSelection: MarkdownEditorSelection | null) {
  if (currentSelection === nextSelection) return true;
  if (!currentSelection || !nextSelection) return false;
  return (
    currentSelection.focusType === nextSelection.focusType &&
    currentSelection.from === nextSelection.from &&
    currentSelection.to === nextSelection.to &&
    currentSelection.position === nextSelection.position &&
    currentSelection.text === nextSelection.text &&
    currentSelection.nearTextBefore === nextSelection.nearTextBefore &&
    currentSelection.nearTextAfter === nextSelection.nearTextAfter
  );
}

function selectionRangesAreEqual(currentRange: SelectionFocusRange | null | undefined, nextRange: SelectionFocusRange | null) {
  if (!currentRange && !nextRange) return true;
  if (!currentRange || !nextRange) return false;
  return currentRange.from === nextRange.from && currentRange.to === nextRange.to;
}

function getStateForFormat(
  state: Parameters<typeof readMarkdownEditorFormatState>[0],
  selection?: Selection,
): Parameters<typeof readMarkdownEditorFormatState>[0] {
  if (!selection) return state;

  try {
    return state.apply(state.tr.setSelection(selection));
  } catch {
    return state;
  }
}
