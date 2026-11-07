export type MixedChoice="local"|"remote"|"combined";
export type MixedEntry={mode:"100644"|"100755";blob:string};
export type MixedRow={path:string;choice:MixedChoice|"";local:MixedEntry|null;remote:MixedEntry|null;current:MixedEntry|null;documentId:string|null;matches?:boolean};
export type MixedSelectionProof={planId:string;planRevision:string;choicesSha256:string;localChoices:number;remoteChoices:number;combinedChoices:number};
export type MixedCandidates={schemaVersion:1;projectId:string;revision:string;rows:MixedRow[];checkedAt:string};
export type MixedSelectionReview=MixedCandidates&{id:string;planRevision:string;localCommit:string;remoteCommit:string;relation:"up-to-date"|"local-ahead"|"remote-ahead"|"diverged";ready:boolean;canReplay:false;proof:MixedSelectionProof;additionalPaths:string[];additionalCount:number;message:string};
export type MixedSelectionSummary={id:string;createdAt:string;planRevision:string;paths:number};
