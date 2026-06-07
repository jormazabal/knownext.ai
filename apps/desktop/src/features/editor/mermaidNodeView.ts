import { NodeSelection, Plugin } from "@milkdown/kit/prose/state";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import type { MarkdownEditorDiagramEditTarget } from "./editorTypes";
import {
  extractKnownextDiagramMetadata,
  normalizeDiagramWidthRatio,
  renderMermaidSvg,
  resolveMermaidDiagramWidthRatio,
  stableHash,
  stripKnownextDiagramMetadata,
  updateKnownextDiagramMetadata,
} from "./mermaidDiagrams";

export function createMermaidDiagramPlugin(onEditRequest?: (target: MarkdownEditorDiagramEditTarget) => void) {
  return new Plugin({
    props: {
      handleClick(view, _position, event) {
        const editButton = (event.target as Element | null)?.closest("[data-knownext-mermaid-edit]");
        if (!editButton || !onEditRequest) return false;

        event.preventDefault();
        event.stopPropagation();

        const codeHash = editButton.getAttribute("data-knownext-mermaid-hash");
        if (!codeHash) return true;

        const target = findMermaidDiagramByHash(view, codeHash);
        if (target) onEditRequest(target);
        return true;
      },
    },
  });
}

export function createMermaidDiagramViewPlugin(onEditRequest?: (target: MarkdownEditorDiagramEditTarget) => void) {
  return $view(
    codeBlockSchema.node,
    (): NodeViewConstructor =>
      (node, view, getPos) => {
        if (readCodeLanguage(node) !== "mermaid") return createCodeBlockNodeView(node);
        return createMermaidDiagramNodeView(node, view, getPos, onEditRequest);
      },
  );
}

export function findMermaidDiagramByHash(view: EditorView, codeHash: string): MarkdownEditorDiagramEditTarget | null {
  let target: MarkdownEditorDiagramEditTarget | null = null;
  view.state.doc.descendants((node, position) => {
    if (target || node.type.name !== "code_block" || readCodeLanguage(node) !== "mermaid") return !target;
    const code = node.textContent;
    const renderCode = stripKnownextDiagramMetadata(code);
    if (stableHash(renderCode) !== codeHash) return true;

    const metadata = extractKnownextDiagramMetadata(code);
    target = {
      position,
      nodeSize: node.nodeSize,
      code: renderCode,
      caption: metadata.caption ?? null,
      width: metadata.width ?? null,
      widthRatio: metadata.widthRatio ?? null,
    };
    return false;
  });
  return target;
}

function createMermaidDiagramNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
  onEditRequest?: (target: MarkdownEditorDiagramEditTarget) => void,
): NodeView {
  const dom = document.createElement("section");
  dom.className = "knownext-mermaid-diagram";
  setDiagramSizing(dom, extractKnownextDiagramMetadata(node.textContent));
  dom.contentEditable = "false";
  dom.addEventListener("click", (event) => {
    const position = typeof getPos === "function" ? getPos() : undefined;
    if (typeof position !== "number") return;
    event.preventDefault();
    view.focus();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)).scrollIntoView());
  });

  const viewport = document.createElement("div");
  viewport.className = "knownext-mermaid-diagram-viewport";
  dom.appendChild(viewport);

  const caption = document.createElement("p");
  caption.className = "knownext-mermaid-diagram-caption";
  dom.appendChild(caption);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "knownext-diagram-resize-handle";
  resizeHandle.title = "Ajustar tamaño";
  resizeHandle.setAttribute("aria-hidden", "true");
  resizeHandle.addEventListener("pointerdown", (event) => startDiagramResize(event, dom, view, getPos, () => node));
  dom.appendChild(resizeHandle);

  let renderState = readDiagramRenderState(node);
  let renderVersion = 0;
  void renderNode(renderState, viewport, caption, dom, ++renderVersion);

  return {
    dom,
    selectNode() {
      dom.classList.add("knownext-mermaid-diagram-selected");
    },
    deselectNode() {
      dom.classList.remove("knownext-mermaid-diagram-selected");
    },
    update(nextNode) {
      if (nextNode.type !== node.type || readCodeLanguage(nextNode) !== "mermaid") return false;
      node = nextNode;
      setDiagramSizing(dom, extractKnownextDiagramMetadata(nextNode.textContent));
      const nextRenderState = readDiagramRenderState(nextNode);
      if (nextRenderState.key !== renderState.key) {
        renderState = nextRenderState;
        void renderNode(nextRenderState, viewport, caption, dom, ++renderVersion);
      }
      return true;
    },
    stopEvent(event) {
      return Boolean((event.target as Element | null)?.closest("[data-knownext-media-overlay], .knownext-diagram-resize-handle"));
    },
    ignoreMutation() {
      return true;
    },
  };
}

function createCodeBlockNodeView(node: ProseMirrorNode): NodeView {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  const language = readCodeLanguage(node);
  if (language) pre.dataset.language = language;
  pre.appendChild(code);
  return { dom: pre, contentDOM: code };
}

