import {expect,it} from "vitest";
import {notesSaveFeedback} from "./notesSaveFeedback";
it("never shows an older save timestamp as protection for newer note content",()=>{
  expect(notesSaveFeedback("idle",true,"12:00")).toBe("Pendiente de autoguardar");
  expect(notesSaveFeedback("saving",true,"12:00")).toBe("Guardando automáticamente…");
  expect(notesSaveFeedback("error",true,"12:00")).toBe("Guardado sin confirmar");
  expect(notesSaveFeedback("idle",false,"12:01")).toBe("Autoguardado · 12:01");
});
