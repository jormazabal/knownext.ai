export type MarkdownEditorAction =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "clear-format"
  | "bullet-list"
  | "ordered-list"
  | "check-list"
  | "table"
  | "inline-code"
  | "code-block"
  | "link"
  | "image"
  | "diagram"
  | "quote"
  | "horizontal-rule"
  | "undo"
  | "redo";

export type MarkdownEditorController = {
  run: (action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => boolean;
  replaceMarkdown: (markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
  replaceRange: (from: number, to: number, markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
  insertMarkdown: (markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
  insertMarkdownAt: (position: number, markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
  replaceImageAt: (position: number, markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
  deleteImageAt: (position: number, options?: MarkdownEditorReplaceOptions) => boolean;
  replaceDiagramAt: (position: number, nodeSize: number, markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
  deleteDiagramAt: (position: number, nodeSize: number, options?: MarkdownEditorReplaceOptions) => boolean;
  setCursorAtClientPoint: (clientX: number, clientY: number, options?: MarkdownEditorReplaceOptions) => boolean;
  insertText: (text: string, options?: MarkdownEditorInsertTextOptions) => boolean;
  setTransientTextPreview: (text: string) => boolean;
  clearTransientTextPreview: () => boolean;
  canInsertText: () => boolean;
  getFormatState: () => MarkdownEditorFormatState;
  getHistoryState: () => MarkdownEditorHistoryState;
  setSelectionFocus: (selection: MarkdownEditorSelection | null) => boolean;
};

export type MarkdownEditorActionOptions = {
  table?: {
    rows: number;
    columns: number;
  };
  image?: {
    src: string;
    alt: string;
  };
  diagram?: {
    markdown: string;
  };
};

export type MarkdownEditorReplaceOptions = {
  addToHistory?: boolean;
};

export type MarkdownEditorInsertTextOptions = {
  addToHistory?: boolean;
};

export type MarkdownEditorExternalOperation = {
  id: string;
  documentId: string;
  aiEditOperationId?: string;
  kind?: "replace_document" | "replace_range" | "insert_at";
  markdown: string;
  from?: number | null;
  to?: number | null;
  position?: number | null;
  source: "ai";
  addToHistory?: boolean;
};

export type MarkdownEditorImageEditTarget = {
  position: number;
  src: string;
  alt: string;
  title?: string | null;
};

export type MarkdownEditorDiagramEditTarget = {
  position: number;
  nodeSize: number;
  code: string;
  caption?: string | null;
  width?: "compact" | "auto" | "wide" | "full" | null;
  widthRatio?: number | null;
};

export type MarkdownEditorFormatState = Partial<Record<MarkdownEditorAction, boolean>>;

export type MarkdownEditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
};

export type MarkdownEditorSelection = {
  focusType?: "selection" | "cursor";
  from: number;
  to: number;
  position?: number | null;
  text: string;
  nearTextBefore?: string | null;
  nearTextAfter?: string | null;
  blockType?: string | null;
  blockHash?: string | null;
};

export const emptyMarkdownEditorFormatState: MarkdownEditorFormatState = {};

export const emptyMarkdownEditorHistoryState: MarkdownEditorHistoryState = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
};
