import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, prosePluginsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";
import {
  createMarkdownEditorController,
  readMarkdownEditorFormatState,
} from "./editorCommands";
import type { MarkdownEditorController, MarkdownEditorFormatState } from "./editorTypes";
import type { MarkdownEditorSelection } from "./editorTypes";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type MarkdownEditorProps = {
  documentKey: string;
  markdown: string;
  onChange: (markdown: string) => void;
  onControllerChange: (controller: MarkdownEditorController | null) => void;
  onFormatStateChange: (formatState: MarkdownEditorFormatState) => void;
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

function MilkdownInstance({ markdown, onChange, onControllerChange, onFormatStateChange, onSelectionChange, selectionFocus }: MarkdownEditorProps) {
  const skipInitialUpdate = useRef(true);
  const lastMarkdownRef = useRef(markdown);
  const lastFormatStateRef = useRef<MarkdownEditorFormatState>({});
  const lastSelectionRef = useRef<MarkdownEditorSelection | null>(null);
  const callbacksRef = useRef({ onChange, onControllerChange, onFormatStateChange, onSelectionChange });
  const controllerReadyRef = useRef(false);

  useEffect(() => {
    callbacksRef.current = { onChange, onControllerChange, onFormatStateChange, onSelectionChange };
  }, [onChange, onControllerChange, onFormatStateChange, onSelectionChange]);

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
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, createSelectionFocusPlugin()]);
    });

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
      const controller = createMarkdownEditorController(editor, selectionFocusPluginKey);
      callbacksRef.current.onControllerChange(controller);
      notifyFormatState(controller.getFormatState());
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
