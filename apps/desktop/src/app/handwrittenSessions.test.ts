import { expect, it } from "vitest";
import { createDefaultHandwrittenContent } from "../features/handwritten/handwrittenModel";
import { acknowledgeHandwrittenSave, applyLocalHandwrittenNoteEdit, beginHandwrittenLoad, settleHandwrittenLoad, createLoadedHandwrittenNoteSession, shouldPersistHandwrittenDraft } from "./handwrittenSessions";
import type { HandwrittenNoteRecord } from "../types/domain";
import { sameHandwrittenRevision } from "./handwrittenSessions";

it("reprotects acknowledged strokes after uncertain deletion without persisting clean or loading notes",()=>{
  const content=createDefaultHandwrittenContent("note","Pending note");
  const dirty=createLoadedHandwrittenNoteSession({id:"note",name:"note.knote",path:"note.knote",projectId:"project",content,pageCount:1,updatedAt:"2026-11-01T00:00:00Z",hasDraft:true,isDirty:true});
  expect(shouldPersistHandwrittenDraft(dirty)).toBe(false);expect(shouldPersistHandwrittenDraft(dirty,true)).toBe(true);
  expect(shouldPersistHandwrittenDraft({...dirty,isDirty:false},true)).toBe(false);
  expect(shouldPersistHandwrittenDraft({...dirty,isLoading:true},true)).toBe(false);
});

it("does not apply an earlier discard choice to newer strokes or a reopened note", () => {
  const content = createDefaultHandwrittenContent("note", "Original");
  const chosen = createLoadedHandwrittenNoteSession({ id: "note", name: "note.knote", path: "note.knote", projectId: "project", content, pageCount: 1, updatedAt: "2026-10-31T00:00:00Z" });
  expect(sameHandwrittenRevision(chosen, chosen)).toBe(true);
  expect(sameHandwrittenRevision(applyLocalHandwrittenNoteEdit(chosen, { ...content, title: "New strokes" }), chosen)).toBe(false);
  expect(sameHandwrittenRevision({ ...chosen, loadVersion: 2 }, chosen)).toBe(false);
  expect(sameHandwrittenRevision(undefined, chosen)).toBe(false);
});

it("preserves newer strokes and refuses loads from removed or superseded sessions", () => {
  const content = createDefaultHandwrittenContent("note", "Original");
  const record: HandwrittenNoteRecord = { id: "note", name: "note.knote", path: "note.knote", projectId: "project", content, pageCount: 1, updatedAt: "2026-10-31T00:00:00Z" };
  const loading = beginHandwrittenLoad(createLoadedHandwrittenNoteSession(record), 1, true);
  expect(loading.loadVersion).toBe(0);
  expect(settleHandwrittenLoad(loading, 1, record)?.loadVersion).toBe(1);
  const edited = applyLocalHandwrittenNoteEdit(loading, { ...content, title: "Newer strokes" });
  expect(settleHandwrittenLoad(edited, 1, record)?.content?.title).toBe("Newer strokes");
  expect(settleHandwrittenLoad(edited, 1)?.content?.title).toBe("Newer strokes");
  const newer = beginHandwrittenLoad(loading, 2, true);
  expect(settleHandwrittenLoad(newer, 1, record)).toBe(newer);
  expect(settleHandwrittenLoad(undefined, 1, record)).toBeUndefined();
  expect(settleHandwrittenLoad(newer, 2, record)?.isLoading).toBe(false);
  expect(settleHandwrittenLoad(beginHandwrittenLoad(undefined, 3, false), 3)?.loadError).toBeTruthy();
});

it("preserves changes made during a handwritten save and schedules their recovery draft", () => {
  const submitted = createDefaultHandwrittenContent("note", "Original");
  const record: HandwrittenNoteRecord = { id: "note", name: "note.knote", path: "note.knote", projectId: "project", content: submitted, pageCount: 1, updatedAt: "2026-10-30T10:00:00Z" };
  const session = createLoadedHandwrittenNoteSession(record);
  const edited = applyLocalHandwrittenNoteEdit(session, { ...submitted, title: "Edited while saving" });
  const result = acknowledgeHandwrittenSave(edited, record, submitted);
  expect(result.content?.title).toBe("Edited while saving");
  expect(result.savedContent?.title).toBe("Original");
  expect(result.isDirty).toBe(true);
  expect(shouldPersistHandwrittenDraft(result)).toBe(true);
});
