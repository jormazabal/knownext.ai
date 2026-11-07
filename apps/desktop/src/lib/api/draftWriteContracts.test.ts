import {expect,it,vi} from "vitest";
import {requestJson} from "./client";
import {saveDocumentDraft,saveDocument,discardDocumentDraft,loadDocumentDiskVersion} from "./documents";
import {saveHandwrittenNoteDraft,discardHandwrittenNoteDraft} from "./handwrittenNotes";
import {restoreVersion} from "./versions";
import {createDefaultHandwrittenContent} from "../../features/handwritten/handwrittenModel";
vi.mock("./client",()=>({requestJson:vi.fn().mockResolvedValue({})}));
it("carries the reviewed private revision across checkpoint, force save, discard, disk reload, restore and ink contracts",async()=>{
  await saveDocumentDraft("p::A.md",{markdown:"First"});await saveDocument("p::A.md",{markdown:"Save",force:true,expectedDraftWriteRevision:"owned"});await discardDocumentDraft("p::A.md","owned");await loadDocumentDiskVersion("p::A.md","owned");await restoreVersion("p::A.md","version",null,"owned");
  await saveHandwrittenNoteDraft("p::A.knote",{content:createDefaultHandwrittenContent("p::A.knote","Ink"),expectedDraftWriteRevision:"ink"});await discardHandwrittenNoteDraft("p::A.knote","ink");
  const bodies=vi.mocked(requestJson).mock.calls.map(call=>JSON.parse(call[1]!.body as string));
  expect(bodies.map(body=>body.expectedDraftWriteRevision)).toEqual([null,"owned","owned","owned","owned","ink","ink"]);expect(bodies[1].force).toBe(true);
});
