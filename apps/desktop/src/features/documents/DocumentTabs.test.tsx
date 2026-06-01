import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTabs } from "./DocumentTabs";

const tabs = [
  { kind: "document" as const, id: "doc-a", name: "Acta.md" },
  { kind: "document" as const, id: "doc-b", name: "Esquemas.md" },
];

describe("DocumentTabs", () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  });

  it("shows a compact navigation opener when provided", async () => {
    const onOpenNavigation = vi.fn();

    const { unmount } = render(
      <DocumentTabs
        tabs={tabs}
        activeTabId="doc-a"
        dirtyDocumentIds={[]}
        onOpenNavigation={onOpenNavigation}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Abrir panel de documentos"));

    expect(onOpenNavigation).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows an orange dirty marker instead of the close icon on any dirty tab", async () => {
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={tabs}
        activeTabId="doc-a"
        dirtyDocumentIds={["doc-b"]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    const dirtyCloseTarget = screen.getByLabelText("Cerrar Esquemas.md, con cambios sin guardar");
    expect(dirtyCloseTarget.querySelector(".bg-brand-orange")).toBeInTheDocument();
    expect(dirtyCloseTarget.querySelector(".lucide-x")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cerrar Acta.md").querySelector(".lucide-x")).toBeInTheDocument();

    await userEvent.click(dirtyCloseTarget);

    expect(onCloseTab).toHaveBeenCalledWith("doc-b");
  });

  it("shows and closes release notes without a dirty marker", async () => {
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={[...tabs, { kind: "release-notes", id: "app-release-notes", name: "Notas de release", utilityTabId: "release-notes", readonly: true }]}
        activeTabId="app-release-notes"
        dirtyDocumentIds={["app-release-notes"]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    expect(screen.getByText("Notas de release")).toBeInTheDocument();
    expect(screen.getByLabelText("Cerrar Notas de release").querySelector(".bg-brand-orange")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cerrar Notas de release"));

    expect(onCloseTab).toHaveBeenCalledWith("app-release-notes");
  });

  it("shows fixed utility tabs as icon-only tabs without close controls", () => {
    const onCloseTab = vi.fn();

    const { container } = render(
      <DocumentTabs
        tabs={[
          { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
          { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
          ...tabs,
        ]}
        activeTabId="user-notes"
        dirtyDocumentIds={["user-notes"]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    expect(screen.getByLabelText("IA")).toHaveTextContent("");
    expect(screen.getByLabelText("IA")).toHaveAttribute("data-tooltip", "IA");
    expect(screen.getByLabelText("Notas")).toHaveTextContent("");
    expect(screen.getByLabelText("Notas")).toHaveAttribute("data-tooltip", "Notas");
    expect(screen.queryByLabelText("Cerrar Notas")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cerrar IA")).not.toBeInTheDocument();
    expect(container.querySelector(".overflow-x-hidden [aria-label='IA']")).not.toBeInTheDocument();
    expect(container.querySelector(".overflow-x-hidden [aria-label='Notas']")).not.toBeInTheDocument();
    expect(onCloseTab).not.toHaveBeenCalled();
  });

  it("shows reference documents as closable read-only tabs", async () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={[...tabs, { kind: "reference-document", id: "ref-budget", name: "Presupuesto.xlsx", path: "Presupuesto.xlsx", format: "xlsx", readonly: true }]}
        activeTabId="ref-budget"
        dirtyDocumentIds={["ref-budget"]}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />,
    );

    await userEvent.click(screen.getByText("Presupuesto.xlsx"));

    expect(onSelectTab).toHaveBeenCalledWith("ref-budget");
    expect(screen.getByLabelText("Cerrar Presupuesto.xlsx").querySelector(".bg-brand-orange")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cerrar Presupuesto.xlsx"));

    expect(onCloseTab).toHaveBeenCalledWith("ref-budget");
  });

  it("shows close options from the secondary-button tab menu for closeable tabs", async () => {
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={[
          ...tabs,
          { kind: "reference-document", id: "ref-budget", name: "Presupuesto.xlsx", path: "Presupuesto.xlsx", format: "xlsx", readonly: true },
        ]}
        activeTabId="doc-a"
        dirtyDocumentIds={[]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText("Esquemas.md"), { clientX: 80, clientY: 24 });

    expect(screen.getByRole("menu", { name: "Opciones de pestaña" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cerrar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Cerrar otras pestañas" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Cerrar todas las pestañas" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "Cerrar otras pestañas" }));

    expect(onCloseTab).toHaveBeenCalledTimes(2);
    expect(onCloseTab).toHaveBeenNthCalledWith(1, "doc-a");
    expect(onCloseTab).toHaveBeenNthCalledWith(2, "ref-budget");
  });

  it("does not show the secondary-button tab menu for fixed utility tabs", () => {
    render(
      <DocumentTabs
        tabs={[
          { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
          { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
          ...tabs,
        ]}
        activeTabId="doc-a"
        dirtyDocumentIds={[]}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText("IA"), { clientX: 80, clientY: 24 });
    fireEvent.contextMenu(screen.getByLabelText("Notas"), { clientX: 80, clientY: 24 });

    expect(screen.queryByRole("menu", { name: "Opciones de pestaña" })).not.toBeInTheDocument();
  });

  it("reorders document tabs with drag and drop without making fixed tabs draggable", () => {
    const onReorderDocumentTabs = vi.fn();
    const dataTransfer = createDataTransfer();
    const releaseNotesDataTransfer = createDataTransfer();
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 36,
      width: 160,
      height: 36,
      toJSON: () => ({}),
    });

    try {
      render(
        <DocumentTabs
          tabs={[
            { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
            { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
            ...tabs,
            { kind: "release-notes", id: "app-release-notes", name: "Notas de release", utilityTabId: "release-notes", readonly: true },
          ]}
          activeTabId="doc-a"
          dirtyDocumentIds={[]}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onReorderDocumentTabs={onReorderDocumentTabs}
        />,
      );

      expect(screen.getByLabelText("IA")).toHaveAttribute("draggable", "false");
      expect(screen.getByLabelText("Notas")).toHaveAttribute("draggable", "false");
      expect(screen.getByLabelText("Acta.md")).toHaveAttribute("draggable", "true");
      expect(screen.getByLabelText("Acta.md")).toHaveClass("cursor-default");
      expect(screen.getByLabelText("Notas de release")).toHaveAttribute("draggable", "true");

      fireEvent.dragStart(screen.getByLabelText("Esquemas.md"), { dataTransfer });
      fireEvent.dragOver(screen.getByLabelText("Acta.md"), { dataTransfer, clientX: 120 });
      fireEvent.drop(screen.getByLabelText("Acta.md"), { dataTransfer, clientX: 120 });

      expect(onReorderDocumentTabs).toHaveBeenCalledWith("doc-b", "doc-a", "after");

      onReorderDocumentTabs.mockClear();
      fireEvent.dragStart(screen.getByLabelText("Notas de release"), { dataTransfer: releaseNotesDataTransfer });
      fireEvent.dragOver(screen.getByLabelText("Acta.md"), { dataTransfer: releaseNotesDataTransfer, clientX: 120 });
      fireEvent.drop(screen.getByLabelText("Acta.md"), { dataTransfer: releaseNotesDataTransfer, clientX: 120 });

      expect(onReorderDocumentTabs).toHaveBeenCalledWith("app-release-notes", "doc-a", "after");
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("shows overflow controls and a vertical tab list when open tabs do not fit", async () => {
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return String(this.className).includes("overflow-x-hidden") ? 1200 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return String(this.className).includes("overflow-x-hidden") ? 320 : 0;
      },
    });

    try {
      const onSelectTab = vi.fn();
      render(
        <DocumentTabs
          tabs={[
            ...tabs,
            { kind: "document", id: "doc-c", name: "API publica.md" },
            { kind: "reference-document", id: "ref-xlsx", name: "Datos.xlsx", path: "Datos.xlsx", format: "xlsx", readonly: true },
            { kind: "reference-document", id: "ref-docx", name: "Informe.docx", path: "Informe.docx", format: "docx", readonly: true },
          ]}
          activeTabId="doc-c"
          dirtyDocumentIds={[]}
          onSelectTab={onSelectTab}
          onCloseTab={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Mostrar pestañas abiertas")).toBeInTheDocument();
      expect(screen.getByLabelText("Pestaña anterior")).toBeInTheDocument();
      expect(screen.getByLabelText("Pestaña siguiente")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Pestaña siguiente"));
      await userEvent.click(screen.getByLabelText("Pestaña anterior"));

      expect(onSelectTab).toHaveBeenNthCalledWith(1, "ref-xlsx");
      expect(onSelectTab).toHaveBeenNthCalledWith(2, "doc-b");

      await userEvent.click(screen.getByLabelText("Mostrar pestañas abiertas"));

      expect(screen.getAllByText("Datos.xlsx").length).toBeGreaterThan(1);
      expect(screen.getAllByText("Informe.docx").length).toBeGreaterThan(1);
    } finally {
      if (scrollWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", scrollWidthDescriptor);
      }
      if (clientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
      }
    }
  });

  it("uses a compact tab switcher in narrow responsive mode", async () => {
    mockCompactTabsMode(true);
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={[
          { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
          { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
          ...tabs,
          { kind: "reference-document", id: "ref-budget", name: "Presupuesto.xlsx", path: "Presupuesto.xlsx", format: "xlsx", readonly: true },
        ]}
        activeTabId="doc-b"
        dirtyDocumentIds={["doc-b"]}
        onOpenNavigation={vi.fn()}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />,
    );

    expect(screen.getByLabelText("Abrir panel de documentos")).toBeInTheDocument();
    expect(screen.getByLabelText("IA")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toBeInTheDocument();
    expect(screen.getByLabelText("Documento activo Esquemas.md")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar archivos abiertos, activo Esquemas.md")).toBeInTheDocument();
    const closeActiveTab = screen.getByLabelText("Cerrar Esquemas.md, con cambios sin guardar");
    const openDocuments = screen.getByLabelText("Mostrar archivos abiertos, activo Esquemas.md");
    expect(closeActiveTab.compareDocumentPosition(openDocuments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Acta.md")).not.toBeInTheDocument();
    expect(screen.queryByText("Presupuesto.xlsx")).not.toBeInTheDocument();

    await userEvent.click(closeActiveTab);

    expect(onCloseTab).toHaveBeenCalledWith("doc-b");
    expect(screen.queryByRole("dialog", { name: "Archivos abiertos" })).not.toBeInTheDocument();

    await userEvent.click(openDocuments);

    expect(screen.getByRole("dialog", { name: "Archivos abiertos" })).toBeInTheDocument();
    expect(screen.getByText("Acta.md")).toBeInTheDocument();
    expect(screen.getAllByText("Esquemas.md").length).toBeGreaterThan(1);
    expect(screen.getByText("Presupuesto.xlsx")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Acta.md"));

    expect(onSelectTab).toHaveBeenCalledWith("doc-a");
    expect(screen.queryByRole("dialog", { name: "Archivos abiertos" })).not.toBeInTheDocument();
  });

  it("keeps the current document visible when a fixed tab is active in narrow responsive mode", () => {
    mockCompactTabsMode(true);

    render(
      <DocumentTabs
        tabs={[
          { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
          { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
          ...tabs,
        ]}
        activeTabId="user-notes"
        activeDocumentId="doc-b"
        dirtyDocumentIds={[]}
        onOpenNavigation={vi.fn()}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Notas")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar archivos abiertos, activo Esquemas.md")).toBeInTheDocument();
    expect(screen.queryByText("Acta.md")).not.toBeInTheDocument();
  });
});

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "",
    dropEffect: "",
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  } as unknown as DataTransfer;
}

function mockCompactTabsMode(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}
