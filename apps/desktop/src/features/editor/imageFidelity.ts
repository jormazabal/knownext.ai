import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import type { Ctx } from "@milkdown/kit/ctx";
import { $remark } from "@milkdown/kit/utils";
import {Plugin} from "@milkdown/kit/prose/state";

const PREFIX = "<!-- knownext-image:";
const MAX_COMMENT = 1024;
const MAX_COMMENTS = 4;
type AstNode = { type: string; children?: AstNode[]; value?: unknown; url?: unknown; alt?: unknown; title?: unknown; knownextRatio?: number; knownextSizingRaw?: string[]; knownextSizingReadOnly?: boolean };
type SizingComment = { ratio: number } | { raw: string };

function ratio(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.01 && value <= 4 ? value : null;
}
function legacyRatio(alt: string) {
  // Compatibility with the shipped Milkdown image-block format. Keep its text
  // verbatim and move the interpreted geometry to explicit metadata on edit.
  const value = Number(alt || 1);
  return Number.isFinite(value) && value > 0 ? Math.max(0.01, Math.min(4, value)) : 1;
}
function sizingComment(value: unknown): SizingComment | null {
  if (typeof value !== "string" || value.length > MAX_COMMENT) return null;
  const text = value.trim();
  if (!text.startsWith(PREFIX) || !text.endsWith("-->") || text.slice(0, -3).includes("-->")) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(PREFIX.length, -3).trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const fields = parsed as Record<string, unknown>;
      const width = ratio(fields.ratio);
      if (fields.version === 1 && width !== null && Object.keys(fields).length === 2 && Object.prototype.hasOwnProperty.call(fields, "version") && Object.prototype.hasOwnProperty.call(fields, "ratio")) return { ratio: width };
    }
  } catch { /* Keep malformed/future owned annotations opaquely; never repair them. */ }
  return { raw: value };
}
function commentValue(node: AstNode | undefined): string | null {
  // Commonmark can wrap standalone HTML in a paragraph. Match the structure,
  // never nearby text or a comment mixed with other paragraph content.
  const html = node?.type === "paragraph" && node.children?.length === 1 ? node.children[0] : node;
  return html?.type === "html" && typeof html.value === "string" ? html.value : null;
}
function ownedComment(node: AstNode | undefined) {
  return commentValue(node)?.trimStart().startsWith(PREFIX) ?? false;
}
function transformImages(node: AstNode) {
  if (!node.children) return;
  // This same structural rule works before or after Crepe's default image
  // transformer. Converted nodes are not paragraphs, so it cannot drop metadata.
  node.children = node.children.map(child => child.type === "paragraph" && child.children?.length === 1 && child.children[0].type === "image"
    ? { ...child.children[0], type: "image-block" } : child);
  for (let index = 0; index < node.children.length; index++) {
    const image = node.children[index];
    if (image.type === "image-block" && ownedComment(node.children[index + 1])) {
      const comments: string[] = [];
      let at = index + 1;
      while (ownedComment(node.children[at]) && comments.length <= MAX_COMMENTS) { comments.push(commentValue(node.children[at])!); at++; }
      const parsed = comments.map(sizingComment);
      if (comments.length <= MAX_COMMENTS && parsed.every(item => item !== null)) {
        if (parsed.length === 1 && parsed[0] && "ratio" in parsed[0]) image.knownextRatio = parsed[0].ratio;
        else { image.knownextSizingRaw = comments; image.knownextSizingReadOnly = true; }
        node.children.splice(index + 1, comments.length);
      } else {
        // Oversized/non-comment HTML stays a normal AST node, with all bytes.
        image.knownextSizingReadOnly = true;
      }
    }
    transformImages(image);
  }
}
export const remarkImageFidelity = $remark("knownext-image-fidelity", () => () => tree => {
  transformImages(tree as AstNode); return tree;
});

function rawComments(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_COMMENTS && value.every(item => typeof item === "string" && sizingComment(item) !== null) ? value as string[] : null;
}
function rawDomComments(dom: HTMLElement) {
  const value = dom.getAttribute("data-knownext-image-metadata");
  if (!value || value.length > MAX_COMMENT * MAX_COMMENTS * 6 + 100) return null;
  try { return rawComments(JSON.parse(value)); } catch { return null; }
}

