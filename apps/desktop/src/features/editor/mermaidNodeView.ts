import { Plugin } from "@milkdown/kit/prose/state";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import type { MarkdownEditorDiagramEditTarget } from "./editorTypes";
import { extractKnownextDiagramMetadata, renderMermaidSvg, stableHash, stripKnownextDiagramMetadata } from "./mermaidDiagrams";

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
      width: metadata.width ?? "wide",
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
  dom.className = `knownext-mermaid-diagram knownext-mermaid-diagram-${readDiagramWidth(node)}`;
  dom.contentEditable = "false";

  const header = document.createElement("div");
  header.className = "knownext-mermaid-diagram-header";

  const badge = document.createElement("span");
  badge.className = "knownext-mermaid-diagram-badge";
  badge.textContent = "Mermaid";
  header.appendChild(badge);

  const actions = document.createElement("div");
  actions.className = "knownext-mermaid-diagram-actions";
  if (onEditRequest) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "knownext-mermaid-diagram-edit";
    editButton.textContent = "Editar";
    editButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const position = typeof getPos === "function" ? getPos() : undefined;
      if (typeof position !== "number") return;
      const code = node.textContent;
      const metadata = extractKnownextDiagramMetadata(code);
      onEditRequest({
        position,
        nodeSize: node.nodeSize,
        code: stripKnownextDiagramMetadata(code),
        caption: metadata.caption ?? null,
        width: metadata.width ?? "wide",
      });
    });
    actions.appendChild(editButton);
  }
  header.appendChild(actions);
  dom.appendChild(header);

  const viewport = document.createElement("div");
  viewport.className = "knownext-mermaid-diagram-viewport";
  dom.appendChild(viewport);

  const caption = document.createElement("p");
  caption.className = "knownext-mermaid-diagram-caption";
  dom.appendChild(caption);

  void renderNode(node, viewport, caption, dom);

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
      dom.className = `knownext-mermaid-diagram knownext-mermaid-diagram-${readDiagramWidth(nextNode)}`;
      void renderNode(nextNode, viewport, caption, dom);
      return true;
    },
    stopEvent(event) {
      return Boolean((event.target as Element | null)?.closest(".knownext-mermaid-diagram-edit"));
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

async function renderNode(node: ProseMirrorNode, viewport: HTMLElement, caption: HTMLElement, shell: HTMLElement) {
  const code = node.textContent;
  const metadata = extractKnownextDiagramMetadata(code);
  const renderCode = stripKnownextDiagramMetadata(code);
  caption.textContent = metadata.caption ?? "";
  caption.hidden = !metadata.caption;
  viewport.innerHTML = "";
  viewport.classList.remove("knownext-mermaid-diagram-error");
  shell.classList.toggle("knownext-mermaid-diagram-has-caption", Boolean(metadata.caption));

  const loading = document.createElement("div");
  loading.className = "knownext-mermaid-diagram-loading";
  loading.textContent = "Renderizando diagrama...";
  viewport.appendChild(loading);

  try {
    const svg = await renderMermaidSvg(renderCode, "knownext-editor-diagram");
    viewport.innerHTML = svg;
  } catch (error) {
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

function readDiagramWidth(node: ProseMirrorNode) {
  return extractKnownextDiagramMetadata(node.textContent).width ?? "wide";
}
