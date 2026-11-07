import type {MixedSelectionSummary,MixedSelectionProof} from "./mixedSelections";
import type {HistoricalCopySummary} from "./historyCopies";
export type RemoteProjectChange = {
  side: "local" | "remote"; change: "added" | "deleted" | "modified" | "renamed" | "type-changed";
  path: string; previousPath: string | null; kind: "markdown" | "resource" | "unsupported";
  overlap: boolean; identical: boolean; canOpen: boolean; documentId: string | null;
  canRecover?:boolean;
};
export type ProjectRemoteReview = {
  schemaVersion: 1; projectId: string; revision: string; localCommit: string; remoteCommit: string; baseCommit: string;
  relation: "up-to-date" | "local-ahead" | "remote-ahead" | "diverged";
  local: RemoteProjectChange[]; remote: RemoteProjectChange[]; checkedAt: string; warnings: string[];
  mixedSelections?:{items:MixedSelectionSummary[];limited:boolean;warnings:string[]};
  graphJoin?: {canJoin:boolean;canKeepLocal?:boolean;message:string};
  graphJoins?: {items:GraphJoinSummary[];limited:boolean;warnings:string[]};
  historyCopies?:{items:HistoricalCopySummary[];limited:boolean;warnings:string[]};
};
export type GraphJoinResolution="identical"|"keep-local"|"mixed";
export type GraphJoinSummary={attemptId:string;createdAt:string;reviewedRevision:string;targetCommit:string;resolution?:GraphJoinResolution};
export type GraphJoinProof={mixedSelection?:MixedSelectionProof|null;schemaVersion:1;projectId:string;attemptId:string;reviewedRevision?:string;targetCommit?:string;resolution?:GraphJoinResolution;status:"absent"|"pending"|"changed"|"confirmed";canReplay:false;message?:string;checkedAt:string};
