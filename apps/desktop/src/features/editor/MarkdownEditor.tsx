import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import type { Selection } from "@milkdown/kit/prose/state";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef } from "react";
import {
  createMarkdownEditorController,
  readMarkdownEditorFormatState,
  type MarkdownEditorController,
  type MarkdownEditorFormatState,
} from "./editorCommands";
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

        onFormatStateChange(readMarkdownEditorFormatState(getStateForFormat(view.state, selection)));
      };

      listener.mounted(syncFormatState);
      listener.selectionUpdated((ctx, selection) => syncFormatState(ctx, selection));
      listener.updated((ctx) => syncFormatState(ctx));
      listener.markdownUpdated((_ctx, nextMarkdown) => {
        if (skipInitialUpdate.current) {
          skipInitialUpdate.current = false;
          return;
        }
        onChange(nextMarkdown);
      });
    });

    return crepe;
  }, []);

  useEffect(() => {
    if (loading) return;

    const editor = get();
    if (editor) {
      const controller = createMarkdownEditorController(editor);
      onControllerChange(controller);
      onFormatStateChange(controller.getFormatState());
    }
  }, [loading, onControllerChange]);

  useEffect(() => {
    return () => onControllerChange(null);
  }, [onControllerChange]);

  return (
    <div className="knownext-editor">
      <Milkdown />
    </div>
  );
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
