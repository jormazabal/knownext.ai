import {expect,it} from "vitest";
import {createDefaultHandwrittenContent,createHandwrittenPage} from "./handwrittenModel";
import {MAX_PAGE_TEXT,pageTranscription,updatePageTranscription} from "./pageTranscription";

it("aplica texto a la nota más reciente conservando trazos, otras páginas y el original",()=>{
  const note=createDefaultHandwrittenContent("note-qa");note.pages.push(createHandwrittenPage("page-2","blank","A4","portrait"));
  note.ocr.textByPage={"page-1":"Anterior","page-2":"Otra página"};
  const current={...note,pages:[{...note.pages[0],strokes:[{id:"new-stroke",color:"#111827",width:2,opacity:1,points:[[1,2],[3,4]]}]},note.pages[1]]} as typeof note;
  const updated=updatePageTranscription(current,"page-1","Anterior","Texto revisado");
  expect(updated.pages).toBe(current.pages);expect(updated.pages[0].strokes).toBe(current.pages[0].strokes);
  expect(updated.ocr.textByPage).toEqual({"page-1":"Texto revisado","page-2":"Otra página"});
  expect(note.ocr.textByPage["page-1"]).toBe("Anterior");expect(current.ocr.textByPage["page-1"]).toBe("Anterior");
});
it("rechaza una base antigua, página ausente y formato de texto desconocido sin sobrescribir",()=>{
  const note=createDefaultHandwrittenContent("note-qa");note.ocr.textByPage["page-1"]="Actual";
  expect(()=>updatePageTranscription(note,"page-1","Antiguo","Mi edición")).toThrow(/cambió/);
  expect(()=>updatePageTranscription(note,"missing","","Mi edición")).toThrow(/no está disponible/);
  expect(()=>updatePageTranscription(note,"page-1","Actual","x".repeat(MAX_PAGE_TEXT+1))).toThrow(/64.000/);
  Reflect.set(note.ocr.textByPage,"page-1",{unknown:"preserve"});
  expect(pageTranscription(note,"page-1")).toBe("");expect(()=>updatePageTranscription(note,"page-1","","Mi edición")).toThrow(/no es compatible/);
  expect(note.ocr.textByPage["page-1"]).toEqual({unknown:"preserve"});
});
