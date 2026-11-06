import type { AffectedDocument } from "../types/domain";
import { createLoadedDocumentSession, type DocumentSession } from "./documentSessions";
import type { HandwrittenNoteSession } from "./handwrittenSessions";

export function applyDocumentFileChanges(sessions: Record<string,DocumentSession>, changes:AffectedDocument[]) {
  const next={...sessions};
  for(const change of changes) {
    const current=next[change.oldId] ?? (change.referenceUpdated && change.newId ? next[change.newId] : undefined);
    if(!current) continue;
    delete next[change.oldId];
    if(!change.newId) continue;
    const moved={...current,document:current.document ? {...current.document,id:change.newId,name:change.name ?? current.document.name,path:change.path ?? current.document.path}:null,
      loadVersion:current.loadVersion+1,isLoading:false,pendingLoad:undefined};
    if(change.document && typeof change.previousMarkdown==="string") {
      next[change.newId]=current.markdown===change.previousMarkdown
        ? createLoadedDocumentSession(change.document,moved)
        : {...moved,isDirty:true,diskChanged:true,conflictStatus:"disk-changed",lastDraftMarkdown:""};
    } else next[change.newId]=moved;
  }
  return next;
}

export function applyHandwrittenFileChanges(sessions:Record<string,HandwrittenNoteSession>,changes:AffectedDocument[]) {
  const next={...sessions};
  for(const change of changes) {
    const current=next[change.oldId];if(!current)continue;
    delete next[change.oldId];if(!change.newId)continue;
    next[change.newId]={...current,note:current.note ? {...current.note,id:change.newId,name:change.name ?? current.note.name,path:change.path ?? current.note.path}:null,
      content:current.content ? {...current.content,id:change.newId}:null,savedContent:current.savedContent ? {...current.savedContent,id:change.newId}:null,
      loadVersion:current.loadVersion+1,isLoading:false,pendingLoad:undefined};
  }
  return next;
}
