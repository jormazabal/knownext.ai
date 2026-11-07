import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ listDocumentTemplates: vi.fn(), previewDocumentTemplate: vi.fn(), retireDocumentTemplate: vi.fn() }));
vi.mock("../../lib/api/documentTemplates", () => api);
vi.mock("../editor/ReadonlyMarkdownViewer", () => ({ ReadonlyMarkdownViewer: ({ markdown, ariaLabel }: { markdown: string; ariaLabel: string }) => <article aria-label={ariaLabel}>{markdown}</article> }));
import { CreateDocumentDialog } from "./CreateDocumentDialog";
const builtins = ["blank", "meeting", "requirements", "decision"].map(id => ({ id, name: id, description: "", variables: ["titulo"], revision: `builtin-${id}`, builtIn: true, createdAt: null }));
const ready = () => waitFor(() => expect(screen.getByRole("option", { name: "requirements" })).toBeInTheDocument());
beforeEach(() => { vi.resetAllMocks(); api.listDocumentTemplates.mockResolvedValue({ templates: builtins, warnings: [], complete: true, scannedEntries: 0, scannedBytes: 0 }); });

describe("CreateDocumentDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("normalizes the document name and passes the selected template", async () => {
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);
    await ready();

    fireEvent.change(screen.getByLabelText(/Nombre del documento/), {
      target: { value: "plan-producto" },
    });
    fireEvent.change(screen.getByLabelText(/Plantilla/), {
      target: { value: "requirements" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));

    expect(onCreate).toHaveBeenCalledWith({
      kind: "document",
      name: "plan-producto.md",
      template: "requirements",
      background: "blank",
      templateRevision: "builtin-requirements",
      templateValues: {},
    });
    await waitFor(()=>expect(screen.getByLabelText(/Nombre del documento/)).toHaveValue(""));
    expect(screen.getByLabelText(/Plantilla/)).toHaveValue("blank");
  });

  it("creates the document when pressing Enter in the name input", async () => {
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={vi.fn()} onCreate={onCreate} />);
    await ready();

    await userEvent.type(screen.getByLabelText(/Nombre del documento/), "atajo-enter{Enter}");

    expect(onCreate).toHaveBeenCalledWith({
      kind: "document",
      name: "atajo-enter.md",
      template: "blank",
      background: "blank",
      templateRevision: "builtin-blank",
      templateValues: {},
    });
  });

  it("creates a default Markdown document and closes from both controls", async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open onClose={onClose} onCreate={onCreate} />);
    await ready();

    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    await waitFor(()=>expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onCreate).toHaveBeenCalledWith({
      kind: "document",
      name: "nuevo-documento.md",
      template: "blank",
      background: "blank",
      templateRevision: "builtin-blank",
      templateValues: {},
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("creates a handwritten note with a knote extension and selected background", () => {
    const onCreate = vi.fn();

    render(<CreateDocumentDialog open initialKind="handwritten-note" onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText(/Nombre de la nota/), {
      target: { value: "boceto-clase" },
    });
    fireEvent.change(screen.getByLabelText(/Fondo inicial/), {
      target: { value: "cornell" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear nota" }));

    expect(onCreate).toHaveBeenCalledWith({
      kind: "handwritten-note",
      name: "boceto-clase.knote",
      template: "blank",
      background: "cornell",
    });
  });

  it("does not render when closed", () => {
    render(<CreateDocumentDialog open={false} onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.queryByText("Crear documento")).not.toBeInTheDocument();
  });

  it("blocks duplicate creation and keeps the entered name and template after a failed request", async () => {
    let finish!: (result: boolean) => void;
    const onCreate = vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    const close = vi.fn();
    render(<CreateDocumentDialog open onClose={close} onCreate={onCreate}/>);
    await ready();
    await userEvent.type(screen.getByLabelText("Nombre del documento"), "Acta importante");
    await userEvent.selectOptions(screen.getByLabelText("Plantilla"), "meeting");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await userEvent.keyboard("{Escape}");
    expect(onCreate).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    await act(async()=>finish(false));
    expect(screen.getByRole("alert")).toHaveTextContent("tus datos se conservan");
    expect(screen.getByLabelText("Nombre del documento")).toHaveValue("Acta importante");
    expect(screen.getByLabelText("Plantilla")).toHaveValue("meeting");
    expect(screen.getByRole("button",{name:"Crear documento"})).toBeEnabled();
  });
  it("shows fields and preview, and sends resolved values from the current preview", async () => {
    api.listDocumentTemplates.mockResolvedValue({ templates: [...builtins, { id: "custom", name: "Acta reusable", description: "Equipo", variables: ["titulo", "asistentes"], revision: "custom-revision", builtIn: false, createdAt: "2026-10-31T10:00:00Z" }], warnings: [], complete: true, scannedEntries: 1, scannedBytes: 100 });
    api.previewDocumentTemplate.mockImplementation(async (_id, body) => ({ templateId: "custom", revision: "custom-revision", name: body.name, values: { titulo: body.name.slice(0, -3), ...body.values }, markdown: `# ${body.name}\n${body.values.asistentes}`, projectRootHash: "reviewed-root" }));
    const onCreate = vi.fn().mockResolvedValue(false);
    render(<CreateDocumentDialog open projectId="project" onClose={vi.fn()} onCreate={onCreate}/>);
    await ready(); fireEvent.change(screen.getByLabelText("Plantilla"), { target: { value: "custom" } });
    expect(screen.getByRole("button", { name: "Crear documento" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nombre del documento"), { target: { value: "Acta uno" } });
    fireEvent.change(screen.getByLabelText("Asistentes"), { target: { value: "Ana y Jon" } });
    expect(await screen.findByLabelText("Vista previa del documento")).toHaveTextContent("Ana y Jon");
    fireEvent.click(screen.getByRole("button", { name: "Crear documento" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Acta uno.md", templateRevision: "custom-revision", templateProjectRootHash: "reviewed-root", templateValues: { titulo: "Acta uno", asistentes: "Ana y Jon" } })));
    expect(screen.getByLabelText("Asistentes")).toHaveValue("Ana y Jon");
  });
  it("requires an explicit decision to retire a personal template and preserves the document name", async () => {
    const custom = { id: "custom", name: "Personal", description: "", variables: [], revision: "reviewed", builtIn: false, createdAt: null };
    api.listDocumentTemplates.mockResolvedValueOnce({ templates: [...builtins, custom], warnings: [], complete: true }).mockResolvedValue({ templates: builtins, warnings: [], complete: true });
    api.previewDocumentTemplate.mockResolvedValue({ templateId: "custom", revision: "reviewed", name: "Acta.md", values: {}, markdown: "Texto", projectRootHash: "reviewed-root" });
    api.retireDocumentTemplate.mockResolvedValue({ retired: true });
    render(<CreateDocumentDialog open projectId="project" onClose={vi.fn()} onCreate={vi.fn()}/>);
    await ready(); fireEvent.change(screen.getByLabelText("Nombre del documento"), { target: { value: "Acta" } }); fireEvent.change(screen.getByLabelText("Plantilla"), { target: { value: "custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Retirar esta plantilla…" })); expect(api.retireDocumentTemplate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Conservar plantilla" })); expect(api.retireDocumentTemplate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retirar esta plantilla…" })); fireEvent.click(screen.getByRole("button", { name: "Retirar plantilla" }));
    await waitFor(() => expect(api.retireDocumentTemplate).toHaveBeenCalledWith("custom", "reviewed"));
    expect(screen.getByLabelText("Nombre del documento")).toHaveValue("Acta"); await waitFor(() => expect(screen.getByLabelText("Plantilla")).toHaveValue("blank"));
  });
  it("shows the reviewed attachment copies before creating a document",async()=>{
    api.listDocumentTemplates.mockResolvedValue({templates:[...builtins,{id:"saved-attachments",name:"Adjuntos revisados",description:"",variables:[],revision:"r",builtIn:false,createdAt:null}],warnings:[],complete:true,scannedEntries:1,scannedBytes:100});
    api.previewDocumentTemplate.mockResolvedValue({markdown:"# Plantilla",values:{},projectRootHash:"a".repeat(64),resources:[{name:"Ficha técnica.pdf",path:"_template-resources/hash/Ficha.pdf",bytes:128*1024,mimeType:"application/pdf",sha256:"b".repeat(64)}]});
    render(<CreateDocumentDialog open projectId="p" onClose={vi.fn()} onCreate={vi.fn()}/>);await ready();await userEvent.selectOptions(screen.getByRole("combobox",{name:"Plantilla"}),"saved-attachments");
    expect(await screen.findByText(/Ficha técnica.pdf/)).toBeInTheDocument();expect(screen.getByText(/Se crearán copias con enlaces relativos/)).toBeInTheDocument();
  });

});
