import { expect, it } from "vitest";
import { searchSettingsSections } from "./settingsSearchIndex";
it("finds real sections by normalized topic in Spanish and English",()=>{
  expect(searchSettingsSections("latencia p95","es").map(s=>s.id)).toEqual(["system"]);
  expect(searchSettingsSections("performance timings","en").map(s=>s.id)).toEqual(["system"]);
  expect(searchSettingsSections(" MÁRGENES ","es").map(s=>s.id)).toEqual(["export"]);
  expect(searchSettingsSections("api key","en").map(s=>s.id)).toEqual(["ai"]);
  expect(searchSettingsSections("micrófono","es").map(s=>s.id)).toEqual(["audio"]);
  expect(searchSettingsSections("permissions","en").map(s=>s.id)).toEqual(["capabilities"]);
  expect(searchSettingsSections("uso almacenamiento","es").map(s=>s.id)).toEqual(["system"]);
  expect(searchSettingsSections("storage locations","en").map(s=>s.id)).toEqual(["system"]);
});
it("matches all query words without inventing results or searching private form values",()=>{
  expect(searchSettingsSections("image generation","en").map(s=>s.id)).toEqual(["capabilities"]);
  expect(searchSettingsSections("   ","es")).toEqual([]);
  expect(searchSettingsSections("private-unsaved-qa-key","es")).toEqual([]);
  expect(searchSettingsSections("micrófono márgenes","es")).toEqual([]);
});
