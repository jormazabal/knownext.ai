import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AiResultReviewDialog } from "./AiResultReviewDialog";
import type { AiResultReviewEntry } from "./useAiResultReview";
vi.mock("../editor/ReadonlyMarkdownViewer", () => ({ ReadonlyMarkdownViewer: ({ markdown, ariaLabel }: { markdown: string; ariaLabel: string }) => <article aria-label={ariaLabel}>{markdown}</article> }));
afterEach(cleanup);
it("previews a retained raster locally and copies its output identity", async () => {
  const callbacks=props();
  const imageEntry: AiResultReviewEntry={...entry,result:{...entry.result,outputs:[{id:"image",kind:"image",format:"png",dataBase64:"iVBORw0KGgo=",name:"Imagen generada",summary:"Un diagrama raster"}]}};
  render(<AiResultReviewDialog {...callbacks} entries={[imageEntry]}/>);
  expect(screen.getByRole("img",{name:"Un diagrama raster"})).toHaveAttribute("src","data:image/png;base64,iVBORw0KGgo=");
  await userEvent.setup().click(screen.getByRole("button",{name:"Guardar copia"}));
  expect(callbacks.onCopy).toHaveBeenCalledWith(entry.result.id,"image");
});
const entry: AiResultReviewEntry = { stored: true, result: { id: "project:result", projectId: "project", projectName: "QA project", receivedAt: "2026-10-31T10:00:00Z", reason: "New typing is preserved", answer: "Output explanation", outputs: [{ id: "output", kind: "markdown", markdown: "Generated text", name: "Proposed document", summary: "Edit" }], appliedPaths: ["Created.md"] } };
function props() { return { entries: [entry], warnings: [], error: null, busy: false, onClose: vi.fn(), onCopy: vi.fn().mockResolvedValue("New copy.md"), onRemove: vi.fn().mockResolvedValue(undefined), onRetry: vi.fn().mockResolvedValue(undefined), onReload: vi.fn().mockResolvedValue(undefined) }; }
it("reviews read-only output and reports a copy without replacing the source", async () => {
  const callbacks = props(); render(<AiResultReviewDialog {...callbacks}/>); const user = userEvent.setup();
  expect(screen.getByRole("article", { name: "Proposed document" })).toHaveTextContent("Generated text"); expect(screen.getByText("Created.md")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Guardar copia" })); expect(callbacks.onCopy).toHaveBeenCalledWith(entry.result.id, "output"); expect(await screen.findByText("Copia guardada: New copy.md")).toBeInTheDocument();
});
it("describes retained copies without claiming they are all pending or reapplied", () => {
  render(<AiResultReviewDialog {...props()}/>);
  expect(screen.getByRole("dialog",{name:"Resultados IA conservados"})).toBeInTheDocument();expect(screen.getByText(/Pueden corresponder a cambios ya aplicados/)).toBeInTheDocument();expect(screen.getByText(/no se reaplican al abrirlas/)).toBeInTheDocument();
});
it("requires an explicit remove decision and restores focus after closing", async () => {
  const callbacks = props(); const user = userEvent.setup(); const button = document.createElement("button"); document.body.append(button); button.focus();
  const view = render(<AiResultReviewDialog {...callbacks}/>);
  await user.click(screen.getByRole("button", { name: "Quitar de la revisión…" })); expect(callbacks.onRemove).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancelar" })); expect(callbacks.onRemove).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Quitar de la revisión…" })); await user.click(screen.getByRole("button", { name: "Quitar resultado" })); expect(callbacks.onRemove).toHaveBeenCalledWith(entry.result.id);
  view.unmount(); expect(button).toHaveFocus(); button.remove();
});
it("exposes failure and session-only retention, and blocks close during a copy", () => {
  const callbacks = props(); render(<AiResultReviewDialog {...callbacks} busy entries={[{ ...entry, stored: false, error: "Preservation failed" }]} error="Copy failed"/>);
  expect(screen.getAllByRole("alert")).toHaveLength(2); expect(screen.getByText(/Solo en esta sesión/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Guardar copia" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(callbacks.onClose).not.toHaveBeenCalled();
});
it("offers a retry when the initial list is empty or failed", () => {
  const callbacks=props(); render(<AiResultReviewDialog {...callbacks} entries={[]} error="Read failed"/>);
  fireEvent.click(screen.getByRole("button", {name:"Actualizar"})); expect(callbacks.onReload).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", {name:"Cerrar resultados"})).toBeEnabled();
});
