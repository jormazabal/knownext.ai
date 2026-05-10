import type { Editor } from "@milkdown/kit/core";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import type { EditorState } from "@milkdown/kit/prose/state";
import {
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  liftListItemCommand,
  turnIntoTextCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import type { MarkdownEditorAction, MarkdownEditorController, MarkdownEditorFormatState } from "./editorTypes";

export function createMarkdownEditorController(editor: Editor): MarkdownEditorController {
  return {
    run(action) {
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const commands = ctx.get(commandsCtx);

        view.focus();

        switch (action) {
          case "paragraph":
            return commands.call(turnIntoTextCommand.key);
          case "heading-1":
            return commands.call(wrapInHeadingCommand.key, 1);
          case "heading-2":
            return commands.call(wrapInHeadingCommand.key, 2);
          case "heading-3":
            return commands.call(wrapInHeadingCommand.key, 3);
          case "bold":
            return commands.call(toggleStrongCommand.key);
          case "italic":
            return commands.call(toggleEmphasisCommand.key);
          case "strike":
            return commands.call(toggleStrikethroughCommand.key);
          case "clear-format":
            return clearFormatting(ctx);
          case "bullet-list":
            return toggleBulletList(ctx);
          case "ordered-list":
            return toggleOrderedList(ctx);
          case "check-list":
            return toggleTaskList(ctx);
          case "table":
            return commands.call(insertTableCommand.key, { row: 3, col: 4 });
          case "code":
            return commands.call(createCodeBlockCommand.key) || commands.call(toggleInlineCodeCommand.key);
          case "link":
            return applyLink(ctx);
          case "image":
            return applyImage(ctx);
          case "quote":
            return commands.call(wrapInBlockquoteCommand.key);
          case "horizontal-rule":
            return commands.call(insertHrCommand.key);
          case "undo":
            return commands.call(undoCommand.key);
          case "redo":
            return commands.call(redoCommand.key);
          default:
            return false;
        }
      });
    },
    getFormatState() {
      try {
        return editor.action((ctx) => readMarkdownEditorFormatState(ctx.get(editorViewCtx).state));
      } catch {
        return {};
      }
    },
  };
}

type EditorCommandContext = Parameters<Editor["action"]>[0] extends (ctx: infer Ctx) => unknown ? Ctx : never;

export function readMarkdownEditorFormatState(state: EditorState): MarkdownEditorFormatState {
  const block = findBlockState(state);
  const inTaskItem = Boolean(block.listItem?.node.attrs.checked !== null && block.listItem?.node.attrs.checked !== undefined);
  const inBulletList = block.listType === "bullet_list";
  const inOrderedList = block.listType === "ordered_list";

  return {
    paragraph:
      block.textBlockType === "paragraph" &&
      !block.listType &&
      !block.blockquote &&
      !block.codeBlock,
    "heading-1": block.textBlockType === "heading" && block.headingLevel === 1,
    "heading-2": block.textBlockType === "heading" && block.headingLevel === 2,
    "heading-3": block.textBlockType === "heading" && block.headingLevel === 3,
    bold: selectionHasMark(state, "strong"),
    italic: selectionHasMark(state, "emphasis"),
    strike: selectionHasMark(state, "strike_through"),
    code: selectionHasMark(state, "inlineCode") || block.codeBlock,
    link: selectionHasMark(state, "link"),
    "bullet-list": inBulletList && !inTaskItem,
    "ordered-list": inOrderedList && !inTaskItem,
    "check-list": inTaskItem,
    quote: block.blockquote,
  };
}

