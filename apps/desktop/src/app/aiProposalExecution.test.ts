import { expect, it } from "vitest";
import { AiProposalExecution, nextAiEditorOperationId } from "./aiProposalExecution";
import type { MarkdownEditorExternalOperation } from "../features/editor/editorTypes";
const operation=(proposal="p"):MarkdownEditorExternalOperation=>({id:nextAiEditorOperationId("same-prefix"),aiProposalId:proposal,documentId:"project::a.md",source:"ai",markdown:"Output"});
it("prevents a second apply until both preparation and editor ACK finish",()=>{
  const gate=new AiProposalExecution(),first=operation();expect(gate.begin("p")).toBe(true);expect(gate.begin("p")).toBe(false);
  expect(gate.queue(first)).toBe(true);gate.finishPreparation("p");expect(gate.isActive("p")).toBe(true);expect(gate.begin("p")).toBe(false);
  expect(gate.settle(first.id)).toEqual(first);expect(gate.isActive("p")).toBe(false);expect(gate.begin("p")).toBe(true);
});
it("also waits for preparation if the editor acknowledges immediately",()=>{
  const gate=new AiProposalExecution(),first=operation();gate.begin("p");gate.queue(first);gate.settle(first.id);
  expect(gate.isActive("p")).toBe(true);gate.finishPreparation("p");expect(gate.isActive("p")).toBe(false);
});
it("cancels pending authority and rejects a late operation without disturbing another proposal",()=>{
  const gate=new AiProposalExecution(),first=operation(),other=operation("other");gate.begin("p");gate.begin("other");gate.queue(first);gate.queue(other);
  expect(gate.cancel("p")).toEqual([first]);expect(gate.mayApply(first.id)).toBe(false);expect(gate.settle(first.id)).toBeUndefined();expect(gate.queue(operation())).toBe(false);
  expect(gate.mayApply(other.id)).toBe(true);expect(gate.isActive("other")).toBe(true);
});
it("assigns distinct operation identities to an immediate retry after cancellation",()=>{
  const gate=new AiProposalExecution(),first=operation();gate.begin("p");gate.queue(first);gate.cancel("p");gate.begin("p");const retry=operation();gate.queue(retry);
  expect(retry.id).not.toBe(first.id);expect(gate.mayApply(first.id)).toBe(false);expect(gate.mayApply(retry.id)).toBe(true);expect(gate.queue(retry)).toBe(false);
});
