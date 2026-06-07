import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, prosePluginsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { historyProviderConfig } from "@milkdown/kit/plugin/history";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import {
  createMarkdownEditorController,
  readMarkdownEditorHistoryState,
  readMarkdownEditorFormatState,
} from "./editorCommands";
import {
  configureUnderlineMarkdownSerialization,
  remarkUnderlineHtmlPlugin,
  toggleUnderlineCommand,
  underlineSchema,
} from "./underlineExtension";
import type { MarkdownEditorController, MarkdownEditorFormatState, MarkdownEditorHistoryState, MarkdownEditorImageEditTarget } from "./editorTypes";
import type { MarkdownEditorSelection } from "./editorTypes";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type MarkdownEditorProps = {
  documentKey: string;
  markdown: string;
  onChange: (markdown: string) => void;
  onControllerChange: (controller: MarkdownEditorController | null) => void;
  onFormatStateChange: (formatState: MarkdownEditorFormatState) => void;
  onHistoryStateChange: (historyState: MarkdownEditorHistoryState) => void;
  onSelectionChange: (selection: MarkdownEditorSelection | null) => void;
  onImageEditRequest?: (target: MarkdownEditorImageEditTarget) => void;
  selectionFocus?: MarkdownEditorSelection | null;
  zoomPercent: number;
};

type MarkdownEditorCallbacks = {
  onChange: (markdown: string) => void;
  onControllerChange: (controller: MarkdownEditorController | null) => void;
  onFormatStateChange: (formatState: MarkdownEditorFormatState) => void;
  onHistoryStateChange: (historyState: MarkdownEditorHistoryState) => void;
  onSelectionChange: (selection: MarkdownEditorSelection | null) => void;
  onImageEditRequest?: (target: MarkdownEditorImageEditTarget) => void;
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

function MilkdownInstance({ markdown, onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest, selectionFocus, zoomPercent }: MarkdownEditorProps) {
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const skipInitialUpdate = useRef(true);
  const lastMarkdownRef = useRef(markdown);
  const lastFormatStateRef = useRef<MarkdownEditorFormatState>({});
  const lastHistoryStateRef = useRef<MarkdownEditorHistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  const lastSelectionRef = useRef<MarkdownEditorSelection | null>(null);
  const callbacksRef = useRef<MarkdownEditorCallbacks>({ onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest });
  const controllerReadyRef = useRef(false);
  const [imageEditOverlay, setImageEditOverlay] = useState<ImageEditOverlayState | null>(null);

  useEffect(() => {
    callbacksRef.current = { onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest };
  }, [onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, onImageEditRequest]);

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
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, createSelectionFocusPlugin(), createTransientTextPreviewPlugin(), createPersistentCaretPlugin()]);
      configureUnderlineMarkdownSerialization(ctx);
    });
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

      listener.mounted(syncFormatState);
      listener.selectionUpdated((ctx, selection) => syncFormatState(ctx, selection));
      listener.updated((ctx) => syncFormatState(ctx));
      listener.markdownUpdated((_ctx, nextMarkdown) => {
        if (skipInitialUpdate.current) {
          skipInitialUpdate.current = false;
          if (nextMarkdown === lastMarkdownRef.current) return;
        }
        if (nextMarkdown === lastMarkdownRef.current) return;

        lastMarkdownRef.current = nextMarkdown;
        callbacksRef.current.onChange(nextMarkdown);
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

  return (
    <div
      ref={editorShellRef}
      className="knownext-editor"
      style={{ "--knownext-markdown-zoom": String(zoomPercent / 100) } as CSSProperties}
      onMouseMove={handleEditorMouseMove}
      onMouseLeave={() => setImageEditOverlay(null)}
    >
      <Milkdown />
      {imageEditOverlay ? (
        <button
          type="button"
          className="knownext-image-edit-overlay"
          style={{ left: imageEditOverlay.left, top: imageEditOverlay.top }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            callbacksRef.current.onImageEditRequest?.(imageEditOverlay.target);
          }}
        >
          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
          <span>Editar imagen</span>
        </button>
      ) : null}
    </div>
  );

  function handleEditorMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!callbacksRef.current.onImageEditRequest) return;

    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;
    if (eventTarget.closest(".knownext-image-edit-overlay")) return;

    const imageElement = eventTarget.closest("img");
    if (!(imageElement instanceof HTMLImageElement) || !event.currentTarget.contains(imageElement)) {
      setImageEditOverlay(null);
      return;
    }

    const view = viewRef.current;
    if (!view) return;

    const target = findImageEditTarget(view, imageElement);
    if (!target) {
      setImageEditOverlay(null);
      return;
    }

    const imageRect = imageElement.getBoundingClientRect();
    const nextOverlay: ImageEditOverlayState = {
      left: Math.round(imageRect.left + imageRect.width / 2),
      top: Math.round(imageRect.bottom - 10),
      target,
    };
    setImageEditOverlay((currentOverlay) => (imageEditOverlayStatesAreEqual(currentOverlay, nextOverlay) ? currentOverlay : nextOverlay));
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
        return DecorationSet.create(state.doc, [
          Decoration.inline(range.from, range.to, { class: "knownext-selection-focus" }),
        ]);
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

function isEditableImageNode(node: EditorState["doc"]) {
  const typeName = node.type.name.toLowerCase();
  return typeName.includes("image") && (typeof node.attrs.src === "string" || typeof node.attrs.url === "string");
}

function findImageEditTarget(view: EditorView, imageElement: HTMLImageElement): MarkdownEditorImageEditTarget | null {
  const positionMatch = findImageNodeNearDomPosition(view, imageElement);
  if (positionMatch) return imageNodeToEditTarget(positionMatch.node, positionMatch.position);

  const sourceMatch = findImageNodeByRenderedSource(view.state, imageElement);
  return sourceMatch ? imageNodeToEditTarget(sourceMatch.node, sourceMatch.position) : null;
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
