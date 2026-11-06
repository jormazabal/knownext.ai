import {act,cleanup,renderHook} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {useContextVisibility} from "./useContextVisibility";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

function media(initial:boolean){
  const listeners=new Set<()=>void>();
  const query={matches:initial,addEventListener:(_event:string,listener:()=>void)=>listeners.add(listener),removeEventListener:(_event:string,listener:()=>void)=>listeners.delete(listener)};
  vi.stubGlobal("matchMedia",()=>query);
  return (wide:boolean)=>act(()=>{query.matches=wide;listeners.forEach(listener=>listener());});
}

it("opens the saved pinned panel when project and preferences hydrate in the same render",()=>{
  media(true);
  const {result,rerender}=renderHook(({pinned,projectId}:{pinned:boolean;projectId:string|null})=>useContextVisibility(pinned,projectId),{initialProps:{pinned:false,projectId:null} as {pinned:boolean;projectId:string|null}});
  expect(result.current[0]).toBe(false);
  rerender({pinned:true,projectId:"project"});
  expect(result.current[0]).toBe(true);
  rerender({pinned:false,projectId:"project"});
  expect(result.current[0]).toBe(true); // Unpinning keeps the temporary view open.
  rerender({pinned:false,projectId:"another"});
  expect(result.current[0]).toBe(false);
});

it("honors an explicit hide until pinning is activated again",()=>{
  media(true);
  const {result,rerender}=renderHook(({pinned,projectId})=>useContextVisibility(pinned,projectId),{initialProps:{pinned:true,projectId:"one"}});
  act(()=>result.current[1](false));
  rerender({pinned:true,projectId:"two"});expect(result.current[0]).toBe(false);
  rerender({pinned:false,projectId:"two"});expect(result.current[0]).toBe(false);
  rerender({pinned:true,projectId:"two"});expect(result.current[0]).toBe(true);
});

it("does not cover the mobile document on hydration and closes an explicit overlay on document change",()=>{
  media(false);
  const {result,rerender}=renderHook(({pinned,tab})=>useContextVisibility(pinned,"project",tab),{initialProps:{pinned:false,tab:"a"}});
  rerender({pinned:true,tab:"a"});expect(result.current[0]).toBe(false);
  act(()=>result.current[1](true));expect(result.current[0]).toBe(true);
  rerender({pinned:true,tab:"b"});expect(result.current[0]).toBe(false);
  act(()=>result.current[1](true));rerender({pinned:true,tab:"b"});expect(result.current[0]).toBe(true);
});

it("restores a saved desktop pin after narrowing while respecting an explicit hide",()=>{
  const resize=media(true);
  const {result}=renderHook(()=>useContextVisibility(true,"project","a"));
  expect(result.current[0]).toBe(true);
  resize(false);expect(result.current[0]).toBe(false);
  resize(true);expect(result.current[0]).toBe(true);
  act(()=>result.current[1](false));resize(false);resize(true);expect(result.current[0]).toBe(false);
});
