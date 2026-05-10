import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import type { Selection } from "@milkdown/kit/prose/state";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";
import {
  createMarkdownEditorController,
  readMarkdownEditorFormatState,
} from "./editorCommands";
import type { MarkdownEditorController, MarkdownEditorFormatState } from "./editorTypes";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type MarkdownEditorProps = {
  documentKey: string;
  markdown: string;
  onChange: (markdown: string) => void;
  onControllerChange: (controller: MarkdownEditorController | null) => void;
  onFormatStateChange: (formatState: MarkdownEditorFormatState) => void;
};

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <MilkdownProvider key={props.documentKey}>
      <MilkdownInstance {...props} />
    </MilkdownProvider>
  );
}

function MilkdownInstance({ markdown, onChange, onControllerChange, onFormatStateChange }: MarkdownEditorProps) {
  const skipInitialUpdate = useRef(true);
  const lastMarkdownRef = useRef(markdown);
  const lastFormatStateRef = useRef<MarkdownEditorFormatState>({});
  const callbacksRef = useRef({ onChange, onControllerChange, onFormatStateChange });
  const controllerReadyRef = useRef(false);

  useEffect(() => {
    callbacksRef.current = { onChange, onControllerChange, onFormatStateChange };
  }, [onChange, onControllerChange, onFormatStateChange]);

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

    crepe.on((listener) => {
      const syncFormatState = (ctx: Ctx, selection?: Selection) => {
        let view: { state?: Parameters<typeof readMarkdownEditorFormatState>[0] } | undefined;
        try {
          view = ctx.get(editorViewCtx);
        } catch {
          return;
        }

        if (!view?.state) return;

        notifyFormatState(readMarkdownEditorFormatState(getStateForFormat(view.state, selection)));
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
      const controller = createMarkdownEditorController(editor);
      callbacksRef.current.onControllerChange(controller);
      notifyFormatState(controller.getFormatState());
    }
  }, [loading]);

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
}

function formatStatesAreEqual(currentFormatState: MarkdownEditorFormatState, nextFormatState: MarkdownEditorFormatState) {
  const currentKeys = Object.keys(currentFormatState) as Array<keyof MarkdownEditorFormatState>;
  const nextKeys = Object.keys(nextFormatState) as Array<keyof MarkdownEditorFormatState>;

  if (currentKeys.length !== nextKeys.length) return false;

  return nextKeys.every((key) => currentFormatState[key] === nextFormatState[key]);
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
