import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocalStateReview } from "./LocalStateReview";
import { getLocalStateInventory, resetReviewedLocalState } from "../../lib/api/localState";
import type { LocalStateEntry, LocalStateInventory } from "../../types/localState";

vi.mock("../../lib/api/localState", () => ({getLocalStateInventory: vi.fn(), resetReviewedLocalState: vi.fn()}));
const damaged: LocalStateEntry = {id:"config",name:"Preferencias e IA",filename:"config.json",status:"invalid",message:"El original se conserva",fingerprint:"a".repeat(64),canReset:true};
const inventory = (entries: LocalStateEntry[] = [damaged]): LocalStateInventory => ({entries,checkedAt:"2026-10-31T12:00:00Z",maxFileBytes:8388608});
beforeEach(() => { vi.mocked(getLocalStateInventory).mockReset().mockResolvedValue(inventory()); vi.mocked(resetReviewedLocalState).mockReset(); });
afterEach(cleanup);
it("keeps normal workspace review read-only", async () => {
  render(<LocalStateReview/>);
  expect(await screen.findByText("Preferencias e IA")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Revisar restablecimiento"})).not.toBeInTheDocument();
  expect(screen.getByText(/Guarda tus documentos/)).toBeInTheDocument();
});
it("requires a reviewed confirmation and cancellation preserves the original", async () => {
  render(<LocalStateReview allowReset/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar restablecimiento"}));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("No se borran documentos");
  fireEvent.click(screen.getByRole("button",{name:"Conservar sin cambios"}));
  expect(resetReviewedLocalState).not.toHaveBeenCalled();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("submits the reviewed identity once and distinguishes preservation from reload", async () => {
  let finish!: (result: Awaited<ReturnType<typeof resetReviewedLocalState>>) => void;
  vi.mocked(resetReviewedLocalState).mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  render(<LocalStateReview allowReset/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar restablecimiento"}));
  fireEvent.click(screen.getByRole("button",{name:"Conservar y restablecer"}));
  expect(screen.getByRole("button",{name:"Conservando original…"})).toBeDisabled();
  expect(resetReviewedLocalState).toHaveBeenCalledOnce();expect(resetReviewedLocalState).toHaveBeenCalledWith(damaged);
  vi.mocked(getLocalStateInventory).mockResolvedValue(inventory([{...damaged,status:"healthy",canReset:false}]));
  finish({id:"config",archiveId:"state-1",archivePath:"private/state-recovery/state-1",preservedFingerprint:damaged.fingerprint!,restoredAt:"now"});
  expect(await screen.findByText(/Estado restablecido. Original conservado/)).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
it("retains the confirmation and reports native failure without success", async () => {
  vi.mocked(resetReviewedLocalState).mockRejectedValue(new Error("El estado cambió desde la revisión"));
  render(<LocalStateReview allowReset/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar restablecimiento"}));
  fireEvent.click(screen.getByRole("button",{name:"Conservar y restablecer"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("El estado cambió");
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(screen.queryByText(/Estado restablecido/)).not.toBeInTheDocument();
});
it("does not offer reset for unavailable files, future versions or project registry", async () => {
  vi.mocked(getLocalStateInventory).mockResolvedValue(inventory([{...damaged,status:"unavailable",canReset:false},{...damaged,id:"projects",name:"Registro de proyectos",canReset:false},{...damaged,id:"export",name:"Plantilla futura",canReset:false}]));
  render(<LocalStateReview allowReset/>);
  expect(await screen.findByText("Registro de proyectos")).toBeInTheDocument();
  expect(screen.getByText(/Las carpetas de documentos permanecen/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Revisar restablecimiento"})).not.toBeInTheDocument();
});
it("retries failed inventory without presenting an empty healthy installation", async () => {
  vi.mocked(getLocalStateInventory).mockRejectedValueOnce(new Error("Permiso denegado"));
  render(<LocalStateReview/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Permiso denegado");
  fireEvent.click(screen.getByRole("button",{name:"Actualizar revisión"}));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(await screen.findByText("Preferencias e IA")).toBeInTheDocument();
});
