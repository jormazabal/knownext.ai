import { expect, it } from "vitest";
import { defaultAiConfig, defaultExportTemplateConfig } from "../lib/api/config";
import { acceptsAiRefresh, aiSettingsPayload, mergeExportSettings, reconcileAiSettingsRefresh } from "./settingsValues";

it("sends preference fields without credential or unexpected runtime metadata",()=>{
  const payload=aiSettingsPayload({...defaultAiConfig,openaiKeyConfigured:true,openaiKeyPreview:"masked",credentialStorageError:"native error",openaiKey:"synthetic-secret"} as never);
  expect(payload.model).toBe(defaultAiConfig.model);expect(payload.permissions).toEqual(defaultAiConfig.permissions);
  expect(JSON.stringify(payload)).not.toMatch(/masked|native error|synthetic-secret|openaiKey/);
});

it("keeps earlier unsaved export choices when another field changes",()=>{
  const first=mergeExportSettings(defaultExportTemplateConfig,{normal:{...defaultExportTemplateConfig.normal,fontSizePt:17}});
  const latest=mergeExportSettings(first,{headings:{h2:{...first.headings.h2,color:"#123456"}}});
  expect(latest.normal.fontSizePt).toBe(17);expect(latest.headings.h2.color).toBe("#123456");expect(latest.headings.h1).toEqual(defaultExportTemplateConfig.headings.h1);
});

it("retains newer preferences and credential status when an earlier read arrives after a save",()=>{
  const incoming={...defaultAiConfig,model:"old-model",openaiKeyConfigured:false,openaiKeyPreview:null} as never;
  const current={...defaultAiConfig,model:"new-model",openaiKeyConfigured:true,openaiKeyPreview:"masked-new"} as never;
  const protectedValue=reconcileAiSettingsRefresh(current,incoming,true,true);
  expect(protectedValue.model).toBe("new-model");expect(protectedValue.openaiKeyConfigured).toBe(true);expect(protectedValue.openaiKeyPreview).toBe("masked-new");
  const credentialsOnly=reconcileAiSettingsRefresh(current,incoming,true,false);
  expect(credentialsOnly.model).toBe("new-model");expect(credentialsOnly.openaiKeyConfigured).toBe(false);
});

it("rejects superseded refreshes and old project responses while allowing an explicit upcoming project",()=>{
  expect(acceptsAiRefresh({request:1,latest:2,projectAtStart:"a",currentProject:"a",requestedProject:"a"})).toBe(false);
  expect(acceptsAiRefresh({request:2,latest:2,projectAtStart:"a",currentProject:"b",requestedProject:"a"})).toBe(false);
  expect(acceptsAiRefresh({request:2,latest:2,projectAtStart:"a",currentProject:"a",requestedProject:"b"})).toBe(true);
  expect(acceptsAiRefresh({request:2,latest:2,projectAtStart:"a",currentProject:"b",requestedProject:"b"})).toBe(true);
});
