import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { history, undo, undoDepth } from "@milkdown/kit/prose/history";
import { expect, it, vi } from "vitest";
import { createMarkdownEditorController } from "./editorCommands";

const schema = new Schema({nodes:{doc:{content:"block+"},paragraph:{content:"inline*",group:"block"},image:{inline:true,group:"inline"},text:{group:"inline"}},marks:{strong:{},em:{}}});
function harness(content: Parameters<typeof schema.node>[2]) {
  const view={state:EditorState.create({schema,doc:schema.node("doc",null,content),plugins:[history()]}),focus:vi.fn(),dispatch(transaction:Transaction){view.state=view.state.apply(transaction);}};
  const editor={action:(callback:(ctx:{get:(key:unknown)=>typeof view})=>unknown)=>callback({get:key=>{if(key!==editorViewCtx)throw Error("Unexpected context");return view;}})} as unknown as Editor;
  return {view,controller:createMarkdownEditorController(editor)};
}

it("replaces only reviewed matches on the current model and isolates the replacement undo step", () => {
  const {view,controller}=harness([schema.node("paragraph",null,[schema.text("Plan "),schema.text("PLAN",[schema.mark("strong")]),schema.text(" planner "),schema.node("image"),schema.text(" Plan")])]);
  view.dispatch(view.state.tr.insertText("Before ",1));
  const before=view.state.doc;
  expect(controller.replaceText!("plan","Entrega",true,0,{wholeWord:true})).toBe(3);
  const replaced=view.state.doc;
  expect(replaced.textContent).toBe("Before Entrega Entrega planner  Entrega");
  expect(replaced.child(0).child(1).marks[0].type.name).toBe("strong");
  expect(replaced.child(0).child(3).type.name).toBe("image");
  expect(undoDepth(view.state)).toBe(2);
  view.dispatch(view.state.tr.insertText("!",view.state.doc.content.size-1));
  expect(undoDepth(view.state)).toBe(3);
  expect(undo(view.state,transaction=>view.dispatch(transaction))).toBe(true);
  expect(view.state.doc.eq(replaced)).toBe(true);
  expect(undo(view.state,transaction=>view.dispatch(transaction))).toBe(true);
  expect(view.state.doc.eq(before)).toBe(true);
});

it("rejects unreviewable sets, out-of-range selections and oversized queries without writes", () => {
  const {view,controller}=harness([schema.node("paragraph",null,[schema.text("a ".repeat(1001))])]);
  const before=view.state.doc;
  expect(controller.replaceText!("a","b",true)).toBe(0);
  expect(controller.replaceText!("a".repeat(201),"b",true)).toBe(0);
  expect(controller.replaceText!("missing","b",false,2)).toBe(0);
  expect(view.state.doc.eq(before)).toBe(true);
  expect(undoDepth(view.state)).toBe(0);
  expect(view.focus).not.toHaveBeenCalled();
});
