import { useEffect, useRef } from "react";
import type { AiEditProposal } from "../../types/domain";

/** Decide once on arrival. Changing a preference never releases old proposals. */
export function useAiProposalAutoApply(proposal: AiEditProposal | null, enabled: boolean, onApply: (id: string) => void | Promise<void>) {
  const seen = useRef(new Set<string>());
  const apply = useRef(onApply); apply.current = onApply;
  useEffect(() => {
    if (!proposal || proposal.status !== "proposed" || seen.current.has(proposal.id)) return;
    seen.current.add(proposal.id);
    if (enabled && proposal.requiresConfirmation === false) void apply.current(proposal.id);
  }, [proposal?.id, proposal?.status, enabled]);
}
