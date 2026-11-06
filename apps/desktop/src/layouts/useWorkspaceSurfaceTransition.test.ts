import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceSurfaceTransition } from "./useWorkspaceSurfaceTransition";

let frames: Map<number,FrameRequestCallback>, next: number;
const roots: HTMLElement[]=[];
beforeEach(()=>{
  frames=new Map();next=0;
  vi.spyOn(globalThis,"requestAnimationFrame").mockImplementation(callback=>{frames.set(++next,callback);return next;});
  vi.spyOn(globalThis,"cancelAnimationFrame").mockImplementation(id=>{frames.delete(id);});
});
afterEach(()=>{cleanup();for(const root of roots.splice(0))root.remove();vi.restoreAllMocks();});
function flushFrames(){act(()=>{const work=[...frames.values()];frames.clear();for(const callback of work)callback(0);});}
function setup(){
  const settings=document.createElement("section"),documentRoot=document.createElement("section");settings.tabIndex=-1;
  const hidden=document.createElement("div"),visible=document.createElement("div");
  for(const element of [hidden,visible]){element.setAttribute("contenteditable","true");element.tabIndex=0;documentRoot.append(element);}
  hidden.hidden=true;vi.spyOn(visible,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  document.body.append(settings,documentRoot);roots.push(settings,documentRoot);
  const refs={settings:{current:settings},document:{current:documentRoot}};
  const view=renderHook(({mode})=>{const [navigationOpen,setNavigationOpen]=useState(false);useWorkspaceSurfaceTransition(mode,refs.settings,refs.document,setNavigationOpen);return {navigationOpen,setNavigationOpen};},{initialProps:{mode:false}});
  return {...view,settings,hidden,visible};
}

it("closes a temporary settings drawer on return and focuses the visible cached editor",()=>{
  const view=setup();act(()=>view.result.current.setNavigationOpen(true));view.rerender({mode:true});flushFrames();
  expect(view.result.current.navigationOpen).toBe(false);expect(view.settings).toHaveFocus();
  act(()=>view.result.current.setNavigationOpen(true));view.rerender({mode:false});flushFrames();
  expect(view.result.current.navigationOpen).toBe(false);expect(view.visible).toHaveFocus();expect(view.hidden).not.toHaveFocus();
});

it("cancels a superseded focus frame instead of focusing the surface that was just left",()=>{
  const view=setup(),focus=vi.spyOn(view.settings,"focus");view.rerender({mode:true});view.rerender({mode:false});flushFrames();
  expect(focus).not.toHaveBeenCalled();expect(view.visible).toHaveFocus();
});