/** Public schema configuration; Crepe remains the editor and its node view. */
export function configureImageFidelity(ctx: Ctx) {
  ctx.update(imageBlockSchema.key, previous => current => {
    const schema = previous(current);
    return {
      ...schema,
      attrs: {
        ...schema.attrs,
        alt: { default: "", validate: "string" },
        knownextSizingRaw: { default: null },
        knownextSizingReadOnly: { default: false, validate: "boolean" },
        knownextSizingExplicit: { default: false, validate: "boolean" },
      },
      parseDOM: [{ tag: 'img[data-type="image-block"]', getAttrs: dom => {
        if (!(dom instanceof HTMLElement)) return false;
        const raw = rawDomComments(dom);
        return { src: dom.getAttribute("src") ?? "", alt: dom.getAttribute("alt") ?? "", caption: dom.getAttribute("caption") ?? dom.getAttribute("title") ?? "", ratio: ratio(Number(dom.getAttribute("ratio") ?? 1)) ?? 1, knownextSizingRaw: raw, knownextSizingReadOnly: raw !== null || dom.dataset.knownextSizingReadonly === "true", knownextSizingExplicit: dom.dataset.knownextSizingExplicit === "true" };
      } }],
      toDOM: node => ["img", { "data-type": "image-block", src: node.attrs.src, ...imageDomAttributes(node.attrs) }],
      parseMarkdown: {
        match: node => node.type === "image-block",
        runner: (state, node, type) => {
          const image = node as AstNode;
          const alt = typeof image.alt === "string" ? image.alt : "";
          state.addNode(type, { src: typeof image.url === "string" ? image.url : "", alt, caption: typeof image.title === "string" ? image.title : "", ratio: ratio(image.knownextRatio) ?? legacyRatio(alt), knownextSizingRaw: rawComments(image.knownextSizingRaw), knownextSizingReadOnly: Boolean(image.knownextSizingReadOnly), knownextSizingExplicit: ratio(image.knownextRatio) !== null });
        },
      },
      toMarkdown: {
        match: node => node.type.name === "image-block",
        runner: (state, node) => {
          state.openNode("paragraph");
          state.addNode("image", undefined, undefined, { title: node.attrs.caption || null, url: node.attrs.src, alt: node.attrs.alt });
          state.closeNode();
          const raw = rawComments(node.attrs.knownextSizingRaw);
          if (raw) raw.forEach(value => state.addNode("html", undefined, value));
          else if (!node.attrs.knownextSizingReadOnly && (node.attrs.knownextSizingExplicit || (ratio(node.attrs.ratio) ?? 1) !== legacyRatio(node.attrs.alt))) state.addNode("html", undefined, `${PREFIX} ${JSON.stringify({ version: 1, ratio: ratio(node.attrs.ratio) ?? 1 })} -->`);
        },
      },
    };
  });
}

function imageDomAttributes(attrs: Record<string, unknown>): Record<string, string> {
  return {
    alt: typeof attrs.alt === "string" ? attrs.alt : "",
    title: typeof attrs.caption === "string" ? attrs.caption : "",
    caption: typeof attrs.caption === "string" ? attrs.caption : "",
    ratio: String(ratio(attrs.ratio) ?? 1),
    "data-knownext-sizing-readonly": String(Boolean(attrs.knownextSizingReadOnly)),
    "data-knownext-sizing-explicit": String(Boolean(attrs.knownextSizingExplicit)),
    ...(rawComments(attrs.knownextSizingRaw) ? { "data-knownext-image-metadata": JSON.stringify(attrs.knownextSizingRaw) } : {}),
  };
}
/** Crepe's image view has no ALT prop; synchronize accessible/clipboard DOM only. */
export function syncRenderedImageMetadata(image: HTMLImageElement, attrs: Record<string, unknown>) {
  const values = imageDomAttributes(attrs);
  for (const [key, value] of Object.entries(values)) if (image.getAttribute(key) !== value) image.setAttribute(key, value);
  if (!values["data-knownext-image-metadata"]) image.removeAttribute("data-knownext-image-metadata");
  const wrapper = image.closest<HTMLElement>(".image-wrapper");
  if (wrapper) wrapper.dataset.knownextSizingReadonly = String(Boolean(attrs.knownextSizingReadOnly));
}

/** Read-only Crepe views mount their image DOM asynchronously, without editor callbacks. */
export function createReadonlyImageMetadataPlugin(){
  return new Plugin({view(view){
    let closed=false;
    const synchronize=()=>{
      if(closed)return;
      view.state.doc.descendants((node,position)=>{
        if(node.type.name!=="image-block"&&node.type.name!=="image")return;
        const element=view.nodeDOM(position);
        const image=element instanceof HTMLImageElement?element:element instanceof HTMLElement?element.querySelector("img"):null;
        if(image)syncRenderedImageMetadata(image,node.attrs);
      });
    };
    const observer=new MutationObserver(synchronize);
    observer.observe(view.dom,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});
    queueMicrotask(synchronize);
    return{update:synchronize,destroy(){closed=true;observer.disconnect();}};
  }});
}

/** Editing image content/description keeps its independent sizing information. */
export function replacementImageAttributes(current: { type: { name: string }; attrs: Record<string, unknown> }, next: { attrs: Record<string, unknown> }): Record<string, unknown> {
  const attrs = { ...current.attrs, ...next.attrs };
  if (current.type.name === "image-block") {
    // The image dialog edits ALT/source only. Both schema variants supply an
    // empty default title; absence must not erase the existing visible caption.
    attrs.caption = typeof next.attrs.caption === "string" && next.attrs.caption ? next.attrs.caption : typeof next.attrs.title === "string" && next.attrs.title ? next.attrs.title : current.attrs.caption ?? "";
    for (const key of ["ratio", "knownextSizingRaw", "knownextSizingReadOnly", "knownextSizingExplicit"]) attrs[key] = current.attrs[key];
  }
  return attrs;
}
