import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { toggleMark } from "@milkdown/kit/prose/commands";
import { $command, $markSchema, $remark } from "@milkdown/kit/utils";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  [key: string]: unknown;
};

export const underlineSchema = $markSchema("underline", () => ({
  parseDOM: [
    { tag: "u" },
    {
      style: "text-decoration",
      getAttrs: (value) => (typeof value === "string" && value.includes("underline") ? {} : false),
    },
  ],
  toDOM: () => ["u", 0],
  parseMarkdown: {
    match: (node) => node.type === "underline",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "underline",
    runner: (state, mark) => {
      state.withMark(mark, "underline");
    },
  },
}));

export const toggleUnderlineCommand = $command("ToggleUnderline", (ctx) => () => {
  return toggleMark(underlineSchema.type(ctx));
});

export const remarkUnderlineHtmlPlugin = $remark("remarkUnderlineHtml", () => () => (tree) => {
  transformUnderlineHtml(tree as MarkdownNode);
  return tree;
});

export function configureUnderlineMarkdownSerialization(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      underline: (node: any, _parent: any, state: any, info: any) => {
        const exit = state.enter("underline");
        const tracker = state.createTracker(info);
        let value = tracker.move("<u>");
        value += tracker.move(state.containerPhrasing(node, {
          before: value,
          after: "</u>",
          ...tracker.current(),
        }));
        value += tracker.move("</u>");
        exit();
        return value;
      },
    },
  }));
}

function transformUnderlineHtml(node: MarkdownNode) {
  if (!node.children) return;

  node.children = transformChildren(node.children);
  node.children.forEach(transformUnderlineHtml);
}

function transformChildren(children: MarkdownNode[]) {
  const transformed: MarkdownNode[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (!isUnderlineOpenHtml(child)) {
      transformed.push(child);
      continue;
    }

    const underlinedChildren: MarkdownNode[] = [];
    let closed = false;

    for (index += 1; index < children.length; index += 1) {
      const candidate = children[index];
      if (isUnderlineCloseHtml(candidate)) {
        closed = true;
        break;
      }
      underlinedChildren.push(candidate);
    }

    if (!closed) {
      transformed.push(child, ...underlinedChildren);
      break;
    }

    transformed.push({
      type: "underline",
      children: transformChildren(underlinedChildren),
    });
  }

  return transformed;
}

function isUnderlineOpenHtml(node: MarkdownNode) {
  return node.type === "html" && /^<u(?:\s[^>]*)?>$/i.test((node.value ?? "").trim());
}

function isUnderlineCloseHtml(node: MarkdownNode) {
  return node.type === "html" && /^<\/u>$/i.test((node.value ?? "").trim());
}