function clearFormatting(ctx: EditorCommandContext) {
  const commands = ctx.get(commandsCtx);
  const paragraphApplied = commands.call(turnIntoTextCommand.key);
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { from, to, empty, $from } = state.selection;
  let tr = state.tr;

  if (empty) {
    Object.values(state.schema.marks).forEach((mark) => {
      tr = tr.removeStoredMark(mark);
    });
    tr = tr.removeMark($from.start(), $from.end());
  } else {
    tr = tr.removeMark(from, to);
  }

  if (tr.docChanged || tr.storedMarksSet) {
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  return paragraphApplied;
}

function applyLink(ctx: EditorCommandContext) {
  const href = window.prompt("URL del enlace", "https://");
  if (!href) return false;

  const commands = ctx.get(commandsCtx);
  const view = ctx.get(editorViewCtx);
  const { state } = view;

  if (!state.selection.empty) {
    return commands.call(toggleLinkCommand.key, { href });
  }

  const link = state.schema.marks.link;
  if (!link) return commands.call(toggleLinkCommand.key, { href });

  const text = state.schema.text("enlace", [link.create({ href })]);
  view.dispatch(state.tr.replaceSelectionWith(text).scrollIntoView());
  return true;
}

function applyImage(ctx: EditorCommandContext) {
  const src = window.prompt("URL de la imagen", "https://");
  if (!src) return false;

  const alt = window.prompt("Texto alternativo", "Imagen") ?? "Imagen";
  return ctx.get(commandsCtx).call(insertImageCommand.key, { src, alt });
}

function toggleBulletList(ctx: EditorCommandContext) {
  const commands = ctx.get(commandsCtx);
  const formatState = readMarkdownEditorFormatState(ctx.get(editorViewCtx).state);

  if (formatState["bullet-list"]) {
    return commands.call(liftListItemCommand.key);
  }

  if (formatState["ordered-list"] || formatState["check-list"]) {
    commands.call(liftListItemCommand.key);
  }

  return commands.call(wrapInBulletListCommand.key);
}

function toggleOrderedList(ctx: EditorCommandContext) {
  const commands = ctx.get(commandsCtx);
  const formatState = readMarkdownEditorFormatState(ctx.get(editorViewCtx).state);

  if (formatState["ordered-list"]) {
    return commands.call(liftListItemCommand.key);
  }

  if (formatState["bullet-list"] || formatState["check-list"]) {
    commands.call(liftListItemCommand.key);
  }

  return commands.call(wrapInOrderedListCommand.key);
}

function toggleTaskList(ctx: EditorCommandContext) {
  const commands = ctx.get(commandsCtx);
  const formatState = readMarkdownEditorFormatState(ctx.get(editorViewCtx).state);

  if (formatState["check-list"]) {
    return commands.call(liftListItemCommand.key);
  }

  if (formatState["ordered-list"]) {
    commands.call(liftListItemCommand.key);
  }

  commands.call(wrapInBulletListCommand.key);

  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const listItem = findAncestorNode(state, "list_item");

  if (!listItem) return false;

  view.dispatch(
    state.tr
      .setNodeMarkup(listItem.position, undefined, {
        ...listItem.node.attrs,
        checked: false,
      })
      .scrollIntoView(),
  );
  return true;
}

function selectionHasMark(state: EditorState, markName: string) {
  const markType = state.schema.marks[markName];
  if (!markType) return false;

  const { empty, from, to, $from } = state.selection;

  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks ?? $from.marks()));
  }

  let hasMark = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || hasMark) return false;
    hasMark = Boolean(markType.isInSet(node.marks));
    return !hasMark;
  });
  return hasMark;
}

function findBlockState(state: EditorState) {
  const { $from } = state.selection;
  let textBlockType: string | undefined;
  let headingLevel: number | undefined;
  let listType: "bullet_list" | "ordered_list" | undefined;
  let listItem: ReturnType<typeof findAncestorNode> | undefined;
  let blockquote = false;
  let codeBlock = false;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);

    if (!textBlockType && node.isTextblock) {
      textBlockType = node.type.name;
      headingLevel = Number(node.attrs.level) || undefined;
      codeBlock = node.type.name === "code_block";
    }

    if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
      listType = node.type.name;
    }

    if (!listItem && node.type.name === "list_item") {
      listItem = { node, depth, position: $from.before(depth) };
    }

    if (node.type.name === "blockquote") {
      blockquote = true;
    }
  }

  return { textBlockType, headingLevel, listType, listItem, blockquote, codeBlock };
}

function findAncestorNode(state: EditorState, typeName: string) {
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === typeName) {
      return { node, depth, position: $from.before(depth) };
    }
  }

  return undefined;
}