type DiagramRenderState = {
  key: string;
  renderCode: string;
  caption: string;
};

function readDiagramRenderState(node: ProseMirrorNode): DiagramRenderState {
  const code = node.textContent;
  const metadata = extractKnownextDiagramMetadata(code);
  const renderCode = stripKnownextDiagramMetadata(code);
  const caption = metadata.caption ?? "";
  return {
    key: `${stableHash(renderCode)}:${caption}`,
    renderCode,
    caption,
  };
}

async function renderNode(state: DiagramRenderState, viewport: HTMLElement, caption: HTMLElement, shell: HTMLElement, renderVersion: number) {
  caption.textContent = state.caption;
  caption.hidden = !state.caption;
  viewport.innerHTML = "";
  viewport.classList.remove("knownext-mermaid-diagram-error");
  shell.classList.toggle("knownext-mermaid-diagram-has-caption", Boolean(state.caption));
  shell.dataset.renderVersion = String(renderVersion);

  const loading = document.createElement("div");
  loading.className = "knownext-mermaid-diagram-loading";
  loading.textContent = "Renderizando diagrama...";
  viewport.appendChild(loading);

  try {
    const svg = await renderMermaidSvg(state.renderCode, "knownext-editor-diagram");
    if (shell.dataset.renderVersion !== String(renderVersion)) return;
    viewport.innerHTML = svg;
  } catch (error) {
    if (shell.dataset.renderVersion !== String(renderVersion)) return;
    viewport.classList.add("knownext-mermaid-diagram-error");
    viewport.innerHTML = "";
    const message = document.createElement("p");
    message.textContent = error instanceof Error && error.message ? error.message : "No se pudo renderizar el diagrama.";
    viewport.appendChild(message);
  }
}

function readCodeLanguage(node: ProseMirrorNode) {
  return typeof node.attrs.language === "string" ? node.attrs.language.trim().toLowerCase() : "";
}

function setDiagramSizing(dom: HTMLElement, metadata: ReturnType<typeof extractKnownextDiagramMetadata>) {
  dom.classList.remove(
    "knownext-mermaid-diagram-compact",
    "knownext-mermaid-diagram-auto",
    "knownext-mermaid-diagram-wide",
    "knownext-mermaid-diagram-full",
  );
  dom.classList.add(`knownext-mermaid-diagram-${metadata.width ?? "wide"}`);

  const ratio = resolveMermaidDiagramWidthRatio(metadata);
  if (ratio) {
    dom.style.width = `${Math.round(ratio * 1000) / 10}%`;
    dom.style.maxWidth = "100%";
  } else {
    dom.style.removeProperty("width");
    dom.style.removeProperty("max-width");
  }
}

function startDiagramResize(
  event: PointerEvent,
  dom: HTMLElement,
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
  readNode: () => ProseMirrorNode,
) {
  event.preventDefault();
  event.stopPropagation();

  const container = dom.parentElement ?? view.dom;
  const containerRect = container.getBoundingClientRect();
  if (!Number.isFinite(containerRect.width) || containerRect.width <= 0) return;

  const startPointerY = event.clientY;
  const startRect = dom.getBoundingClientRect();
  const startWidth = Number.isFinite(startRect.width) && startRect.width > 0 ? startRect.width : containerRect.width;
  const startHeight = Number.isFinite(startRect.height) && startRect.height > 0 ? startRect.height : Math.max(1, startWidth * 0.56);
  const aspectRatio = startWidth / startHeight;
  let latestRatio = readRatioFromVerticalDrag(0, startWidth, startHeight, aspectRatio, containerRect.width);
  applyLiveDiagramRatio(dom, latestRatio);

  const handlePointerMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault();
    latestRatio = readRatioFromVerticalDrag(moveEvent.clientY - startPointerY, startWidth, startHeight, aspectRatio, containerRect.width);
    applyLiveDiagramRatio(dom, latestRatio);
  };

  const finish = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);

    const position = typeof getPos === "function" ? getPos() : undefined;
    if (typeof position !== "number") return;

    const currentNode = readNode();
    const nextCode = updateKnownextDiagramMetadata(currentNode.textContent, {
      width: null,
      widthRatio: latestRatio,
    });
    const from = position + 1;
    const to = position + currentNode.nodeSize - 1;
    const transaction = view.state.tr.replaceWith(from, to, view.state.schema.text(nextCode)).scrollIntoView();
    view.dispatch(transaction);
    view.focus();
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

function readRatioFromVerticalDrag(deltaY: number, startWidth: number, startHeight: number, aspectRatio: number, containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;

  const targetHeight = Math.max(1, startHeight + deltaY);
  const targetWidth = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? targetHeight * aspectRatio
    : startWidth + deltaY;
  return normalizeDiagramWidthRatio(targetWidth / containerWidth) ?? 1;
}

function applyLiveDiagramRatio(dom: HTMLElement, ratio: number) {
  dom.style.width = `${Math.round(ratio * 1000) / 10}%`;
  dom.style.maxWidth = "100%";
}
