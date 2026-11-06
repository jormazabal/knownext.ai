import type {DocumentSession} from "./documentSessions";
export function sameTrackedVisit(current:DocumentSession|undefined,submitted:DocumentSession){return !!current&&current.document?.id===submitted.document?.id&&current.loadVersion===submitted.loadVersion&&current.savedMarkdown===submitted.savedMarkdown&&current.baseFingerprint?.sha256===submitted.baseFingerprint?.sha256;}
export function trackedAuthorityIsCurrent(expected:{projectId:string;epoch:number},current:{projectId:string|null|undefined;epoch:number;canEdit:boolean;proposalExists:boolean}){return expected.projectId===current.projectId&&expected.epoch===current.epoch&&current.canEdit&&current.proposalExists;}
export function usesLiveEditor(id:string,readers:ReadonlyMap<string,unknown>){return readers.has(id);}
