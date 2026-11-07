import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AiEditProposal } from "../../types/domain";
import { useAiProposalAutoApply } from "./useAiProposalAutoApply";
afterEach(cleanup);
const proposal: AiEditProposal={id:"proposal",projectId:"project",interactionId:"interaction",status:"proposed",title:"Edit",summary:"Edit",scope:"document",operations:[],createdAt:"now",updatedAt:"now",requiresConfirmation:false};
it("dispatches an allowed arrival once and uses the latest callback",async()=>{
  const first=vi.fn(),latest=vi.fn();
  const {rerender}=renderHook(({value,apply})=>useAiProposalAutoApply(value,true,apply),{initialProps:{value:null as AiEditProposal|null,apply:first}});
  await act(async()=>rerender({value:proposal,apply:latest}));expect(first).not.toHaveBeenCalled();expect(latest).toHaveBeenCalledOnce();expect(latest).toHaveBeenCalledWith(proposal.id);
  await act(async()=>rerender({value:{...proposal},apply:latest}));expect(latest).toHaveBeenCalledOnce();
});
it("keeps runtime-required and unknown policies for explicit review",async()=>{
  const apply=vi.fn();const {rerender}=renderHook(({value})=>useAiProposalAutoApply(value,true,apply),{initialProps:{value:{...proposal,requiresConfirmation:true} as AiEditProposal}});
  await act(async()=>rerender({value:{...proposal,id:"legacy",requiresConfirmation:undefined}}));expect(apply).not.toHaveBeenCalled();
});
it("does not apply an old proposal when the user later enables automatic edits",async()=>{
  const apply=vi.fn();const {rerender}=renderHook(({value,enabled})=>useAiProposalAutoApply(value,enabled,apply),{initialProps:{value:proposal,enabled:false}});
  await act(async()=>rerender({value:proposal,enabled:true}));expect(apply).not.toHaveBeenCalled();
  await act(async()=>rerender({value:{...proposal,id:"new-arrival"},enabled:true}));expect(apply).toHaveBeenCalledOnce();expect(apply).toHaveBeenCalledWith("new-arrival");
});
it("does not release a non-proposed result or retry a failed automatic dispatch",async()=>{
  const apply=vi.fn();const {rerender}=renderHook(({value})=>useAiProposalAutoApply(value,true,apply),{initialProps:{value:{...proposal,status:"discarded"} as AiEditProposal}});
  expect(apply).not.toHaveBeenCalled();await act(async()=>rerender({value:proposal}));expect(apply).toHaveBeenCalledOnce();
  await act(async()=>rerender({value:{...proposal,status:"stale"}}));await act(async()=>rerender({value:proposal}));expect(apply).toHaveBeenCalledOnce();
});
