export type MarkdownEditorAction =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bold"
  | "italic"
  | "strike"
  | "clear-format"
  | "bullet-list"
  | "ordered-list"
  | "check-list"
  | "table"
  | "code"
  | "link"
  | "image"
  | "quote"
  | "horizontal-rule"
  | "undo"
  | "redo";

export type MarkdownEditorController = {
  run: (action: MarkdownEditorAction) => boolean;
  getFormatState: () => MarkdownEditorFormatState;
};

export type MarkdownEditorFormatState = Partial<Record<MarkdownEditorAction, boolean>>;

export const emptyMarkdownEditorFormatState: MarkdownEditorFormatState = {};
