import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentHistorySnapshot, getDocumentVersions, getVersionContent, saveVersionMilestone, removeVersionMilestone } from "../../lib/api/versions";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import type { VersionRecord } from "../../types/domain";

vi.mock("../../lib/api/versions", () => ({
  getDocumentHistorySnapshot: vi.fn(),
  saveVersionMilestone: vi.fn(),
  removeVersionMilestone: vi.fn(),
  getDocumentVersions: vi.fn(),
  getVersionContent: vi.fn(),
}));

const getDocumentVersionsMock = vi.mocked(getDocumentVersions);
const getVersionContentMock = vi.mocked(getVersionContent);

describe("VersionHistoryPanel", () => {
  beforeEach(() => {
    getDocumentVersionsMock.mockReset();
    vi.mocked(getDocumentHistorySnapshot).mockReset().mockImplementation(async doc=>({versions:await getDocumentVersionsMock(doc),milestones:{status:"missing",revision:null,error:null},checkedAt:"2026-11-01T10:00:00Z"}));
    vi.mocked(saveVersionMilestone).mockReset();
    vi.mocked(removeVersionMilestone).mockReset();
    getVersionContentMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("loads document history and previews a selected previous version", async () => {
    const versions: VersionRecord[] = [
      version("previous", "def5678", "Antes de cambios", false, "2026-06-04T10:00:00.000Z"),
      version("current", "abc1234", "Guardado actual", true, "2026-06-04T10:05:00.000Z"),
    ];
    const onPreviewChange = vi.fn();
    getDocumentVersionsMock.mockResolvedValue(versions);
    getVersionContentMock.mockResolvedValue({
      documentId: "doc-1",
      versionId: "previous",
      markdown: "# Version anterior",
    });

    render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId={null}
        onPreviewChange={onPreviewChange}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Historial")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();
    expect(await screen.findByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("def5678")).toBeInTheDocument();
    expect(screen.getByText("Guardado actual")).toBeInTheDocument();
    expect(screen.getByText("Antes de cambios")).toBeInTheDocument();

    fireEvent.click(screen.getByText("def5678"));

    await waitFor(() => {
      expect(getVersionContentMock).toHaveBeenCalledWith("doc-1", "previous");
      expect(onPreviewChange).toHaveBeenLastCalledWith({
        documentId: "doc-1",
        version: versions[0],
        markdown: "# Version anterior",
        mode: "diff",
      });
    });
  });

  it("compares the latest saved version and returns to the live document explicitly", async () => {
    const versions: VersionRecord[] = [
      version("previous", "def5678", "Antes de cambios", false, "2026-06-04T10:00:00.000Z"),
      version("current", "abc1234", "Guardado actual", true, "2026-06-04T10:05:00.000Z"),
    ];
    const onPreviewChange = vi.fn();
    getDocumentVersionsMock.mockResolvedValue(versions);
    getVersionContentMock.mockResolvedValue({documentId:"doc-1",versionId:"current",markdown:"# Saved, without newer typing"});

    render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId="previous"
        onPreviewChange={onPreviewChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("abc1234"));

    await waitFor(()=>expect(onPreviewChange).toHaveBeenLastCalledWith({documentId:"doc-1",version:versions[1],markdown:"# Saved, without newer typing",mode:"diff"}));
    fireEvent.click(screen.getByRole("button",{name:"Volver al documento abierto"}));
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(getVersionContentMock).toHaveBeenCalledWith("doc-1","current");
  });

  it("ignores an older preview response after selecting another version", async () => {
    let finish!: (value: {documentId:string;versionId:string;markdown:string})=>void;
    const versions=[version("old","oldhash","Old",false),version("new","newhash","New",true)];
    getDocumentVersionsMock.mockResolvedValue(versions);
    getVersionContentMock.mockImplementation((_doc,id)=>id==="old"?new Promise(resolve=>{finish=resolve;}):Promise.resolve({documentId:"doc-1",versionId:id,markdown:"New content"}));
    const preview=vi.fn();
    render(<VersionHistoryPanel documentId="doc-1" documentName="Notes.md" onPreviewChange={preview} onClose={vi.fn()}/>);
    fireEvent.click(await screen.findByText("oldhash"));
    fireEvent.click(screen.getByText("newhash"));
    await waitFor(()=>expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({markdown:"New content"})));
    await act(async()=>finish({documentId:"doc-1",versionId:"old",markdown:"Stale content"}));
    expect(preview).not.toHaveBeenCalledWith(expect.objectContaining({markdown:"Stale content"}));
  });

  it("keeps the new document history when the previous query finishes later", async () => {
    let finish!: (items:VersionRecord[])=>void;
    getDocumentVersionsMock.mockImplementation(id=>id==="old-doc"?new Promise(resolve=>{finish=resolve;}):Promise.resolve([version("new","newdoc","New document version",true)]));
    const props={documentName:"Notes.md",onPreviewChange:vi.fn(),onClose:vi.fn()};
    const view=render(<VersionHistoryPanel {...props} documentId="old-doc"/>);
    view.rerender(<VersionHistoryPanel {...props} documentId="new-doc"/>);
    expect(await screen.findByText("New document version")).toBeInTheDocument();
    await act(async()=>finish([version("old","olddoc","Wrong document version",true)]));
    expect(screen.getByText("New document version")).toBeInTheDocument();
    expect(screen.queryByText("Wrong document version")).not.toBeInTheDocument();
  });

  it("orders versions descending and reveals older batches with ver mas", async () => {
    const versions = Array.from({ length: 25 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return version(
        `version-${number}`,
        `hash${number}`,
        `Version ${number}`,
        index === 24,
        `2026-06-04T10:${number}:00.000Z`,
      );
    });
    getDocumentVersionsMock.mockResolvedValue(versions);

    const { container } = render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId={null}
        onPreviewChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("hash25")).toBeInTheDocument();
    expect(screen.getByText("hash06")).toBeInTheDocument();
    expect(screen.queryByText("hash05")).not.toBeInTheDocument();
    expect(container.textContent?.indexOf("hash25")).toBeLessThan(container.textContent?.indexOf("hash24") ?? 0);

    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));

    expect(screen.getByText("hash05")).toBeInTheDocument();
    expect(screen.getByText("hash01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
  });

  it("groups versions by relative ranges and shows long date plus time per row", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
    getDocumentVersionsMock.mockResolvedValue([
      version("may", "hashmay", "Mayo", false, "2026-05-20T17:26:00.000"),
      version("last-week", "hashlast", "Entrega anterior", false, "2026-06-01T09:15:00.000"),
      version("this-week", "hashweek", "Revisión de alcance", false, "2026-06-08T11:10:00.000"),
      version("yesterday", "hashayer", "Revisión del equipo", false, "2026-06-09T08:05:00.000"),
      version("today", "hashhoy", "Entrega actual", true, "2026-06-10T17:26:00.000"),
    ]);

    render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId={null}
        onPreviewChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("Ayer")).toBeInTheDocument();
    expect(screen.getByText("Esta semana")).toBeInTheDocument();
    expect(screen.getByText("Semana pasada")).toBeInTheDocument();
    expect(screen.getByText("mayo 2026")).toBeInTheDocument();
    expect(screen.getByText(/miércoles, 10 de junio de 2026 · 17:26/)).toBeInTheDocument();
    expect(screen.getByText(/miércoles, 20 de mayo de 2026 · 17:26/)).toBeInTheDocument();
  });
});

