import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { saveDocumentTemplate,prepareDocumentTemplateSource } = vi.hoisted(() => ({ saveDocumentTemplate: vi.fn(),prepareDocumentTemplateSource:vi.fn() }));
vi.mock("../../lib/api/documentTemplates", () => ({ saveDocumentTemplate,prepareDocumentTemplateSource }));
vi.mock("../editor/ReadonlyMarkdownViewer", () => ({ ReadonlyMarkdownViewer: ({ markdown }: { markdown: string }) => <article>{markdown}</article> }));
import { SaveDocumentTemplateDialog } from "./SaveDocumentTemplateDialog";
beforeEach(() => vi.resetAllMocks()); afterEach(cleanup);
it("keeps the captured content and entered fields after failure and allows a single retry", async () => {
  saveDocumentTemplate.mockRejectedValueOnce(new Error("Catálogo no disponible")).mockResolvedValueOnce({ name: "Acta de equipo" });
  const saved = vi.fn(); const source = { name: "Base.md", markdown: "# {{titulo}}\n{{asistentes}}" };
  render(<SaveDocumentTemplateDialog source={source} onClose={vi.fn()} onSaved={saved}/>);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Acta de equipo" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Catálogo no disponible");
  expect(screen.getByLabelText("Nombre")).toHaveValue("Acta de equipo"); expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith("Acta de equipo"));
  expect(saveDocumentTemplate).toHaveBeenLastCalledWith({ name: "Acta de equipo", description: "", markdown: source.markdown });
});
it("blocks duplicate submission and Escape while persistence is pending", async () => {
  let finish!: (value: { name: string }) => void; saveDocumentTemplate.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const close = vi.fn(); render(<SaveDocumentTemplateDialog source={{ name: "Base.md", markdown: "Texto" }} onClose={close} onSaved={vi.fn()}/>);
  const form = screen.getByRole("dialog").querySelector("form")!;
  fireEvent.submit(form); fireEvent.submit(form); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(saveDocumentTemplate).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
  await act(async () => finish({ name: "Base" }));
});
it("reviews and saves the prepared self-contained image snapshot without changing its source",async()=>{
  const source={name:"Marca.md",documentId:"project::Marca.md",markdown:"![Marca](assets/logo.png)"};
  const markdown="![Marca](data:image/png;base64,owned)";
  prepareDocumentTemplateSource.mockResolvedValue({markdown,resources:[{path:"assets/logo.png",bytes:20}],digest:"prepared",preparedAt:"2026-11-01T19:00:00Z"});
  saveDocumentTemplate.mockResolvedValue({name:"Marca"});
  render(<SaveDocumentTemplateDialog source={source} onClose={vi.fn()} onSaved={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Preparar recursos locales"}));
  expect(await screen.findByRole("status")).toHaveTextContent("1 imagen local incluida");
  await screen.findByText(markdown);
  fireEvent.click(screen.getByRole("button",{name:"Guardar plantilla"}));
  await waitFor(()=>expect(saveDocumentTemplate).toHaveBeenCalledWith({name:"Marca",description:"",markdown}));
  expect(source.markdown).toBe("![Marca](assets/logo.png)");
});
it("allows leaving read-only preparation and ignores its late result without saving",async()=>{
  let finish!:(value:unknown)=>void;
  prepareDocumentTemplateSource.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const close=vi.fn();
  const view=render(<SaveDocumentTemplateDialog source={{name:"Marca.md",documentId:"owned::Marca.md",markdown:"Source"}} onClose={close} onSaved={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Preparar recursos locales"}));
  expect(screen.getByRole("button",{name:"Preparando…"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  await act(async()=>finish({markdown:"Late result",resources:[]}));
  expect(saveDocumentTemplate).not.toHaveBeenCalled();
});

it("requires reviewing attachment contents and resets consent for a newly prepared snapshot",async()=>{
 const resource={path:"knownext-template-resource:owned/Memo.txt",name:"Memo.txt",mimeType:"text/plain",byteLength:5,sha256:"a".repeat(64),dataBase64:"b3duZWQ="};const markdown="[Memo](knownext-template-resource:owned/Memo.txt)";prepareDocumentTemplateSource.mockResolvedValue({markdown,resources:[],attachments:[resource],digest:"snapshot",preparedAt:"2026-11-05T12:00:00Z"});saveDocumentTemplate.mockResolvedValue({name:"Base"});render(<SaveDocumentTemplateDialog source={{name:"Base.md",documentId:"owned::Base.md",markdown:"[Memo](Memo.txt)"}} onClose={vi.fn()} onSaved={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"Preparar recursos locales"}));expect(await screen.findByText(/Memo.txt ·/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Guardar plantilla"})).toBeDisabled();fireEvent.click(screen.getByRole("checkbox",{name:/He revisado los adjuntos/}));expect(screen.getByRole("button",{name:"Guardar plantilla"})).toBeEnabled();fireEvent.click(screen.getByRole("button",{name:"Actualizar copia de recursos"}));await waitFor(()=>expect(screen.getByRole("checkbox",{name:/He revisado los adjuntos/})).not.toBeChecked());expect(saveDocumentTemplate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("checkbox",{name:/He revisado los adjuntos/}));fireEvent.click(screen.getByRole("button",{name:"Guardar plantilla"}));await waitFor(()=>expect(saveDocumentTemplate).toHaveBeenCalledWith({name:"Base",description:"",markdown,resources:[resource],reviewedResources:true}));
});
