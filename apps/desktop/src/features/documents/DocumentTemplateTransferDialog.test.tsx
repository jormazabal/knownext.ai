import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ deliverTemplateTransfer: vi.fn(), importTemplateTransfer: vi.fn(), inspectTemplateTransfer: vi.fn(), pickTemplateTransfer: vi.fn(), prepareTemplateTransfer: vi.fn() }));
const catalog = vi.hoisted(() => ({ listDocumentTemplates: vi.fn(), previewDocumentTemplate: vi.fn(), retireDocumentTemplate: vi.fn() }));
vi.mock("../../lib/api/documentTemplateTransfer", () => api);
vi.mock("../../lib/api/documentTemplates", () => catalog);
vi.mock("../editor/ReadonlyMarkdownViewer", () => ({ ReadonlyMarkdownViewer: ({ markdown }: { markdown: string }) => <article>{markdown}</article> }));
import { DocumentTemplateTransferDialog } from "./DocumentTemplateTransferDialog";
import { CreateDocumentDialog } from "./CreateDocumentDialog";
const review = { name: "Acta", description: "Equipo", markdown: "# {{titulo}}\n{{asistentes}}", variables: ["titulo", "asistentes"], digest: "reviewed-bytes", byteLength: 120 };
const template = { id: "custom-acta", revision: "reviewed-revision", name: "Acta", description: "Equipo", variables: review.variables, builtIn: false, createdAt: null };
beforeEach(() => {
  vi.resetAllMocks(); api.pickTemplateTransfer.mockResolvedValue({ status: "selected", fileName: "Acta.json", content: "portable-exact" });
  api.inspectTemplateTransfer.mockResolvedValue(review); api.prepareTemplateTransfer.mockResolvedValue({ fileName: "Acta.json", content: "portable-exact" });
  catalog.listDocumentTemplates.mockResolvedValue({ templates: [{ ...template, id: "blank", builtIn: true }], warnings: [], complete: true });
});
afterEach(cleanup);
it("keeps the inspected bytes after collision and imports only after explicit rename", async () => {
  const imported = vi.fn(); const close = vi.fn();
  api.importTemplateTransfer.mockRejectedValueOnce(new Error("Elige otro nombre para conservar ambas")).mockResolvedValueOnce({ ...template, name: "Acta recibida" });
  render(<DocumentTemplateTransferDialog mode={{ kind: "import" }} onClose={close} onImported={imported}/>);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de plantilla…" }));
  await screen.findByLabelText("Nombre en tu catálogo"); expect(api.importTemplateTransfer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Importar plantilla" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("otro nombre"); expect(screen.getByLabelText("Nombre en tu catálogo")).toHaveValue("Acta"); expect(close).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nombre en tu catálogo"), { target: { value: "Acta recibida" } }); expect(screen.queryByRole("alert")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Importar plantilla" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce()); expect(api.importTemplateTransfer).toHaveBeenLastCalledWith("portable-exact", "reviewed-bytes", "Acta recibida"); expect(imported).toHaveBeenCalledWith(expect.objectContaining({ name: "Acta recibida" }));
});
it("cancelled selection preserves a previous review; invalid next file removes the old confirmation", async () => {
  render(<DocumentTemplateTransferDialog mode={{ kind: "import" }} onClose={vi.fn()} onImported={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de plantilla…" })); await screen.findByLabelText("Nombre en tu catálogo");
  api.pickTemplateTransfer.mockResolvedValueOnce({ status: "cancelled" }); fireEvent.click(screen.getByRole("button", { name: "Elegir otro archivo…" }));
  expect(await screen.findByRole("status")).toHaveTextContent("cancelada"); expect(screen.getByLabelText("Nombre en tu catálogo")).toHaveValue("Acta");
  api.inspectTemplateTransfer.mockRejectedValueOnce(new Error("Versión futura")); fireEvent.click(screen.getByRole("button", { name: "Elegir otro archivo…" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Versión futura"); expect(screen.getByRole("button", { name: "Importar plantilla" })).toBeDisabled(); expect(api.importTemplateTransfer).not.toHaveBeenCalled();
});
it("export reviews structure before choosing a destination and distinguishes cancellation from save", async () => {
  api.deliverTemplateTransfer.mockResolvedValueOnce({ status: "cancelled" }).mockResolvedValueOnce({ status: "saved", fileName: "Acta compartida.json" });
  render(<DocumentTemplateTransferDialog mode={{ kind: "export", template }} onClose={vi.fn()} onImported={vi.fn()}/>);
  await screen.findByRole("heading", { name: "Acta" }); expect(api.deliverTemplateTransfer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Elegir destino…" })); expect(await screen.findByRole("status")).toHaveTextContent("cancelada");
  expect(screen.queryByText(/guardada como/)).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Elegir destino…" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Acta compartida.json")); expect(screen.getByRole("button", { name: "Volver" })).toBeInTheDocument(); expect(api.deliverTemplateTransfer).toHaveBeenLastCalledWith(template.id, template.revision);
});
it("blocks duplicate import and Escape until the native acknowledgement", async () => {
  let finish!: (value: unknown) => void; api.importTemplateTransfer.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const close = vi.fn();
  render(<DocumentTemplateTransferDialog mode={{ kind: "import" }} onClose={close} onImported={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de plantilla…" })); await screen.findByLabelText("Nombre en tu catálogo");
  const button = screen.getByRole("button", { name: "Importar plantilla" }); fireEvent.click(button); fireEvent.click(button); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(api.importTemplateTransfer).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled(); await act(async () => finish(template));
});
it("cancelling the nested transfer keeps the document name and returns focus to its action", async () => {
  const close = vi.fn(); render(<CreateDocumentDialog open onClose={close} onCreate={vi.fn()}/>);
  await screen.findByRole("option", { name: "Acta" });
  fireEvent.change(screen.getByLabelText("Nombre del documento"), { target: { value: "Documento pendiente" } });
  const open = screen.getByRole("button", { name: "Importar plantilla o catálogo…" }); open.focus(); fireEvent.click(open);
  const transfer = screen.getByRole("dialog", { name: "Importar plantilla" }); fireEvent.keyDown(transfer, { key: "Escape" });
  expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText("Nombre del documento")).toHaveValue("Documento pendiente"); expect(open).toHaveFocus();
});

it("shows included attachments and imports their reviewed payload only after consent",async()=>{
 const resources=[{path:"owned",name:"Ficha.pdf",mimeType:"application/pdf",sha256:"a".repeat(64),bytes:120}];api.inspectTemplateTransfer.mockResolvedValue({...review,resources});api.importTemplateTransfer.mockResolvedValue({...template,markdown:review.markdown});render(<DocumentTemplateTransferDialog mode={{kind:"import"}} onClose={vi.fn()} onImported={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"Elegir archivo de plantilla…"}));expect(await screen.findByText(/Ficha.pdf ·/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Importar plantilla"})).toBeDisabled();expect(api.importTemplateTransfer).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("checkbox",{name:/He revisado los adjuntos/}));fireEvent.click(screen.getByRole("button",{name:"Importar plantilla"}));await waitFor(()=>expect(api.importTemplateTransfer).toHaveBeenCalledWith("portable-exact",review.digest,"Acta",true));
});