describe("hitos y comparación elegible",()=>{
  afterEach(()=>cleanup());
  const base=[version("one","11111111","Primera",false),version("two","22222222","Segunda",true)];
  const snapshot=(versions=base,revision:string|null=null)=>({versions,milestones:{status:revision?"ready" as const:"missing" as const,revision,error:null},checkedAt:"2026-11-01T10:00:00Z"});
  beforeEach(()=>{
    vi.mocked(getDocumentHistorySnapshot).mockReset().mockResolvedValue(snapshot());
    getVersionContentMock.mockReset().mockImplementation(async(doc,id)=>({documentId:doc,versionId:id,markdown:`Contenido ${id}`}));
    vi.mocked(saveVersionMilestone).mockReset();
    vi.mocked(removeVersionMilestone).mockReset();
  });
  it("compara dos versiones elegidas sin incluir el borrador ni repetir la carga",async()=>{
    const preview=vi.fn();
    render(<VersionHistoryPanel documentId="doc" documentName="Notas.md" onPreviewChange={preview} onClose={vi.fn()}/>);
    fireEvent.click(await screen.findByRole("checkbox",{name:"Seleccionar para comparar Primera"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"Seleccionar para comparar Segunda"}));
    const button=screen.getByRole("button",{name:"Comparar versiones"});
    fireEvent.click(button);fireEvent.click(button);
    await waitFor(()=>expect(preview).toHaveBeenLastCalledWith({documentId:"doc",version:base[0],markdown:"Contenido one",mode:"diff",comparison:{version:base[1],markdown:"Contenido two"}}));
    expect(getVersionContentMock).toHaveBeenCalledTimes(2);
    expect(saveVersionMilestone).not.toHaveBeenCalled();
  });
  it("concilia un acuse perdido de hito por lectura sin repetir la escritura",async()=>{
    const marker={id:"mark",commit:"two",sourcePath:"Notas.md",title:"Entrega aprobada",createdAt:"2026-11-01T10:00:00Z",updatedAt:"2026-11-01T10:00:00Z"};
    vi.mocked(getDocumentHistorySnapshot).mockResolvedValueOnce(snapshot()).mockResolvedValue(snapshot([base[0],{...base[1],milestone:marker}],"revision-2"));
    vi.mocked(saveVersionMilestone).mockRejectedValue(new Error("Acuse interrumpido"));
    const changed=vi.fn();
    render(<VersionHistoryPanel documentId="doc" documentName="Notas.md" onPreviewChange={vi.fn()} onMilestoneChange={changed} onClose={vi.fn()}/>);
    await screen.findByText("22222222");
    fireEvent.click(screen.getByRole("button",{name:"Nombrar hito"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Nombre del hito"}),{target:{value:"Entrega aprobada"}});
    fireEvent.click(screen.getByRole("button",{name:"Guardar nombre"}));
    expect(await screen.findByText("El nombre de hito está guardado.")).toBeInTheDocument();
    expect(changed).toHaveBeenCalledWith("two",marker);
    expect(saveVersionMilestone).toHaveBeenCalledTimes(1);
    expect(saveVersionMilestone).toHaveBeenCalledWith("doc","two","Entrega aprobada",null);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("volver al documento cancela una consulta de comparación pendiente",async()=>{
    let finish!:(value:{documentId:string;versionId:string;markdown:string})=>void;
    getVersionContentMock.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const preview=vi.fn();const props={documentId:"doc",documentName:"Notas.md",onPreviewChange:preview,onClose:vi.fn()};
    const view=render(<VersionHistoryPanel {...props} activePreviewVersionId="two"/>);
    fireEvent.click(await screen.findByText("11111111"));
    view.rerender(<VersionHistoryPanel {...props} activePreviewVersionId={null}/>);
    await act(async()=>finish({documentId:"doc",versionId:"one",markdown:"Respuesta tardía"}));
    expect(preview).not.toHaveBeenCalledWith(expect.objectContaining({markdown:"Respuesta tardía"}));
    expect(screen.getByRole("button",{name:"Nombrar hito"})).not.toBeDisabled();
  });
  it("explica la capacidad no disponible y ofrece ajustes solo cuando puede configurarse",async()=>{
    const configure=vi.fn();
    vi.mocked(getDocumentHistorySnapshot).mockResolvedValueOnce({...snapshot([]),history:{status:"unavailable",recordingEnabled:false,canConfigure:false,reason:"Este dispositivo permite archivos y borradores, pero no historial local."}});
    const props={documentName:"Notas.md",onPreviewChange:vi.fn(),onClose:vi.fn(),onConfigureProject:configure};
    const view=render(<VersionHistoryPanel {...props} documentId="mobile-doc"/>);
    expect(await screen.findByText("Historial no disponible aquí")).toBeInTheDocument();
    expect(screen.queryByText("Este documento aún no tiene versiones")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Nombrar hito"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Revisar ajustes del proyecto"})).not.toBeInTheDocument();
    vi.mocked(getDocumentHistorySnapshot).mockResolvedValue({...snapshot([]),history:{status:"disabled",recordingEnabled:false,canConfigure:true,reason:"Este proyecto no crea versiones automáticamente."}});
    view.rerender(<VersionHistoryPanel {...props} documentId="desktop-doc"/>);
    expect(await screen.findByText("Historial automático desactivado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Revisar ajustes del proyecto"}));
    expect(configure).toHaveBeenCalledTimes(1);
  });
  it("conserva texto ante error y descarta un acuse de hito del documento anterior",async()=>{
    let reject!:(error:Error)=>void;
    vi.mocked(saveVersionMilestone).mockImplementation(()=>new Promise((_resolve,rejectPromise)=>{reject=rejectPromise;}));
    const changed=vi.fn(); const props={documentName:"Notas.md",onPreviewChange:vi.fn(),onMilestoneChange:changed,onClose:vi.fn()};
    const view=render(<VersionHistoryPanel {...props} documentId="doc-a"/>);
    await screen.findByText("22222222");
    fireEvent.click(screen.getByRole("button",{name:"Nombrar hito"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Nombre del hito"}),{target:{value:"Pendiente"}});
    fireEvent.click(screen.getByRole("button",{name:"Guardar nombre"}));
    await act(async()=>reject(new Error("Disco no disponible")));
    expect(screen.getByRole("textbox",{name:"Nombre del hito"})).toHaveValue("Pendiente");
    expect(screen.getByRole("status")).toHaveTextContent("Disco no disponible");
    fireEvent.click(screen.getByRole("button",{name:"Guardar nombre"}));
    view.rerender(<VersionHistoryPanel {...props} documentId="doc-b"/>);
    await screen.findByText("22222222");
    await act(async()=>reject(new Error("Fallo del documento anterior")));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Fallo del documento anterior/)).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
});

function version(id: string, hash: string, title: string, current: boolean, createdAt = "2026-06-04T10:00:00.000Z"): VersionRecord {
  return {
    id,
    hash,
    title,
    author: "KnowNext",
    authorInitials: "KN",
    createdAt,
    relativeTime: "hace un momento",
    current,
  };
}
