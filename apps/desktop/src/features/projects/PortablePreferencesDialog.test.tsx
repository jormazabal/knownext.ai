import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {PortablePreferencesReview} from "../../types/portablePreferences";
const api=vi.hoisted(()=>({review:vi.fn(),apply:vi.fn()}));
vi.mock("../../lib/api/portablePreferences",()=>({reviewPortablePreferences:api.review,applyPortablePreferences:api.apply}));
import {PortablePreferencesDialog} from "./PortablePreferencesDialog";
const review:PortablePreferencesReview={schemaVersion:1,projectId:"project-owned",revision:"a".repeat(64),checkedAt:"2026-11-04T12:00:00Z",source:"Archivo KnowNext/Preferencias.json",imported:{appearance:{language:"eu",zoomPercent:125},layout:{sidebarWidth:280}},observed:{appearance:{language:"es",zoomPercent:100},layout:{sidebarWidth:350}},canApply:true,dataOnly:true,changesAi:false};
beforeEach(()=>{vi.resetAllMocks();api.review.mockResolvedValue(review);api.apply.mockResolvedValue({status:"applied",review:{...review,revision:"b".repeat(64)}});});afterEach(cleanup);
it("requires explicit group, confirmation and protected authority before applying",async()=>{
 const before=vi.fn(async()=>{}),settled=vi.fn();render(<PortablePreferencesDialog projectId={review.projectId} projectName="Proyecto recibido" onClose={vi.fn()} onBeforeChange={before} onSettled={settled}/>);
 await screen.findByText("Euskera");expect(api.apply).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Aplicar selección"})).toBeDisabled();
 fireEvent.click(screen.getByRole("checkbox",{name:"Aspecto e idioma"}));expect(screen.getByRole("button",{name:"Aplicar selección"})).toBeDisabled();fireEvent.click(screen.getByRole("checkbox",{name:"Aplicar los grupos elegidos a este dispositivo"}));fireEvent.click(screen.getByRole("button",{name:"Aplicar selección"}));
 await screen.findByText("Preferencias visuales aplicadas a este dispositivo.");expect(before).toHaveBeenCalledOnce();expect(api.apply).toHaveBeenCalledWith(review,true,false);expect(before.mock.invocationCallOrder[0]).toBeLessThan(api.apply.mock.invocationCallOrder[0]);expect(settled).toHaveBeenCalledWith({confirmed:true,message:"Preferencias visuales aplicadas a este dispositivo."});expect(screen.getByRole("button",{name:"Aplicar selección"})).toBeDisabled();
});
it("reconciles an uncertain result by reading once without replay and requires a new review",async()=>{
 api.apply.mockRejectedValue(new Error("Acuse interrumpido"));const settled=vi.fn();render(<PortablePreferencesDialog projectId={review.projectId} projectName="Proyecto recibido" onClose={vi.fn()} onBeforeChange={async()=>{}} onSettled={settled}/>);
 await screen.findByText("Euskera");fireEvent.click(screen.getByRole("checkbox",{name:"Paneles del espacio de trabajo"}));fireEvent.click(screen.getByRole("checkbox",{name:"Aplicar los grupos elegidos a este dispositivo"}));fireEvent.click(screen.getByRole("button",{name:"Aplicar selección"}));
 await screen.findByText(/Estado consultado sin repetir/);expect(api.apply).toHaveBeenCalledTimes(1);expect(api.review).toHaveBeenCalledTimes(2);expect(settled).toHaveBeenCalledWith({confirmed:false,message:"Acuse interrumpido"});expect(screen.getByRole("checkbox",{name:"Paneles del espacio de trabajo"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Revisar de nuevo"}));await waitFor(()=>expect(screen.getByRole("checkbox",{name:"Paneles del espacio de trabajo"})).toBeEnabled());expect(screen.getByRole("checkbox",{name:"Aplicar los grupos elegidos a este dispositivo"})).not.toBeChecked();expect(api.apply).toHaveBeenCalledTimes(1);
});
it("leaves inspection read-only when the workspace transition authority is absent",async()=>{
 render(<PortablePreferencesDialog projectId={review.projectId} projectName="Proyecto recibido" onClose={vi.fn()}/>);await screen.findByText("Euskera");expect(screen.getByRole("checkbox",{name:"Aspecto e idioma"})).toBeDisabled();expect(screen.getByRole("button",{name:"Aplicar selección"})).toBeDisabled();expect(api.apply).not.toHaveBeenCalled();
});
it("does not call the mutation or settle a transition rejected by the workspace preflight",async()=>{
 const settled=vi.fn();render(<PortablePreferencesDialog projectId={review.projectId} projectName="Proyecto recibido" onClose={vi.fn()} onBeforeChange={async()=>{throw Error("Confirma los ajustes pendientes");}} onSettled={settled}/>);await screen.findByText("Euskera");fireEvent.click(screen.getByRole("checkbox",{name:"Paneles del espacio de trabajo"}));fireEvent.click(screen.getByRole("checkbox",{name:"Aplicar los grupos elegidos a este dispositivo"}));fireEvent.click(screen.getByRole("button",{name:"Aplicar selección"}));await screen.findByRole("alert");expect(api.apply).not.toHaveBeenCalled();expect(settled).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Aplicar selección"})).toBeDisabled();
});
