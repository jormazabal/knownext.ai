import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, prosePluginsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { historyProviderConfig } from "@milkdown/kit/plugin/history";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";
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
import type { MarkdownEditorController, MarkdownEditorFormatState, MarkdownEditorHistoryState } from "./editorTypes";
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
  selectionFocus?: MarkdownEditorSelection | null;
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

function MilkdownInstance({ markdown, onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange, selectionFocus }: MarkdownEditorProps) {
  const skipInitialUpdate = useRef(true);
  const lastMarkdownRef = useRef(markdown);
  const lastFormatStateRef = useRef<MarkdownEditorFormatState>({});
  const lastHistoryStateRef = useRef<MarkdownEditorHistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  const lastSelectionRef = useRef<MarkdownEditorSelection | null>(null);
  const callbacksRef = useRef({ onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange });
  const controllerReadyRef = useRef(false);

  useEffect(() => {
    callbacksRef.current = { onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange };
  }, [onChange, onControllerChange, onFormatStateChange, onHistoryStateChange, onSelectionChange]);

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
          return;
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
    <div className="knownext-editor">
      <Milkdown />
    </div>
  );

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

function clampDocumentPosition(position: number, maxPosition: number) {
  return Math.max(0, Math.min(position, maxPosition));
}

function readEditorSelection(state: EditorState): MarkdownEditorSelection | null {
  const { from, to, empty } = state.selection;
  if (empty || from >= to) return null;

  const text = state.doc.textBetween(from, to, "\n", "\n").trim();
  if (!text) return null;

  return { from, to, text };
}

function applySelectionFocusDecoration(view: EditorView, selection: MarkdownEditorSelection | null) {
  const nextRange = selection ? { from: selection.from, to: selection.to } : null;
  const currentRange = selectionFocusPluginKey.getState(view.state);
  if (selectionRangesAreEqual(currentRange, nextRange)) return;

  view.dispatch(view.state.tr.setMeta(selectionFocusPluginKey, nextRange));
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
  return currentSelection.from === nextSelection.from && currentSelection.to === nextSelection.to && currentSelection.text === nextSelection.text;
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
