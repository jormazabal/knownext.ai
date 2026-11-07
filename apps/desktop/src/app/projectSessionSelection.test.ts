import { expect, it } from "vitest";
import { restoreProjectSelection } from "./projectSessionSelection";

it("restores the selected surface when both Markdown and handwritten tabs are open", () => {
  const tabs = { openTabs:[{id:"doc",name:"Acta.md"}],openHandwrittenTabs:[{id:"note",name:"Boceto.knote"}],activeDocumentId:"doc",activeHandwrittenNoteId:"note",activeWorkspaceTabId:"doc" };
  expect(restoreProjectSelection(tabs)).toEqual({activeDocumentId:"doc",activeHandwrittenNoteId:""});
  expect(restoreProjectSelection({...tabs,activeWorkspaceTabId:"note"})).toEqual({activeDocumentId:"",activeHandwrittenNoteId:"note"});
  expect(restoreProjectSelection({...tabs,activeWorkspaceTabId:""})).toEqual({activeDocumentId:"",activeHandwrittenNoteId:""});
});
