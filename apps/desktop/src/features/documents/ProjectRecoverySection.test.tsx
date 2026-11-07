import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ProjectRecoverySection} from "./ProjectRecoverySection";
import {RecoverableDraftsDialog} from "./RecoverableDraftsDialog";
import {getMixedRecoveryCatalog} from "../../lib/api/mixedRecovery";
import {getMixedApplication} from "../../lib/api/mixedApplication";
import type {MixedRecoveryCatalog} from "../../lib/api/mixedRecovery";
import type {Project} from "../../types/domain";
vi.mock("../../lib/api/mixedRecovery",()=>({getMixedRecoveryCatalog:vi.fn()}));
vi.mock("../../lib/api/mixedApplication",()=>({getMixedApplication:vi.fn()}));
vi.mock("../externalChanges/MixedBackupDialog",()=>({MixedBackupDialog:({projectId,planId,onClose}:{projectId:string;planId:string;onClose:()=>void})=><div role="dialog" aria-label="Respaldo"><p>{projectId} · {planId}</p><button onClick={onClose}>Cerrar respaldo</button></div>}));
vi.mock("../externalChanges/MixedPayloadRetentionDialog",()=>({MixedPayloadRetentionDialog:({projectId,planId}:{projectId:string;planId:string})=><div role="dialog" aria-label="Retención">{projectId} · {planId}</div>}));
vi.mock("../externalChanges/MixedRetirementDialog",()=>({MixedRetirementDialog:({projectId,planId}:{projectId:string;planId:string})=><div role="dialog" aria-label="Retirada">{projectId} · {planId}</div>}));
vi.mock("../externalChanges/MixedIncompleteDialog",()=>({MixedIncompleteDialog:({projectId,planId}:{projectId:string;planId:string})=><div role="dialog" aria-label="Extraer">{projectId} · {planId}</div>}));
vi.mock("../projects/ProjectTransferDialog",()=>({ProjectTransferDialog:({mode}:{mode:{projectId:string;projectName:string}})=><div role="dialog" aria-label="Traslado">{mode.projectId} · {mode.projectName}</div>}));
vi.mock("../settings/StorageUsagePanel",()=>({StorageUsagePanel:()=> <section aria-label="Espacio del dispositivo"/>}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const a={id:"a",name:"Proyecto A"} as Project,b={id:"b",name:"Proyecto B"} as Project,plan=`mixed-${"a".repeat(32)}`;
function catalog(projectId="a"):MixedRecoveryCatalog{return{schemaVersion:1,projectId,checkedAt:"2026-11-04T12:00:00Z",items:[{id:plan,planRevision:"b".repeat(64),createdAt:"2026-11-04T10:00:00Z",paths:2}],limited:true,warnings:["Entrada futura conservada"]};}
const complete={schemaVersion:1 as const,projectId:"a",planId:plan,phase:"completed" as const,rows:[],canContinue:false,copiesPreserved:true,checkedAt:"2026-11-04T12:00:00Z",appliedCount:2};
it("ignores the previous project's late catalog and opens the chosen project's transfer only after an explicit action",async()=>{
 let finish!:(v:MixedRecoveryCatalog)=>void;vi.mocked(getMixedRecoveryCatalog).mockImplementation(project=>project==="a"?new Promise(resolve=>{finish=resolve;}):Promise.resolve(catalog("b")));
 render(<ProjectRecoverySection projects={[a,b]} activeProjectId="a"/>);fireEvent.change(screen.getByRole("combobox",{name:"Proyecto de las copias"}),{target:{value:"b"}});expect(await screen.findByRole("button",{name:"Revisar preparación"})).toBeEnabled();finish({...catalog("a"),items:[]});await waitFor(()=>expect(screen.getByRole("button",{name:"Revisar preparación"})).toBeEnabled());expect(screen.queryByRole("dialog")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Preparar paquete de Proyecto B…"}));expect(await screen.findByRole("dialog",{name:"Traslado"})).toHaveTextContent("b · Proyecto B");expect(getMixedApplication).not.toHaveBeenCalled();
});
it("reviews before exposing retention and backup actions, preserves partial coverage and scopes the nested backup",async()=>{
 vi.mocked(getMixedRecoveryCatalog).mockResolvedValue(catalog());vi.mocked(getMixedApplication).mockResolvedValue(complete);render(<ProjectRecoverySection projects={[a]} activeProjectId="a"/>);await screen.findByText(/Catálogo parcial/);expect(screen.queryByRole("button",{name:"Respaldar variantes…"})).not.toBeInTheDocument();fireEvent.click(await screen.findByRole("button",{name:"Revisar preparación"}));expect(await screen.findByText("Aplicación completada")).toBeInTheDocument();expect(screen.getByRole("button",{name:"Reducir espacio…"})).toBeEnabled();expect(screen.getByRole("button",{name:"Retirar copias locales…"})).toBeEnabled();fireEvent.click(screen.getByRole("button",{name:"Respaldar variantes…"}));expect(screen.getByRole("dialog",{name:"Respaldo"})).toHaveTextContent(`a · ${plan}`);fireEvent.click(screen.getByRole("button",{name:"Cerrar respaldo"}));await waitFor(()=>expect(getMixedApplication).toHaveBeenCalledTimes(2));expect(screen.queryByRole("button",{name:/Conservar y aplicar|Continuar tras revisión/})).not.toBeInTheDocument();
});
it("offers known-byte extraction when a preparation cannot be reviewed without treating it as a closed removable copy",async()=>{
 vi.mocked(getMixedRecoveryCatalog).mockResolvedValue(catalog());vi.mocked(getMixedApplication).mockRejectedValue(new Error("Recibo futuro conservado"));render(<ProjectRecoverySection projects={[a]}/>);fireEvent.click(await screen.findByRole("button",{name:"Revisar preparación"}));expect(await screen.findByRole("alert")).toHaveTextContent("Recibo futuro");expect(screen.queryByRole("button",{name:"Retirar copias locales…"})).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Extraer una copia legible…"}));expect(screen.getByRole("dialog",{name:"Extraer"})).toHaveTextContent(`a · ${plan}`);
});
it("loads project and storage categories on demand from the recovery center",async()=>{
 vi.mocked(getMixedRecoveryCatalog).mockResolvedValue(catalog());render(<RecoverableDraftsDialog open projects={[a]} activeProjectId="a" drafts={[]} review={()=> <p>Copias documentales</p>} onClose={vi.fn()} onRefresh={vi.fn()} onRestore={vi.fn()} onDiscard={vi.fn()}/>);expect(getMixedRecoveryCatalog).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Preparaciones y traslado"}));await screen.findByRole("button",{name:"Revisar preparación"});expect(getMixedRecoveryCatalog).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole("button",{name:"Uso y limpieza segura de espacio"}));expect(screen.getByRole("region",{name:"Espacio del dispositivo"})).toBeInTheDocument();expect(getMixedRecoveryCatalog).toHaveBeenCalledTimes(1);
});
