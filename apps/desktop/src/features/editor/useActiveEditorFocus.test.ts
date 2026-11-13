import { act, cleanup, renderHook } from "@testing-library/react";
import type { EditorView } from "@milkdown/kit/prose/view";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useActiveEditorFocus } from "./useActiveEditorFocus";

let frames: Map<number, FrameRequestCallback>, next=0;
beforeEach(()=>{
  frames=new Map();
  vi.spyOn(globalThis,"requestAnimationFrame").mockImplementation(cb=>{frames.set(++next,cb);return next;});
  vi.spyOn(globalThis,"cancelAnimationFrame").mockImplementation(id=>{frames.delete(id);});
});
afterEach(()=>{cleanup();document.body.replaceChildren();vi.restoreAllMocks();});
function flush(){act(()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb(0));});}
function setup(active=false,ready=true){
  const dom=document.createElement("div");dom.className="knownext-editor";dom.tabIndex=0;document.body.append(dom);
  vi.spyOn(dom,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  const focus=vi.fn(()=>dom.focus());
  const view={current:{dom,focus,isDestroyed:false} as unknown as EditorView};
  return {...renderHook(props=>useActiveEditorFocus(props.active,props.ready,view),{initialProps:{active,ready}}),focus,dom};
}
it("focuses only the activated ready editor and ignores background rerenders",()=>{
  const view=setup();flush();expect(view.focus).not.toHaveBeenCalled();
  view.rerender({active:true,ready:true});flush();expect(view.dom).toHaveFocus();expect(view.focus).toHaveBeenCalledOnce();
  view.rerender({active:true,ready:true});flush();expect(view.focus).toHaveBeenCalledOnce();
  view.rerender({active:false,ready:true});view.rerender({active:true,ready:true});flush();expect(view.focus).toHaveBeenCalledTimes(2);
});
it("does not steal focus from search or AI when the editor finishes loading",()=>{
  const view=setup(true,false);const input=document.createElement("textarea");document.body.append(input);input.focus();
  view.rerender({active:true,ready:true});flush();expect(input).toHaveFocus();expect(view.focus).not.toHaveBeenCalled();
});
it("waits for the dialog to close before focusing a newly opened document",async()=>{
  const dialog=document.createElement("section");dialog.setAttribute("role","dialog");document.body.append(dialog);
  const view=setup(true);flush();expect(view.focus).not.toHaveBeenCalled();
  await act(async()=>{dialog.remove();});flush();expect(view.dom).toHaveFocus();
});
it("cancels a delayed focus if the user leaves that tab",()=>{
  const view=setup(true);view.rerender({active:false,ready:true});flush();expect(view.focus).not.toHaveBeenCalled();
});
