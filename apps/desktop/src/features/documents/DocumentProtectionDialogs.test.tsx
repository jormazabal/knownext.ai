import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloseDirtyDocumentDialog,
  DocumentFooterActionDialog,
  RecoverableDraftsDialog,
  getDocumentFooterActionCopy,
} from "./DocumentProtectionDialogs";
import type { OrphanDraft } from "../../types/domain";

describe("DocumentProtectionDialogs", () => {
  it("keeps the protection decision and focus after failure, blocking duplicate confirmation and Escape while pending",async()=>{
    let finish!:(value:boolean)=>void;const confirm=vi.fn(()=>new Promise<boolean>(done=>{finish=done;})),cancel=vi.fn();
    render(<DocumentFooterActionDialog open action="update-remote-discard-draft" documentName="Decisiones de producto.md" onCancel={cancel} onConfirm={confirm}/>);
    await userEvent.click(screen.getByRole("button",{name:"Actualizar y descartar"}));
    expect(screen.getByRole("button",{name:"Procesando…"})).toBeDisabled();await userEvent.keyboard("{Escape}");expect(cancel).not.toHaveBeenCalled();
    await act(async()=>finish(false));expect(screen.getByRole("alert")).toHaveTextContent("Se conserva el contenido abierto");
    expect(confirm).toHaveBeenCalledTimes(1);expect(screen.getByRole("button",{name:"Cancelar"})).toHaveFocus();
    await userEvent.keyboard("{Escape}");expect(cancel).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    cleanup();
  });

  it("mantiene la decisión de cierre ante fallo y bloquea Escape o doble envío mientras espera",async()=>{
    const user=userEvent.setup();let finish!:(value:boolean)=>void;
    const save=vi.fn(()=>new Promise<boolean>(done=>{finish=done;})),cancel=vi.fn(),discard=vi.fn();
    render(<CloseDirtyDocumentDialog open documentName="Pendiente.md" onSave={save} onDiscard={discard} onCancel={cancel}/>);
    await user.click(screen.getByRole("button",{name:"Guardar"}));
    expect(screen.getByRole("button",{name:"Guardando…"})).toBeDisabled();await user.keyboard("{Escape}");expect(cancel).not.toHaveBeenCalled();
    await act(async()=>finish(false));expect(screen.getByRole("alert")).toHaveTextContent("El documento sigue abierto");
    expect(screen.getByRole("button",{name:"Guardar"})).toBeEnabled();expect(screen.getByRole("button",{name:"Cancelar"})).toHaveFocus();expect(save).toHaveBeenCalledTimes(1);expect(discard).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");expect(cancel).toHaveBeenCalledTimes(1);expect(discard).not.toHaveBeenCalled();
  });

  it("keeps a handwritten recovery and its error visible after a failed native request", async () => {
    let reject!: (error: string) => void;
    const restore=vi.fn(()=>new Promise<void>((_,fail)=>{reject=fail;})), close=vi.fn(), discard=vi.fn();
    const draft: OrphanDraft={fingerprint:"a".repeat(64),locationRevision:"b".repeat(64),draftKey:"v2_test",documentId:"project::Sketch.knote",projectId:"project",path:"Sketch.knote",name:"Sketch.knote",kind:"handwritten-note",pageCount:2,wordCount:0,createdAt:"2026-10-31T00:00:00Z",draftUpdatedAt:"2026-10-31T00:00:00Z",recoverable:true};
    render(<RecoverableDraftsDialog open drafts={[draft]} onClose={close} onRefresh={vi.fn()} onRestore={restore} onDiscard={discard}/>);
    expect(screen.getByText(/2 páginas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button",{name:"Recrear archivo"}));
    expect(screen.getByRole("button",{name:"Recreando…"})).toBeDisabled();
    await userEvent.keyboard("{Escape}");expect(close).not.toHaveBeenCalled();
    await act(async()=>reject("El destino está ocupado. Se conserva el borrador."));
    expect(screen.getByRole("alert")).toHaveTextContent("El destino está ocupado");
    expect(screen.getByRole("article")).toHaveTextContent("Sketch.knote");
    expect(screen.getByRole("button",{name:"Recrear archivo"})).toBeDisabled();
    await userEvent.click(screen.getByRole("button",{name:"Actualizar"}));
    expect(screen.getByRole("button",{name:"Recrear archivo"})).toBeEnabled();
    expect(restore).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button",{name:"Descartar"}));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog",{name:"Borradores recuperables"})).toBeInTheDocument();
    expect(discard).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  });

  it("forces an explicit choice before closing a dirty document", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const onSave = vi.fn();

    render(
      <CloseDirtyDocumentDialog
        open
        documentName="Notas.md"
        onCancel={onCancel}
        onDiscard={onDiscard}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Cerrar documento con cambios")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Descartar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("uses clear product copy for footer actions that can discard work", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    expect(getDocumentFooterActionCopy("discard-draft", "Notas.md")).toMatchObject({
      title: "Descartar cambios pendientes",
      confirmLabel: "Descartar cambios",
      danger: true,
    });

    render(
      <DocumentFooterActionDialog
        open
        action="update-remote-discard-draft"
        documentName="Notas.md"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Actualizar y perder cambios pendientes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Actualizar y descartar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows recoverable drafts, restores available drafts and blocks unavailable restores", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    const drafts: OrphanDraft[] = [
      {
        draftKey: "draft-1",
        fingerprint: "a".repeat(64),
        locationRevision: "b".repeat(64),
        documentId: "doc-1",
        projectId: "project-1",
        path: "docs/Notas.md",
        name: "Notas.md",
        wordCount: 42,
        createdAt: "2026-06-04T10:00:00.000Z",
        draftUpdatedAt: "2026-06-04T10:15:00.000Z",
        recoverable: true,
      },
      {
        draftKey: "draft-2",
        fingerprint: "c".repeat(64),
        locationRevision: "d".repeat(64),
        documentId: "doc-2",
        projectId: "project-1",
        path: "docs/Borrado.md",
        name: "Borrado.md",
        wordCount: 7,
        createdAt: "2026-06-04T10:00:00.000Z",
        draftUpdatedAt: "2026-06-04T10:20:00.000Z",
        recoverable: false,
        reason: "La carpeta destino ya no existe.",
      },
      {
        draftKey: "draft-3",
        fingerprint: "e".repeat(64),
        locationRevision: "f".repeat(64),
        documentId: "project-1::docs/Retirable.md",
        projectId: "project-1",
        path: "docs/Retirable.md",
        name: "Retirable.md",
        wordCount: 12,
        createdAt: "2026-06-04T10:00:00.000Z",
        draftUpdatedAt: "2026-06-04T10:20:00.000Z",
        recoverable: true,
      },
    ];

    render(
      <RecoverableDraftsDialog
        open
        drafts={drafts}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onRestore={onRestore}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText("Borradores recuperables")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();
    expect(screen.getByText("Borrado.md")).toBeInTheDocument();

    const restoreButtons = screen.getAllByRole("button", { name: "Recrear archivo" });
    expect(restoreButtons[1]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Descartar" })[1]).toBeDisabled();

    await user.click(restoreButtons[0]);
    await user.click(screen.getAllByRole("button", { name: "Descartar" })[2]);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Descartar borrador definitivamente" })).toHaveTextContent("Retirable.md");
    await user.click(screen.getByRole("button", { name: "Descartar definitivamente" }));

    expect(onRestore).toHaveBeenCalledWith(drafts[0]);
    expect(onDiscard).toHaveBeenCalledWith(drafts[2]);
  });
});
