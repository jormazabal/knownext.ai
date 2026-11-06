import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import { expect, it, vi } from "vitest";
import { createMarkdownEditorController } from "./editorCommands";
const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {} } });
const document = (text: string) => schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
it("checks the editor document itself, including typing not yet delivered to React", () => {
  let live = document("Original");
  let published = { markdown: "Original", document: live };
  const editor = { action: (action: (ctx: unknown) => unknown) => action({ get: (token: unknown) => token === editorViewCtx ? { state: { doc: live } } : undefined }) } as unknown as Editor;
  const controller = createMarkdownEditorController(editor, undefined, undefined, () => published);
  expect(controller.matchesMarkdown("Original")).toBe(true);
  live = document("New typing before the React callback");
  expect(controller.matchesMarkdown("Original")).toBe(false); expect(controller.matchesMarkdown("New typing before the React callback")).toBe(false);
  published = { markdown: "New typing before the React callback", document: live }; expect(controller.matchesMarkdown(published.markdown)).toBe(true);
  live = document(""); published = { markdown: "", document: live }; expect(controller.matchesMarkdown("")).toBe(true);
});
it("fails closed without a published snapshot or after the editor is disposed", () => {
  const editor = { action: () => { throw new Error("Editor disposed"); } } as unknown as Editor;
  expect(createMarkdownEditorController(editor).matchesMarkdown("Original")).toBe(false);
  expect(createMarkdownEditorController(editor, undefined, undefined, () => ({ markdown: "Original", document: document("Original") })).matchesMarkdown("Original")).toBe(false);
  expect(() => createMarkdownEditorController(editor).getMarkdownSnapshot()).toThrow("Editor disposed");
});
it("captures unpublished typing and preserves exact published Markdown when its document is unchanged", () => {
  let live = document("Original");
  const published = { markdown: "**Original** with original spacing", document: live };
  const serialize = vi.fn((node: ReturnType<typeof document>) => node.textContent);
  const editor = { action: (action: (ctx: unknown) => unknown) => action({ get: (token: unknown) => token === editorViewCtx ? { state: { doc: live } } : token === serializerCtx ? serialize : undefined }) } as unknown as Editor;
  const controller = createMarkdownEditorController(editor, undefined, undefined, () => published);
  expect(controller.getMarkdownSnapshot()).toBe(published.markdown);
  expect(serialize).not.toHaveBeenCalled();
  live = document("New typing before React received it");
  expect(controller.getMarkdownSnapshot()).toBe("New typing before React received it");
  expect(published.markdown).toBe("**Original** with original spacing");
  expect(serialize).toHaveBeenCalledOnce();
});

it("does not snapshot or approve a live text composition",()=>{
 let composing=true;const live=document("Original");const published={markdown:"Original",document:live};
 const editor={action:(action:(ctx:unknown)=>unknown)=>action({get:(token:unknown)=>token===editorViewCtx?{state:{doc:live},composing}:undefined})}as unknown as Editor;
 const controller=createMarkdownEditorController(editor,undefined,undefined,()=>published);
 expect(controller.matchesMarkdown("Original")).toBe(false);expect(()=>controller.getMarkdownSnapshot()).toThrow("composición");
 composing=false;expect(controller.matchesMarkdown("Original")).toBe(true);expect(controller.getMarkdownSnapshot()).toBe("Original");
});
