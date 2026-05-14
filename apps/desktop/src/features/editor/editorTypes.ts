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
  | "quote"
  | "horizontal-rule"
  | "undo"
  | "redo";

export type MarkdownEditorController = {
  run: (action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => boolean;
  replaceMarkdown: (markdown: string, options?: MarkdownEditorReplaceOptions) => boolean;
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
  markdown: string;
  source: "ai";
  addToHistory?: boolean;
};

export type MarkdownEditorFormatState = Partial<Record<MarkdownEditorAction, boolean>>;

export type MarkdownEditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
};

export type MarkdownEditorSelection = {
  from: number;
  to: number;
  text: string;
};

export const emptyMarkdownEditorFormatState: MarkdownEditorFormatState = {};

export const emptyMarkdownEditorHistoryState: MarkdownEditorHistoryState = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
};
