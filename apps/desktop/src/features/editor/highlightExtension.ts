import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { toggleMark } from "@milkdown/kit/prose/commands";
import { $command, $markSchema, $remark } from "@milkdown/kit/utils";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  color?: string;
  [key: string]: unknown;
};

export type MarkdownHighlightColorId = "yellow" | "green" | "blue" | "pink" | "orange";

export const markdownHighlightColors: Array<{ id: MarkdownHighlightColorId; label: string; background: string; border: string }> = [
  { id: "yellow", label: "Amarillo", background: "#FEF08A", border: "#EAB308" },
  { id: "green", label: "Verde", background: "#BBF7D0", border: "#22C55E" },
  { id: "blue", label: "Azul", background: "#BFDBFE", border: "#3B82F6" },
  { id: "pink", label: "Rosa", background: "#FBCFE8", border: "#EC4899" },
  { id: "orange", label: "Naranja", background: "#FED7AA", border: "#F97316" },
];

export const defaultMarkdownHighlightColor: MarkdownHighlightColorId = "yellow";

const highlightColorIds = new Set<MarkdownHighlightColorId>(markdownHighlightColors.map((color) => color.id));

export function normalizeMarkdownHighlightColor(value: unknown): MarkdownHighlightColorId {
  return typeof value === "string" && highlightColorIds.has(value as MarkdownHighlightColorId) ? (value as MarkdownHighlightColorId) : defaultMarkdownHighlightColor;
}

export function markdownHighlightColorValue(color: unknown) {
  return markdownHighlightColors.find((item) => item.id === normalizeMarkdownHighlightColor(color))?.background ?? markdownHighlightColors[0].background;
}

export const highlightSchema = $markSchema("highlight", () => ({
  attrs: {
    color: { default: defaultMarkdownHighlightColor },
  },
  parseDOM: [
    {
      tag: "mark",
      getAttrs: (node) => ({
        color: normalizeMarkdownHighlightColor(node instanceof HTMLElement ? node.dataset.knxHighlight : undefined),
      }),
    },
  ],
  toDOM: (mark) => {
    const color = normalizeMarkdownHighlightColor(mark.attrs.color);
    return [
      "mark",
      {
        "data-knx-highlight": color,
        class: `knownext-highlight knownext-highlight-${color}`,
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === "highlight",
    runner: (state, node, markType) => {
      state.openMark(markType, { color: normalizeMarkdownHighlightColor(node.color) });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "highlight",
    runner: (state, mark) => {
      state.withMark(mark, "highlight");
    },
  },
}));

export const toggleHighlightCommand = $command("ToggleHighlight", (ctx) => (color: MarkdownHighlightColorId = defaultMarkdownHighlightColor) => {
  return toggleMark(highlightSchema.type(ctx), { color: normalizeMarkdownHighlightColor(color) });
});

export const clearHighlightCommand = $command("ClearHighlight", (ctx) => () => {
  return (state, dispatch) => {
    const markType = highlightSchema.type(ctx);
    const { empty, from, to, $from } = state.selection;
    let transaction = state.tr;
    if (empty) {
      transaction = transaction.removeStoredMark(markType).removeMark($from.start(), $from.end(), markType);
    } else {
      transaction = transaction.removeMark(from, to, markType);
    }
    if (!transaction.docChanged && !transaction.storedMarksSet) return false;
    dispatch?.(transaction.scrollIntoView());
    return true;
  };
});

export const remarkHighlightHtmlPlugin = $remark("remarkHighlightHtml", () => () => (tree) => {
  transformHighlightHtml(tree as MarkdownNode);
  return tree;
});

export function configureHighlightMarkdownSerialization(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      highlight: (node: any, _parent: any, state: any, info: any) => {
        const color = normalizeMarkdownHighlightColor(node.color ?? node.attributes?.color ?? node.data?.color);
        const exit = state.enter("highlight");
        const tracker = state.createTracker(info);
        let value = tracker.move(`<mark data-knx-highlight="${color}">`);
        value += tracker.move(state.containerPhrasing(node, {
          before: value,
          after: "</mark>",
          ...tracker.current(),
        }));
        value += tracker.move("</mark>");
        exit();
        return value;
      },
    },
  }));
}

export function transformHighlightHtml(node: MarkdownNode) {
  if (!node.children) return;

  node.children = transformChildren(node.children);
  node.children.forEach(transformHighlightHtml);
}

function transformChildren(children: MarkdownNode[]) {
  const transformed: MarkdownNode[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (!isHighlightOpenHtml(child)) {
      transformed.push(child);
      continue;
    }

    const highlightedChildren: MarkdownNode[] = [];
    let closed = false;

    for (index += 1; index < children.length; index += 1) {
      const candidate = children[index];
      if (isHighlightCloseHtml(candidate)) {
        closed = true;
        break;
      }
      highlightedChildren.push(candidate);
    }

    if (!closed) {
      transformed.push(child, ...highlightedChildren);
      break;
    }

    transformed.push({
      type: "highlight",
      color: extractHighlightColor(child),
      children: transformChildren(highlightedChildren),
    });
  }

  return transformed;
}

function isHighlightOpenHtml(node: MarkdownNode) {
  return node.type === "html" && /^<mark(?:\s[^>]*)?>$/i.test((node.value ?? "").trim());
}

function isHighlightCloseHtml(node: MarkdownNode) {
  return node.type === "html" && /^<\/mark>$/i.test((node.value ?? "").trim());
}

function extractHighlightColor(node: MarkdownNode) {
  const value = (node.value ?? "").trim();
  const attr = value.match(/\bdata-knx-highlight=(["'])(.*?)\1/i)?.[2];
  return normalizeMarkdownHighlightColor(attr);
}
