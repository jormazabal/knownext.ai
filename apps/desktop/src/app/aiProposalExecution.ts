import type { MarkdownEditorExternalOperation } from "../features/editor/editorTypes";

let operationSequence = 0;
export const nextAiEditorOperationId = (prefix: string) => `${prefix}-${++operationSequence}`;

/** An editor ACK and asynchronous preparation must both finish before another apply. */
export class AiProposalExecution {
  private active = new Map<string, { preparing: boolean; operations: Set<string> }>();
  private operations = new Map<string, MarkdownEditorExternalOperation>();
  begin(id: string) {
    if (this.active.has(id)) return false;
    this.active.set(id, { preparing: true, operations: new Set() }); return true;
  }
  queue(operation: MarkdownEditorExternalOperation) {
    const state = operation.aiProposalId ? this.active.get(operation.aiProposalId) : undefined;
    if (!state?.preparing || this.operations.has(operation.id)) return false;
    state.operations.add(operation.id); this.operations.set(operation.id, operation); return true;
  }
  finishPreparation(id: string) {
    const state = this.active.get(id); if (!state) return;
    state.preparing = false; this.release(id);
  }
  peek(id:string){return this.operations.get(id);}
  mayApply(id: string) { return this.operations.has(id); }
  isActive(id: string) { return this.active.has(id); }
  settle(id: string) {
    const operation = this.operations.get(id); if (!operation) return undefined;
    this.operations.delete(id);
    if (operation.aiProposalId) { this.active.get(operation.aiProposalId)?.operations.delete(id); this.release(operation.aiProposalId); }
    return operation;
  }
  cancel(id: string) {
    const removed = Array.from(this.operations.values()).filter(operation => operation.aiProposalId === id);
    removed.forEach(operation => this.operations.delete(operation.id)); this.active.delete(id); return removed;
  }
  private release(id: string) {
    const state = this.active.get(id); if (state && !state.preparing && !state.operations.size) this.active.delete(id);
  }
}
