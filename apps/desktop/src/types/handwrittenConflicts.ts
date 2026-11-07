import type {DocumentFingerprint,HandwrittenNoteContent,HandwrittenNoteRecord} from "./domain";
export type HandwrittenConflictReview={noteId:string;locationRevision:string;diskContent:HandwrittenNoteContent;diskFingerprint:DocumentFingerprint;draftRevision:string|null;checkedAt:string};
export type HandwrittenConflictApply={attemptId?:string;locationRevision:string;diskFingerprint:DocumentFingerprint;draftRevision:string|null;localContent:HandwrittenNoteContent;mergedContent:HandwrittenNoteContent};
export type HandwrittenConflictResult={attemptId?:string|null;id:string;note:HandwrittenNoteRecord;preservedCopies:string[];sourceUnchanged:true;checkedAt:string;reconciled?:boolean};
