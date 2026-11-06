import { expect,it,vi } from "vitest";
import { requestJson } from "./client";
import { reviewDocumentConflictAttempt } from "./documentConflicts";
import { reviewHandwrittenConflictAttempt } from "./handwrittenConflicts";
import { createDefaultHandwrittenContent } from "../../features/handwritten/handwrittenModel";
vi.mock("./client",()=>({requestJson:vi.fn()}));
it("consults the exact attempt with the original reviewed payload through a read-only runtime contract",async()=>{
  const document={attemptId:'attempt-owned-0001',locationRevision:'root',diskFingerprint:{sha256:'disk'},draftRevision:null,localMarkdown:'Local',mergedMarkdown:'Combined'};
  await reviewDocumentConflictAttempt('p::folder/A.md',document.attemptId,document);
  expect(requestJson).toHaveBeenLastCalledWith('/api/documents/p%3A%3Afolder%2FA.md/conflict-attempts/attempt-owned-0001/review',{method:'POST',body:JSON.stringify(document)});
  const content=createDefaultHandwrittenContent('p::A.knote');const note={attemptId:'attempt-owned-note-0001',locationRevision:'root',diskFingerprint:{sha256:'disk'},draftRevision:null,localContent:content,mergedContent:{...content,title:'Combined'}};
  await reviewHandwrittenConflictAttempt('p::A.knote',note.attemptId,note);
  expect(requestJson).toHaveBeenLastCalledWith('/api/handwritten-notes/p%3A%3AA.knote/conflict-attempts/attempt-owned-note-0001/review',{method:'POST',body:JSON.stringify(note)});
});
