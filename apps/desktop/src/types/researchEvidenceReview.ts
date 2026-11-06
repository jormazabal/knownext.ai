import type {LocalReferenceTarget} from "./documentReferences";

/** Human review of saved research data. A located excerpt does not certify a claim. */
export type ResearchEvidenceSelection={selectedClaimIds:string[];excludedSourceIds:string[];comment:string};
export type ResearchEvidenceSource={id:string;originalId:string|null;title:string;url:string|null;localTarget:LocalReferenceTarget|null;kind:string;publishedAt:string|null;consultedAt:string|null;excerpt:string;status:string;excluded:boolean;ambiguous:boolean};
export type ResearchEvidenceItem={id:string;originalId:string|null;sourceId:string|null;originalSourceId:string|null;claim:string;excerpt:string;consultedAt:string|null;excerptMatch:"match"|"not-found"|"unavailable"|"not-provided";usable:boolean;ambiguous:boolean};
export type ResearchEvidenceClaim={id:string;originalId:string|null;title:string;summary:string;evidenceIds:string[];unknownEvidenceIds:string[];sourceIds:string[];unknownSourceIds:string[];excludedSourceIds:string[];comment:string;state:"backed"|"partially-backed"|"unbacked"|"excluded";supportCount:number;unknownReferenceCount:number};
export type ResearchEvidenceCoverage={claims:number;backedClaims:number;partiallyBackedClaims:number;unbackedClaims:number;excludedClaims:number;sources:number;includedSources:number;evidence:number;usableEvidence:number;unknownReferences:number;coverageRatio:number};
export type ResearchEvidenceReceipt={attemptId:string;createdAt:string;sourceRevision:string;selectionRevision:string;phase:"applied"};
export type ResearchEvidenceReview={schemaVersion:1;projectId:string;jobId:string;revision:string;sourceRevision:string;checkedAt:string;readOnly:boolean;startsProvider:false;sources:ResearchEvidenceSource[];evidence:ResearchEvidenceItem[];claims:ResearchEvidenceClaim[];coverage:ResearchEvidenceCoverage;selection:ResearchEvidenceSelection;warnings:string[];receipts:ResearchEvidenceReceipt[];reviewRevision?:string|null;receipt?:ResearchEvidenceReceipt|null};
export type ResearchEvidencePrepareInput={revision:string;selection:ResearchEvidenceSelection};
export type PreparedResearchEvidenceReview=ResearchEvidenceReview&{readOnly:true;reviewRevision:string};
export type AppliedResearchEvidenceReview=ResearchEvidenceReview&{readOnly:false;receipt:ResearchEvidenceReceipt};
