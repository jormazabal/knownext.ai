import {sameDocumentRevision,type DocumentSession} from "./documentSessions";
export type ImageInsertionTarget={projectId:string;projectEpoch:number;documentId:string;session:DocumentSession};
export function imageInsertionTargetIsCurrent(target:ImageInsertionTarget,current:{projectId:string|undefined;projectEpoch:number;activeDocumentId:string;sessions:Record<string,DocumentSession>}):boolean {
  const session=current.sessions[target.documentId];
  return target.projectId===current.projectId && target.projectEpoch===current.projectEpoch && target.documentId===current.activeDocumentId
    && !!session?.document && session.document.id===target.documentId && session.document.projectId===target.projectId
    && !session.isLoading && !session.orphaned && !session.draftWriteConflict && sameDocumentRevision(session,target.session);
}
