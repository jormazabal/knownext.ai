import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {SafeDiagnosticsPanel} from "./SafeDiagnosticsPanel";
import {getSafeDiagnostics} from "../../lib/api/diagnostics";
import {safeDiagnosticJson} from "../../lib/runtime/diagnostics";
import type {DiagnosticReport} from "../../types/diagnostics";
vi.mock("../../lib/api/diagnostics",()=>({getSafeDiagnostics:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const report:DiagnosticReport={schemaVersion:1,generatedAt:"2026-11-01T12:00:00Z",app:"KnowNext.ai",version:"2.6.0",platform:"windows",recordingEnabled:true,maximumEvents:1000,maximumBytes:524288,events:[{id:"diagnostic-1-a",at:"2026-11-01T12:00:00Z",level:"error",operation:"document",code:"operation-failed"}],warnings:["legacy-logs-excluded"],includesPrivateContent:false};
it("prepara solo al pedirlo y conserva el informe seleccionable cuando falla copiar",async()=>{
  vi.mocked(getSafeDiagnostics).mockResolvedValue(report);const copy=vi.fn().mockResolvedValue(false);
  render(<SafeDiagnosticsPanel copyText={copy}/>);expect(getSafeDiagnostics).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Preparar informe"}));
  const text=await screen.findByRole("textbox",{name:"Informe de diagnóstico seguro"});
  fireEvent.click(screen.getByRole("button",{name:"Copiar informe revisado"}));
  expect(await screen.findByRole("status")).toHaveTextContent("Puedes seleccionar el informe");
  expect(text).toHaveValue(safeDiagnosticJson(report));expect(copy).toHaveBeenCalledTimes(1);
});
it("excluye campos futuros del informe conocido y rechaza eventos con contenido libre",()=>{
  const untrusted={...report,secret:"private-path",events:[{...report.events[0],prompt:"private-prompt"}],warnings:[...report.warnings,"private-warning"]};
  expect(safeDiagnosticJson(untrusted)).not.toMatch(/private/);
  expect(()=>safeDiagnosticJson({...report,events:[{...report.events[0],id:"diagnostic-private-document"}]})).toThrow();
});
