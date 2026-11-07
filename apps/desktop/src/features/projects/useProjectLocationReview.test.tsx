import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {useProjectLocationReview} from "./useProjectLocationReview";
import {reviewProjectLocation} from "../../lib/api/projectLocations";
import type {ProjectLocationReview} from "../../types/projectLocation";
vi.mock("../../lib/api/projectLocations",()=>({reviewProjectLocation:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const review:ProjectLocationReview={projectId:"p",projectName:"Proyecto",currentPath:"C:/Anterior",candidatePath:"D:/Nueva",registryRevision:"a".repeat(64),folderStamp:"b".repeat(64),originalAvailable:false,targetHasHistory:false,checkedAt:"2026-11-01T12:00:00Z",scope:"association-only"};
it("no confirma otro propietario ni abre una revisión tardía y cancelar conserva la asociación",async()=>{
  let resolve!:(value:ProjectLocationReview)=>void;vi.mocked(reviewProjectLocation).mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const hook=renderHook(({id})=>useProjectLocationReview(id),{initialProps:{id:"p"}});
  let pending!:Promise<ProjectLocationReview|null>;act(()=>{pending=hook.result.current.request("p","D:/Nueva");});
  hook.rerender({id:"other"});await act(async()=>resolve(review));expect(await pending).toBeNull();expect(hook.result.current.review).toBeNull();
  hook.rerender({id:"p"});vi.mocked(reviewProjectLocation).mockResolvedValue(review);
  act(()=>{pending=hook.result.current.request("p","D:/Nueva");});await waitFor(()=>expect(hook.result.current.review).toEqual(review));
  act(()=>hook.result.current.cancel());expect(await pending).toBeNull();expect(hook.result.current.review).toBeNull();
  act(()=>{pending=hook.result.current.request("p","D:/Nueva");});await waitFor(()=>expect(hook.result.current.review).toEqual(review));
  act(()=>hook.result.current.confirm());expect(await pending).toEqual(review);
});
