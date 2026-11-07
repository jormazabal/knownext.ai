import type { Root } from "@milkdown/kit/transformer";
import { closeHistory } from "@milkdown/kit/prose/history";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { remarkPluginsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { $nodeSchema } from "@milkdown/kit/utils";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";

type AstNode = { type: string; value?: unknown; children?: AstNode[]; position?: { start: { offset?: number }; end: { offset?: number } }; knownextKind?: string };
const nodeName = "knownext_preserved_block";
const labels: Record<string, string> = { yaml: "Metadatos YAML conservados", toml: "Metadatos TOML conservados", definition: "Referencias originales conservadas" };

/** Recognize the document-level metadata convention, without interpreting its data. */
function metadataEnd(source: string): { end: number; kind: string } | null {
  const start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const lineEnd = source.indexOf("\n", start);
  if (lineEnd < 0) return null;
  const delimiter = source.slice(start, lineEnd).replace(/\r$/, "");
  if (delimiter !== "---" && delimiter !== "+++") return null;
  let cursor = lineEnd + 1;
  while (cursor < source.length) {
    const newline = source.indexOf("\n", cursor);
    const end = newline < 0 ? source.length : newline;
    if (source.slice(cursor, end).replace(/\r$/, "") === delimiter) return { end: newline < 0 ? end : end + 1, kind: delimiter === "---" ? "yaml" : "toml" };
    cursor = end + 1;
  }
  return null;
}
function opaque(value: string, kind: string): AstNode { return { type: nodeName, value, knownextKind: kind }; }
function preserveDefinitions(node: AstNode, source: string) {
  if (!node.children) return;
  const children = node.children, result: AstNode[] = [];
  for (let index = 0; index < children.length; index++) {
    const child = children[index], start = child.position?.start.offset;
    if (child.type === "definition" && typeof start === "number" && typeof child.position?.end.offset === "number") {
      const definitions = [child];
      let end = child.position.end.offset;
      while (children[index + 1]?.type === "definition" && typeof children[index + 1].position?.end.offset === "number") {
        const next = children[++index]; definitions.push(next); end = next.position!.end.offset!;
      }
      // One compact card for a contiguous reference section, not one per URL.
      result.push(...definitions, opaque(source.slice(start, end), "definition"));
    } else { preserveDefinitions(child, source); result.push(child); }
  }
  node.children = result;
}
/** Capture definitions before the commonmark inline-link resolver consumes them.
 * Their ordinary AST remains available for resolving visual links; only the
 * original data is also retained in a separate non-editable node. */
function documentFidelityRemark() { return (tree: Root, file: { value?: unknown }) => {
  const root = tree as unknown as AstNode;
  const source = String(file.value ?? "");
  const prefix = metadataEnd(source);
  if (prefix && root.children) {
    let consumed = 0, end = prefix.end;
    while (consumed < root.children.length && (root.children[consumed].position?.start.offset ?? source.length) < prefix.end) {
      // If no blank line follows the delimiter, preserve the whole overlapping
      // parsed block rather than discarding its trailing text.
      end = Math.max(end, root.children[consumed].position?.end.offset ?? end);
      consumed++;
    }
    root.children.splice(0, consumed, opaque(source.slice(0, end), prefix.kind));
  }
  preserveDefinitions(root, source);
  return tree;
}; }
export function configureDocumentFidelity(ctx: Ctx) {
  ctx.update(remarkPluginsCtx, plugins => [{ plugin: documentFidelityRemark, options: {} }, ...plugins]);
}

/** This is data, never executable HTML or an instruction to the application. */
export const preservedBlockSchema = $nodeSchema(nodeName, () => ({
  group: "block", atom: true, isolating: true, selectable: true,
  attrs: { source: { default: "", validate: "string" }, kind: { default: "definition", validate: "string" } },
  parseDOM: [{ tag: 'div[data-knownext-preserved-block]', getAttrs: element => {
    if (!(element instanceof HTMLElement)) return false;
    const source = element.getAttribute("data-knownext-preserved-source"), kind = element.getAttribute("data-knownext-preserved-block");
    return source !== null && kind !== null && Object.prototype.hasOwnProperty.call(labels, kind) ? { source, kind } : false;
  } }],
  toDOM: node => ["div", { "data-knownext-preserved-block": node.attrs.kind, "data-knownext-preserved-source": node.attrs.source, contenteditable: "false", class: "knownext-preserved-block" },
    ["details", ["summary", labels[node.attrs.kind] ?? "Bloque original conservado"], ["p", "Este bloque se conserva sin cambios. Puedes editar el resto del documento."], ["pre", ["code", node.attrs.source]]]],
  parseMarkdown: { match: node => node.type === nodeName, runner: (state, node, type) => {
    const value = node as AstNode;
    state.addNode(type, { source: typeof value.value === "string" ? value.value : "", kind: value.knownextKind ?? "definition" });
  } },
  toMarkdown: { match: node => node.type.name === nodeName, runner: (state, node) => { state.addNode("html", undefined, node.attrs.source); } },
}));

export type PublishedMarkdownDocument = { markdown: string; document: ProseMirrorNode };
/** Selection, mounting and normalization cannot replace the author's source. */
export function documentPublication(original: PublishedMarkdownDocument | null, previous: PublishedMarkdownDocument | null, nextDocument: ProseMirrorNode, serialized: string): PublishedMarkdownDocument | null {
  if (previous?.document.eq(nextDocument)) return null;
  return { markdown: original?.document.eq(nextDocument) ? original.markdown : serialized, document: nextDocument };
}


export type DocumentPasteNotice = { message: string; plainText: string; document: ProseMirrorNode; from: number; to: number };
function attribute(tag: string, name: string): string | null {
  const match = new RegExp("\\s" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] ?? "" : null;
}
/** A single pass, including malformed/quoted input; no DOM or resource loading. */
function* clipboardTags(html: string) {
  let cursor = 0;
  while ((cursor = html.indexOf("<", cursor)) >= 0) {
    const start = cursor++;
    if (html.startsWith("!--", cursor)) { const end = html.indexOf("-->", cursor + 3); cursor = end < 0 ? html.length : end + 3; continue; }
    const closing = html[cursor] === "/";
    if (closing) cursor++;
    if (!/[a-z]/i.test(html[cursor] ?? "")) continue;
    const nameStart = cursor++;
    while (cursor < html.length && /[a-z0-9:-]/i.test(html[cursor])) cursor++;
    const name = html.slice(nameStart, cursor).toLowerCase();
    let quote = "";
    while (cursor < html.length) {
      const character = html[cursor++];
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    yield { name, closing, tag: html.slice(start, cursor), incomplete: html[cursor - 1] !== ">" || Boolean(quote) };
  }
}
/** Structural compatibility check only, not an HTML sanitizer or an AI classifier. */
export function incompatibleClipboardHtml(html: string): string | null {
  if (!html) return null;
  if (html.length > 8 * 1024 * 1024) return "El fragmento HTML supera 8 MiB. Divide el contenido antes de pegarlo.";
  // Tokenize tags including quoted attributes. Source data inside our own atom
  // is not HTML to inspect, and a quoted '<svg>' must not be treated as a tag.
  const tags = clipboardTags(html);
  let preservedDepth = 0;
  for (const match of tags) {
    const { closing, name, tag, incomplete } = match;
    if (incomplete) return "El fragmento HTML está incompleto. No se ha insertado para evitar perder contenido.";
    if (preservedDepth) { if (name === "div") preservedDepth += closing ? -1 : 1; continue; }
    const kind = attribute(tag, "data-knownext-preserved-block");
    if (!closing && name === "div" && kind !== null && Object.prototype.hasOwnProperty.call(labels, kind) && attribute(tag, "data-knownext-preserved-source") !== null) { preservedDepth = 1; continue; }
    if (closing) continue;
    if (["math", "svg", "canvas", "video", "audio", "iframe", "object", "embed", "details", "summary"].includes(name)) return "El portapapeles contiene un bloque que no se puede representar fielmente en Markdown. No se ha insertado.";
    if ((name === "td" || name === "th") && ["rowspan", "colspan"].some(key => { const value = attribute(tag, key); return value !== null && Number(value.trim()) !== 1; })) return "La tabla pegada tiene celdas fusionadas que Markdown no puede conservar. No se ha insertado.";
  }
  return null;
}
export function createDocumentPasteGuard(onNotice: (notice: DocumentPasteNotice | null) => void) {
  const inspect = (view: EditorView, event: ClipboardEvent) => {
    const html = event.clipboardData?.getData("text/html") ?? "";
    const message = incompatibleClipboardHtml(html);
    if (!message) { onNotice(null); return false; }
    const text = event.clipboardData?.getData("text/plain") ?? "";
    onNotice({ message, plainText: text.length <= 8 * 1024 * 1024 ? text : "", document: view.state.doc, from: view.state.selection.from, to: view.state.selection.to });
    return true;
  };
  return new Plugin({ props: {
    handleDOMEvents: { paste(view, event) { if (!inspect(view, event)) return false; event.preventDefault(); return true; } },
    handlePaste(view, event) { return inspect(view, event); },
  } });
}
/** The user's plain-text choice is anchored to the rejected paste, with one undo. */
export function insertClipboardPlainText(view: EditorView, notice: DocumentPasteNotice): boolean {
  if (!notice.plainText || view.composing || !notice.document.eq(view.state.doc) || view.state.selection.from !== notice.from || view.state.selection.to !== notice.to) return false;
  view.dispatch(closeHistory(view.state.tr).insertText(notice.plainText, notice.from, notice.to).setMeta("addToHistory", true).scrollIntoView());
  view.dispatch(closeHistory(view.state.tr));
  view.focus();
  return true;
}
