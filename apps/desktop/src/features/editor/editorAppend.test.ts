import {expect,it} from "vitest";
import type {Editor} from "@milkdown/kit/core";
import {editorViewCtx,parserCtx} from "@milkdown/kit/core";
import {Schema} from "@milkdown/kit/prose/model";
import {EditorState,type Transaction} from "@milkdown/kit/prose/state";
import {history,undo} from "@milkdown/kit/prose/history";
import {createMarkdownEditorController} from "./editorCommands";
const schema=new Schema({nodes:{doc:{content:"block+"},paragraph:{group:"block",content:"text*"},image:{group:"block",attrs:{src:{}},atom:true},text:{group:"inline"}}});
function fixture(){let state=EditorState.create({schema,doc:schema.node("doc",null,[schema.node("paragraph",null,schema.text("Original"))]),plugins:[history()]});let composing=false;let fail=false;const dispatch=(transaction:Transaction)=>{state=state.apply(transaction);};const view={get state(){return state;},get composing(){return composing;},dispatch};const editor={action:(work:(ctx:unknown)=>unknown)=>work({get:(token:unknown)=>token===editorViewCtx?view:token===parserCtx?()=>{if(fail)throw Error("Unknown format");return schema.node("doc",null,[schema.node("image",{src:"Imagen.png"})]);}:undefined})}as unknown as Editor;return{controller:createMarkdownEditorController(editor),state:()=>state,dispatch,compose:()=>{composing=true;},fail:()=>{fail=true;}};}
it("appends without replacing existing nodes and isolates image undo from prior and subsequent typing",()=>{
 const f=fixture();f.dispatch(f.state().tr.insertText(" previo",9));const existing=f.state().doc.firstChild!;const selection=f.state().selection.from;
 expect(f.controller.appendMarkdown?.("![Imagen](Imagen.png)",{addToHistory:true})).toBe(true);expect(f.state().doc.firstChild).toBe(existing);expect(f.state().doc.childCount).toBe(2);expect(f.state().selection.from).toBe(selection);
 f.dispatch(f.state().tr.insertText(" después",1));expect(undo(f.state(),f.dispatch)).toBe(true);expect(f.state().doc.childCount).toBe(2);expect(f.state().doc.firstChild?.textContent).toBe("Original previo");
 expect(undo(f.state(),f.dispatch)).toBe(true);expect(f.state().doc.childCount).toBe(1);expect(f.state().doc.textContent).toBe("Original previo");expect(undo(f.state(),f.dispatch)).toBe(true);expect(f.state().doc.textContent).toBe("Original");
});
it("refuses an active composition or parse failure without changing the document",()=>{
 for(const mode of ["compose","fail"]as const){const f=fixture(),before=f.state().doc;f[mode]();expect(f.controller.appendMarkdown?.("unverified")).toBe(false);expect(f.state().doc).toBe(before);}
});
