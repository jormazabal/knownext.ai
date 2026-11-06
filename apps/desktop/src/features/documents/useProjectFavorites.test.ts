import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { addProjectFavorite, getProjectFavorites } from "../../lib/api/favorites";
import { useProjectFavorites } from "./useProjectFavorites";
import type { FavoriteEntry, ProjectFavorites } from "../../types/favorites";
vi.mock("../../lib/api/favorites",()=>({getProjectFavorites:vi.fn(),addProjectFavorite:vi.fn(),removeProjectFavorite:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const entry:FavoriteEntry={id:"favorite-one",path:"One.md",nodeId:"p::One.md",name:"One.md",kind:"document",createdAt:"2026-11-01T12:00:00Z",updatedAt:"2026-11-01T12:00:00Z",available:true};
function snapshot(project="p",entries:FavoriteEntry[]=[]):ProjectFavorites{return {projectId:project,entries,revision:entries.length?"r1":null,maximumEntries:256,checkedAt:entry.createdAt,scope:"this-device"};}
it("concilia un acuse desconocido sin repetir el cambio de favoritos",async()=>{
  vi.mocked(getProjectFavorites).mockResolvedValueOnce(snapshot()).mockResolvedValue(snapshot("p",[entry]));
  vi.mocked(addProjectFavorite).mockRejectedValue(new Error("Acuse desconocido"));
  const {result}=renderHook(()=>useProjectFavorites("p"));
  await waitFor(()=>expect(result.current.inventory).not.toBeNull());
  await act(async()=>{const first=result.current.toggle("One.md");void result.current.toggle("One.md");await first;});
  expect(addProjectFavorite).toHaveBeenCalledTimes(1);
  expect(result.current.inventory?.entries).toEqual([entry]);
  expect(result.current.error).toBe("");expect(result.current.notice).toContain("está guardado");
});
it("una respuesta de otro proyecto no reemplaza la lista actual",async()=>{
  let finish!:(value:ProjectFavorites)=>void;
  vi.mocked(getProjectFavorites).mockImplementation(project=>project==="old"?new Promise(resolve=>{finish=resolve;}):Promise.resolve(snapshot(project)));
  const {result,rerender}=renderHook(({project})=>useProjectFavorites(project),{initialProps:{project:"old"}});
  rerender({project:"new"});
  await waitFor(()=>expect(result.current.inventory?.projectId).toBe("new"));
  await act(async()=>finish(snapshot("old",[entry])));
  expect(result.current.inventory?.projectId).toBe("new");expect(result.current.inventory?.entries).toEqual([]);
});
